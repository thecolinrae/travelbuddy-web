/**
 * JSON export service — assembles a TripExportPayload from already-loaded trip data.
 * The payload is the source of truth for both ZIP and Markdown exports.
 */

import type { TimelineEvent, Activity } from '@/types';
import type { TripRow, ArtifactRecord } from '@/services/db';
import type { LegRow } from '@/services/legs';

export const EXPORT_SCHEMA = 'travelbuddy/export/v1' as const;

export interface ArtifactExportMeta {
  id: string;
  fileName: string;
  mimeType: string;
  /** Relative path inside the ZIP: "artifacts/<fileName>" */
  bundlePath: string;
}

export interface TripExportPayload {
  $schema: typeof EXPORT_SCHEMA;
  exportedAt: string;
  trip: TripRow;
  timeline: TimelineEvent[];
  activities: Activity[];
  legs: LegRow[];
  artifacts: ArtifactExportMeta[];
}

export function assembleTripExport(
  trip: TripRow,
  timeline: TimelineEvent[],
  activities: Activity[],
  legs: LegRow[],
  artifacts: ArtifactRecord[],
): TripExportPayload {
  // Track duplicate file names and disambiguate with a suffix
  const fileNameCounts = new Map<string, number>();
  const artifactMeta: ArtifactExportMeta[] = artifacts.map((a) => {
    const count = fileNameCounts.get(a.fileName) ?? 0;
    fileNameCounts.set(a.fileName, count + 1);
    const bundleName = count === 0 ? a.fileName : `${a.id}-${a.fileName}`;
    return {
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      bundlePath: `artifacts/${bundleName}`,
    };
  });

  return {
    $schema: EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    trip: {
      ...trip,
      // Ensure Date objects are serialized as ISO strings
      createdAt: trip.createdAt instanceof Date ? trip.createdAt : new Date(trip.createdAt),
      updatedAt: trip.updatedAt instanceof Date ? trip.updatedAt : new Date(trip.updatedAt),
    },
    timeline,
    activities,
    legs,
    artifacts: artifactMeta,
  };
}
