import { after } from 'next/server';
import { auth } from '@/lib/auth';
import {
  parseDocumentBuffer,
  parseTextContent,
  parseEmailContent,
  parseConcurrent,
  CLAUDE_PARSE_CONCURRENCY,
  suggestActivities,
} from '@/services/claude';
import { submitActivityBatch } from '@/services/batch';
import {
  buildTimeline,
  mergeTimelines,
  extractDestinationsFromTimeline,
} from '@/services/timeline';
import { fetchRatesFromPreferred } from '@/services/currency';
import { preprocessTravelText } from '@/services/preprocess';
import {
  createTrip,
  updateTrip,
  saveTimeline,
  loadTimeline,
  loadActivities,
  saveActivities,
  createArtifactRecord,
  getTrip,
  updateTripCoverPhoto,
} from '@/services/db';
import { prisma } from '@/lib/prisma';
import { autoCreateLegs } from '@/services/legs';
import { uploadArtifact } from '@/services/storage';
import { fetchDestinationPhoto } from '@/services/photos';
import { filterOpenPlaces } from '@/services/places';
import type { ParsedArtifact, Activity, ImportWarning } from '@/types';
import { validateImportedTimeline } from '@/services/importWarnings';
import type { GmailMessage } from '@/services/gmail';

type ProgressEvent =
  | { type: 'progress'; step: string; completed: number; total: number }
  | { type: 'done'; tripId: string; warnings: ImportWarning[] }
  | { type: 'error'; message: string };

type ParseTask =
  | { kind: 'file'; file: File }
  | { kind: 'text'; text: string; index: number }
  | { kind: 'email'; email: GmailMessage };

