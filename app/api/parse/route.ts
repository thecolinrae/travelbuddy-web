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
import { uploadArtifact } from '@/services/storage';
import { fetchDestinationPhoto } from '@/services/photos';
import type { ParsedArtifact, Activity } from '@/types';
import type { GmailMessage } from '@/services/gmail';

type ProgressEvent =
  | { type: 'progress'; step: string; completed: number; total: number }
  | { type: 'done'; tripId: string }
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
  const currency = (formData.get('currency') as string | null) ?? 'USD';
  const tripId = (formData.get('tripId') as string | null) ?? null;
  const tripName = (formData.get('tripName') as string | null) ?? '';

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

        for (const result of results) {
          if (result.status === 'fulfilled') {
            const r = result.value;
            if (r.artifacts?.length) allArtifacts.push(...r.artifacts);
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
            await createArtifactRecord(savedTripId, fileName, 'text/html', storagePath, buffer.length);
          } catch {
            // non-fatal
          }
        }

        send({ type: 'done', tripId: savedTripId });

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

            const allNew: Activity[] = [];
            for (const dest of newDests) {
              const suggestions = await suggestActivities(dest, _startDate || '', _endDate || '');
              allNew.push(...suggestions.map((a) => ({ ...a, city: dest, saved: true as const })));
            }
            await saveActivities(_savedTripId, _uniqueDests[0] ?? '', [
              ...(existing?.savedActivities ?? []),
              ...allNew,
            ]);
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
