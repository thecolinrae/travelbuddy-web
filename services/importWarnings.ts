import type {
  TimelineEvent,
  ParsedArtifact,
  ImportWarning,
  FlightDepartureEvent,
  FlightArrivalEvent,
} from '@/types';

/**
 * Run post-import validation on a built timeline and return any warnings
 * that the user should review. Pure function — no side effects.
 *
 * @param timeline   The full timeline after buildTimeline() / mergeTimelines()
 * @param artifacts  The ParsedArtifact array from the LLM (parallel to sourceLabels)
 * @param sourceLabels  File name or email subject per artifact (same index)
 */
export function validateImportedTimeline(
  timeline: TimelineEvent[],
  artifacts: ParsedArtifact[],
  sourceLabels: string[],
): ImportWarning[] {
  const warnings: ImportWarning[] = [];

  // ── 1. Flight time inversion (arrival UTC < departure UTC same journey) ─────
  // Build a map: journeyId → {dep, arr}
  const journeyDep = new Map<string, FlightDepartureEvent>();
  const journeyArr = new Map<string, FlightArrivalEvent>();
  for (const event of timeline) {
    if (event.type !== 'flight' || !event.journeyId) continue;
    if (event.subtype === 'departure') journeyDep.set(event.journeyId, event as FlightDepartureEvent);
    if (event.subtype === 'arrival') journeyArr.set(event.journeyId, event as FlightArrivalEvent);
  }
  for (const [jid, dep] of journeyDep) {
    const arr = journeyArr.get(jid);
    if (!arr || !dep.utcISO || !arr.utcISO) continue;
    if (arr.utcISO < dep.utcISO) {
      warnings.push({
        code: 'flight_time_inversion',
        eventId: arr.id,
        message: `Arrival appears to be before departure — check the date for ${arr.flightNo}.`,
        fields: ['date', 'time'],
      });
    }
  }

  // ── 3. Ground transport type unknown ───────────────────────────────────────
  for (const event of timeline) {
    if (event.type !== 'otherTransportation') continue;
    if (event.transportType === 'other') {
      warnings.push({
        code: 'transport_type_unknown',
        eventId: event.id,
        message: 'Transport type could not be identified — tap Fix to clarify.',
        fields: ['transportType'],
      });
    }
  }

  // ── 4. LLM-flagged uncertain fields ───────────────────────────────────────
  // Match artifacts to timeline events via artifactSources overlap
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    const label = sourceLabels[i];
    if (!artifact.uncertainFields?.length || !label) continue;

    for (const event of timeline) {
      if (!event.artifactSources?.includes(label)) continue;
      // Avoid duplicating warnings already generated above for the same event
      const alreadyWarned = warnings.some((w) => w.eventId === event.id);
      if (alreadyWarned) continue;

      warnings.push({
        code: 'uncertain_field',
        eventId: event.id,
        message: `Some details were inferred: ${artifact.uncertainFields.join(', ')}`,
        fields: artifact.uncertainFields,
      });
      break; // one uncertain_field warning per artifact is enough
    }
  }

  return warnings;
}
