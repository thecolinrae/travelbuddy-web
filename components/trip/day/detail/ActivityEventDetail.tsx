import { useState } from 'react';
import { DollarSign, Clock, Sun, MapPin, Link2, Unlink, Loader2 } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { MergeActivityModal } from '@/components/trip/day/MergeActivityModal';
import { findMergeCandidates } from '@/services/activityMerge';
import { useQueryClient } from '@tanstack/react-query';
import { useUnmergeActivities } from '@/hooks/use-trip-mutations';
import { tripKeys } from '@/lib/query-keys';
import { SectionLabel, DetailRow } from './shared';
import type { ActivityEvent, Activity } from '@/types';

interface Props {
  event: ActivityEvent;
  tripId?: string;
  activities?: Activity[];
  timeline?: ActivityEvent[];
  isOwner?: boolean;
  onActivityUpdate?: (updated: Activity[]) => void;
  linkedActivity?: Activity;
}

export function ActivityEventDetail({
  event,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
  linkedActivity,
}: Props) {
  const queryClient = useQueryClient();
  const unmergeActivities = useUnmergeActivities(tripId ?? '');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const tips = event.tips || linkedActivity?.tips;
  const highlights = event.highlights?.length ? event.highlights : linkedActivity?.highlights;
  const hasDetails = event.estimatedCost || event.duration || event.bestTime || event.locationAddress;

  const candidateActivities =
    isOwner && !event.linkedActivityId && activities && timeline
      ? findMergeCandidates(activities, [event]).map((c) => c.activity)
      : [];

  async function handleUnlink() {
    if (!event.linkedActivityId || !tripId) return;
    setUnlinking(true);
    try {
      await unmergeActivities.mutateAsync({ activityId: event.linkedActivityId, eventId: event.id });
      if (activities && onActivityUpdate) {
        onActivityUpdate(
          activities.map((a) =>
            a.id === event.linkedActivityId ? { ...a, linkedEventId: undefined } : a,
          ),
        );
      }
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <>
      <SheetHeader className="shrink-0 pb-2">
        <SheetTitle className="font-display font-semibold text-xl leading-snug">
          {event.description}
        </SheetTitle>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <CategoryIcon type={event.category} />
          <Badge variant="outline" className="capitalize font-normal text-xs">{event.category}</Badge>
          {event.locationCity && <span className="type-caption">{event.locationCity}</span>}
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 py-4">
        {hasDetails && (
          <section className="space-y-2">
            <SectionLabel>Details</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {event.estimatedCost && (
                <DetailRow icon={<DollarSign className="h-4 w-4" />} label="Estimated cost" value={event.estimatedCost} />
              )}
              {event.duration && (
                <DetailRow icon={<Clock className="h-4 w-4" />} label="Duration" value={event.duration} />
              )}
              {event.bestTime && (
                <DetailRow icon={<Sun className="h-4 w-4" />} label="Best time" value={event.bestTime} />
              )}
              {event.locationAddress && (
                <DetailRow icon={<MapPin className="h-4 w-4" />} label="Address" value={event.locationAddress} />
              )}
            </div>
          </section>
        )}

        {tips && (
          <section className="space-y-1.5">
            <SectionLabel>Tips</SectionLabel>
            <p className="text-sm text-text-muted leading-relaxed italic">{tips}</p>
          </section>
        )}

        {highlights && highlights.length > 0 && (
          <section className="space-y-2">
            <SectionLabel>Highlights</SectionLabel>
            <ul className="space-y-1.5">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-text-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-text-muted shrink-0" />
                  <span className="leading-relaxed">{h}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.bookingRef && (
          <p className="text-xs text-text-muted">Booking ref: {event.bookingRef}</p>
        )}

        {isOwner && event.linkedActivityId && linkedActivity && (
          <section className="space-y-2">
            <SectionLabel>Planning notes</SectionLabel>
            <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
              <CategoryIcon type={linkedActivity.type} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-base leading-snug truncate">{linkedActivity.name}</p>
                <p className="text-xs text-text-muted">Planned activity</p>
              </div>
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="text-xs text-text-muted hover:text-destructive transition-colors flex items-center gap-1 shrink-0"
              >
                {unlinking
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Unlink className="h-3.5 w-3.5" />
                }
                Unlink
              </button>
            </div>
          </section>
        )}
      </div>

      {isOwner && !event.linkedActivityId && candidateActivities.length > 0 && tripId && (
        <div className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => setMergeOpen(true)} className="w-full gap-2">
            <Link2 className="h-4 w-4" />
            Link to planned activity
          </Button>
        </div>
      )}

      {mergeOpen && candidateActivities[0] && tripId && (
        <MergeActivityModal
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          tripId={tripId}
          activity={candidateActivities[0]}
          event={event}
          onMerged={() => queryClient.invalidateQueries({ queryKey: tripKeys.timeline(tripId!) })}
        />
      )}
    </>
  );
}
