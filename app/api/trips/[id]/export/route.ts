/**
 * Trip export API — GET /api/trips/[id]/export?format=zip|markdown|pdf
 *
 * Exports the trip in the requested format:
 *   zip      — ZIP package with trip.json + uploaded artifact files
 *   markdown — Day-by-day .md file with YAML frontmatter
 *   pdf      — Printable trip binder (cover, quick ref, daily itinerary, budget)
 */

import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, loadActivities, listArtifacts } from '@/services/db';
import { listLegs } from '@/services/legs';
import { downloadArtifact } from '@/services/storage';
import { assembleTripExport } from '@/services/export/json';
import { generateMarkdown } from '@/services/export/markdown';
import { renderTripBinderPdf } from '@/services/export/pdf';
import JSZip from 'jszip';

async function getUserId(): Promise<string | null> {
  const session = await auth();
  return (session as { userId?: string })?.userId ?? null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const trip = await getTrip(id, userId);
  if (!trip) return Response.json({ error: 'Not found' }, { status: 404 });

  const format = new URL(request.url).searchParams.get('format') ?? 'zip';

  const [timeline, activitiesData, artifacts, legRows] = await Promise.all([
    loadTimeline(id),
    loadActivities(id),
    listArtifacts(id),
    listLegs(id),
  ]);

  const activities = activitiesData?.savedActivities ?? [];
  const legs = legRows;
  const payload = assembleTripExport(trip, timeline, activities, legs, artifacts);
  const slug = slugify(trip.name);

  // ── ZIP ──────────────────────────────────────────────────────────────────────
  if (format === 'zip') {
    const zip = new JSZip();

    // Add trip.json — serialize with Date objects as ISO strings
    const tripJson = JSON.stringify(payload, (_, value) =>
      value instanceof Date ? value.toISOString() : value, 2);
    zip.file('trip.json', tripJson);

    // Add artifact files
    const artifactMeta = payload.artifacts;
    await Promise.all(
      artifacts.map(async (artifact, i) => {
        const meta = artifactMeta[i];
        if (!meta) return;
        try {
          const buffer = await downloadArtifact(artifact.storagePath);
          zip.file(meta.bundlePath, buffer);
        } catch {
          // If an artifact can't be fetched, skip it rather than failing the whole export
        }
      }),
    );

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${slug}.zip"`,
        'Content-Length': String(zipBuffer.length),
      },
    });
  }

  // ── Markdown ─────────────────────────────────────────────────────────────────
  if (format === 'markdown') {
    const md = generateMarkdown(payload);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(md);

    return new Response(bytes, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.md"`,
        'Content-Length': String(bytes.length),
      },
    });
  }

  // ── PDF ───────────────────────────────────────────────────────────────────────
  if (format === 'pdf') {
    try {
      const pdfBuffer = await renderTripBinderPdf(payload);
      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${slug}-binder.pdf"`,
          'Content-Length': String(pdfBuffer.length),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : '';
      console.error('[PDF export error]', msg, stack);
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  return Response.json({ error: 'Invalid format. Use ?format=zip|markdown|pdf' }, { status: 400 });
}