export async function POST(request: Request) {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll('files') as File[];
  const texts = formData.getAll('texts') as string[];
  const emailsJson = formData.get('emails') as string | null;
  const emails: GmailMessage[] = emailsJson ? (JSON.parse(emailsJson) as GmailMessage[]) : [];
  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { preferredCurrency: true } });
  const currency = profile?.preferredCurrency ?? 'USD';
  const tripId = (formData.get('tripId') as string | null) ?? null;
  const tripName = (formData.get('tripName') as string | null) ?? '';
  const labelId = (formData.get('labelId') as string | null) ?? undefined;
  const labelName = (formData.get('labelName') as string | null) ?? undefined;

  const tasks: ParseTask[] = [
    ...files.map((f) => ({ kind: 'file' as const, file: f })),
    ...texts.filter(Boolean).map((t, i) => ({ kind: 'text' as const, text: t, index: i })),
    ...emails.map((e) => ({ kind: 'email' as const, email: e })),
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (tasks.length === 0) {
          send({ type: 'error', message: 'No documents provided.' });
          return;
        }

        const total = tasks.length;
        send({ type: 'progress', step: 'Starting…', completed: 0, total });

        const allArtifacts: ParsedArtifact[] = [];
        const allSourceLabels: string[] = [];  // parallel to allArtifacts
        let suggestedName = '';
        const allDestinations: string[] = [];
        let overallStartDate = '';
        let overallEndDate = '';

        // Keep file buffers for S3 upload after trip is saved
        const fileBuffers: Array<{ name: string; type: string; buffer: Buffer }> = [];
        for (const file of files) {
          const buf = Buffer.from(await file.arrayBuffer());
          fileBuffers.push({ name: file.name, type: file.type || 'application/octet-stream', buffer: buf });
        }

        const results = await parseConcurrent(
          tasks,
          async (task, i) => {
            const label =
              task.kind === 'email'
                ? task.email.subject.slice(0, 50)
                : task.kind === 'file'
                  ? task.file.name
                  : `Pasted text ${task.index + 1}`;

            send({ type: 'progress', step: `Parsing "${label}"…`, completed: i, total });

            if (task.kind === 'file') {
              const buf = fileBuffers[files.indexOf(task.file)];
              const base64 = buf.buffer.toString('base64');
              const mime = task.file.type || 'application/pdf';

              // Text files are parsed as text content, not binary documents
              if (mime === 'text/plain' || mime === 'text/html') {
                const text = buf.buffer.toString('utf-8');
                return parseTextContent(preprocessTravelText(text));
              }
              return parseDocumentBuffer(base64, mime);
            } else if (task.kind === 'text') {
              return parseTextContent(preprocessTravelText(task.text));
            } else {
              const preprocessed = preprocessTravelText(task.email.body);
              return parseEmailContent(task.email.subject, preprocessed);
            }
          },
          CLAUDE_PARSE_CONCURRENCY,
        );

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const task = tasks[i];
          const label =
            task.kind === 'email'
              ? task.email.subject.slice(0, 50)
              : task.kind === 'file'
                ? task.file.name
                : `Pasted text ${task.index + 1}`;
          if (result.status === 'fulfilled') {
            const r = result.value;
            if (r.artifacts?.length) {
              for (const artifact of r.artifacts) {
                allArtifacts.push(artifact);
                allSourceLabels.push(label);
              }
            }
            if (!suggestedName && r.suggestedTripName) suggestedName = r.suggestedTripName;
            if (r.destinations?.length) allDestinations.push(...r.destinations);
            else if (r.primaryDestination) allDestinations.push(r.primaryDestination);
            if (r.startDate && (!overallStartDate || r.startDate < overallStartDate))
              overallStartDate = r.startDate;
            if (r.endDate && (!overallEndDate || r.endDate > overallEndDate))
              overallEndDate = r.endDate;
          }
        }

        if (allArtifacts.length === 0) {
          send({
            type: 'error',
            message: 'No travel information could be extracted. Please check your documents and try again.',
          });
          return;
        }

        send({ type: 'progress', step: 'Building timeline…', completed: total, total });

        const { rates } = await fetchRatesFromPreferred(currency);
        let timeline = buildTimeline(allArtifacts, undefined, currency, rates);

        if (tripId) {
          const existing = await loadTimeline(tripId);
          if (existing.length > 0) {
            timeline = mergeTimelines(existing, timeline);
          }
        }

        const uniqueDests = [
          ...new Set(
            allDestinations
              .concat(extractDestinationsFromTimeline(timeline))
              .filter(Boolean),
          ),
        ];
        const primaryDestination = uniqueDests[0] ?? '';

        const today = new Date().toISOString().slice(0, 10);
        const status =
          overallEndDate && overallEndDate < today
            ? 'completed'
            : overallStartDate && overallStartDate <= today
              ? 'active'
              : 'upcoming';

        send({ type: 'progress', step: 'Saving trip…', completed: total, total });

        let savedTripId: string;

        if (tripId) {
          const existing = await getTrip(tripId, userId);
          if (!existing) {
            send({ type: 'error', message: 'Trip not found.' });
            return;
          }
          const mergedDests = [...new Set([...(existing.destinations ?? []), ...uniqueDests])];
          await updateTrip(tripId, userId, {
            destinations: mergedDests,
            destination: mergedDests[0] ?? existing.destination,
            ...(overallStartDate && { startDate: overallStartDate }),
            ...(overallEndDate && { endDate: overallEndDate }),
            status,
          });
          savedTripId = tripId;
        } else {
          const trip = await createTrip(userId, {
            name: tripName.trim() || suggestedName || 'My Trip',
            destination: primaryDestination,
            destinations: uniqueDests,
            startDate: overallStartDate || undefined,
            endDate: overallEndDate || undefined,
            status,
            preferredCurrency: currency,
            ownerEmail: (session as { user?: { email?: string } })?.user?.email ?? undefined,
          });
          savedTripId = trip.id;
        }

        await saveTimeline(savedTripId, timeline);

        // Auto-link activity bank entries to matching ActivityEvents (non-fatal)
        try {
          const activitiesData = await loadActivities(savedTripId);
          const savedActivities = activitiesData?.savedActivities ?? [];
          const activityEvents = timeline.filter(
            (e): e is import('@/types').ActivityEvent => e.type === 'activity',
          );
          if (savedActivities.length > 0 && activityEvents.length > 0) {
            const { findMergeCandidates } = await import('@/services/activityMerge');
            const autoMerges = findMergeCandidates(savedActivities, activityEvents).filter(
              (c) => c.autoMerge,
            );
            if (autoMerges.length > 0) {
              for (const { activity, event } of autoMerges) {
                if (!activity.linkedEventId && !event.linkedActivityId) {
                  activity.linkedEventId = event.id;
                  event.linkedActivityId = activity.id;
                }
              }
              await Promise.all([
                saveActivities(savedTripId, activitiesData?.destination ?? '', savedActivities),
                saveTimeline(savedTripId, timeline),
              ]);
            }
          }
        } catch {
          // Auto-merge failure is non-fatal — user can link manually
        }

        // Auto-create transport legs for any new journeyId groups (non-fatal)
        try {
          await autoCreateLegs(savedTripId);
        } catch {
          // Leg creation failure is not fatal — legs can be created manually
        }

        // Upload files to S3 (non-fatal — failures don't break the import)
        for (const { name, type, buffer } of fileBuffers) {
          try {
            const storagePath = await uploadArtifact(buffer, name, type, savedTripId);
            await createArtifactRecord(savedTripId, name, type, storagePath, buffer.length);
          } catch {
            // continue
          }
        }

        // Persist Gmail emails as HTML artifacts so they appear in the Documents tab
        for (const task of tasks) {
          if (task.kind !== 'email') continue;
          try {
            const { email } = task;
            const html = email.htmlBody
              ? email.htmlBody
              : `<!DOCTYPE html><html><body><pre style="white-space:pre-wrap">${
                  email.body.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                }</pre></body></html>`;
            const buffer = Buffer.from(html, 'utf-8');
            const safeName = (email.subject || 'email')
              .replace(/[^\w\s-]/g, '')
              .trim()
              .slice(0, 60) || 'email';
            const fileName = `${safeName}.html`;
            const storagePath = await uploadArtifact(buffer, fileName, 'text/html', savedTripId);
            await createArtifactRecord(savedTripId, fileName, 'text/html', storagePath, buffer.length, {
              gmailMessageId: email.id,
              gmailLabelId: labelId,
              gmailLabelName: labelName,
            });
          } catch {
            // non-fatal
          }
        }

        const importWarnings = validateImportedTimeline(timeline, allArtifacts, allSourceLabels);
        send({ type: 'done', tripId: savedTripId, warnings: importWarnings });

        // Auto-generate activity recommendations for new destinations in the background.
        // Runs after the SSE response is closed so the user is not waiting.
        const _uniqueDests = uniqueDests;
        const _savedTripId = savedTripId;
        const _startDate = overallStartDate;
        const _endDate = overallEndDate;
        const _primaryDestination = primaryDestination;
        const _isNewTrip = !tripId;
        after(async () => {
          try {
            const existing = await loadActivities(_savedTripId);
            const coveredCities = new Set(
              (existing?.savedActivities ?? []).map((a) => a.city).filter(Boolean),
            );
            const newDests = _uniqueDests.filter((d) => !coveredCities.has(d));
            if (newDests.length === 0) return;

            // Submit as an async batch so results arrive via the notifications bell.
            // Fall back to sequential inline generation if batch submission fails.
            try {
              await submitActivityBatch(_savedTripId, userId, newDests, _startDate || '', _endDate || '');
            } catch {
              // Fallback: generate sequentially (original behaviour)
              const allNew: Activity[] = [];
              for (const dest of newDests) {
                const suggestions = await suggestActivities(dest, _startDate || '', _endDate || '');
                const verified = await filterOpenPlaces(suggestions, dest);
                allNew.push(...verified.map((a) => ({ ...a, city: dest, saved: true as const })));
              }
              await saveActivities(_savedTripId, _uniqueDests[0] ?? '', [
                ...(existing?.savedActivities ?? []),
                ...allNew,
              ]);
            }
          } catch {
            // non-fatal — user can still manually refresh via the Activities tab
          }

          // Fetch destination cover photo for newly created trips only
          if (_isNewTrip && _primaryDestination) {
            try {
              const photoUrl = await fetchDestinationPhoto(_primaryDestination);
              if (photoUrl) await updateTripCoverPhoto(_savedTripId, photoUrl);
            } catch {
              // non-fatal
            }
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
