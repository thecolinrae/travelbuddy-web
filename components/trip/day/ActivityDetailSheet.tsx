'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUnmergeActivities } from '@/hooks/use-trip-mutations';
import { tripKeys } from '@/lib/query-keys';
import {
  Loader2, DollarSign, Clock, MapPin, Sun, Users, Sparkles, Info, Pencil, Link2, Unlink,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { toActivityType } from '@/components/trip/activities/activityTypeUtils';
import { ActivityEditModal } from '@/components/trip/activities/ActivityEditModal';
import { MergeActivityModal } from './MergeActivityModal';
import { findMergeCandidates } from '@/services/activityMerge';
import type { Activity, ActivityEvent } from '@/types';
import type { EnrichedActivityResult } from '@/services/claude';

interface ActivityDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: Activity;
  tripId: string;
  activities: Activity[];
  /** ActivityEvents on the same day — used for link/unlink actions */
  timeline?: ActivityEvent[];
  isOwner: boolean;
  onActivityUpdate: (updated: Activity[]) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{children}</p>
  );
}

export function ActivityDetailSheet({
  open,
  onOpenChange,
  activity,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
}: ActivityDetailSheetProps) {
  const queryClient = useQueryClient();
  const unmergeActivities = useUnmergeActivities(tripId);
  const [live, setLive] = useState<Activity>(activity);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Sync live copy when a different activity is opened
  useEffect(() => {
    setLive(activity);
    setEnrichError(null);
  }, [activity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Needs enrichment" when 2+ key fields are absent
  const missingCount =
    (live.description ? 0 : 1) +
    (live.tips ? 0 : 1) +
    (live.bestTime ? 0 : 1) +
    (live.estimatedCost ? 0 : 1) +
    (live.highlights && live.highlights.length > 0 ? 0 : 1);
  const needsEnrich = missingCount >= 2;

  const hasDetails =
    !!live.description ||
    !!live.estimatedCost ||
    !!live.duration ||
    !!live.bestTime ||
    !!live.address ||
    live.familyFriendly !== undefined ||
    !!live.tips ||
    (live.highlights && live.highlights.length > 0);

  // Find candidate events to link to (when not already linked)
  const candidateEvents =
    isOwner && !live.linkedEventId && timeline
      ? findMergeCandidates([live], timeline).map((c) => c.event)
      : [];

  async function handleEnrich() {
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/activities/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: live.name, city: live.city ?? '' }),
      });
      if (!res.ok) throw new Error('Request failed');
      const result: EnrichedActivityResult = await res.json();

      const merged: Activity = {
        ...live,
        description: result.description ?? live.description,
        type: toActivityType(result.type),
        estimatedCost: result.estimatedCost ?? live.estimatedCost,
        duration: result.duration ?? live.duration,
        bestTime: result.bestTime ?? live.bestTime,
        tips: result.tips ?? live.tips,
        familyFriendly: result.familyFriendly ?? live.familyFriendly,
        highlights: result.highlights ?? live.highlights,
        city: result.city ?? live.city,
        address: result.locationAddress ?? live.address,
      };

      setLive(merged);

      const updatedList = activities.map((a) => (a.id === merged.id ? merged : a));
      await fetch(`/api/trips/${tripId}/activities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activities: updatedList }),
      });
      onActivityUpdate(updatedList);
      queryClient.invalidateQueries({ queryKey: tripKeys.activities(tripId) });
    } catch {
      setEnrichError("Couldn't fetch details. Try again.");
    } finally {
      setEnriching(false);
    }
  }

  async function handleUnlink() {
    if (!live.linkedEventId) return;
    setUnlinking(true);
    try {
      await unmergeActivities.mutateAsync({ activityId: live.id, eventId: live.linkedEventId });
      const unlinked = { ...live, linkedEventId: undefined };
      setLive(unlinked);
      const updatedList = activities.map((a) => (a.id === unlinked.id ? unlinked : a));
      onActivityUpdate(updatedList);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="shrink-0 pb-2">
          <SheetTitle className="font-display font-semibold text-xl leading-snug">
            {live.name}
          </SheetTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <CategoryIcon type={live.type} />
            <Badge variant="outline" className="capitalize font-normal text-xs">
              {live.type}
            </Badge>
            {live.city && (
              <span className="type-caption">{live.city}</span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* Description */}
          {live.description && (
            <section className="space-y-1.5">
              <SectionLabel>About</SectionLabel>
              <p className="text-sm leading-relaxed text-text-base">{live.description}</p>
            </section>
          )}

          {/* Quick-facts grid */}
          {(live.estimatedCost || live.duration || live.bestTime || live.address) && (
            <section className="space-y-2">
              <SectionLabel>Details</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                {live.estimatedCost && (
                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
                    <DollarSign className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-muted">Estimated cost</p>
                      <p className="text-sm text-text-base leading-snug">{live.estimatedCost}</p>
                    </div>
                  </div>
                )}
                {live.duration && (
                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
                    <Clock className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-muted">Duration</p>
                      <p className="text-sm text-text-base leading-snug">{live.duration}</p>
                    </div>
                  </div>
                )}
                {live.bestTime && (
                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
                    <Sun className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-muted">Best time</p>
                      <p className="text-sm text-text-base leading-snug">{live.bestTime}</p>
                    </div>
                  </div>
                )}
                {live.address && (
                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-text-muted">Address</p>
                      <p className="text-sm text-text-base leading-snug">{live.address}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Family-friendly */}
          {live.familyFriendly !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-text-muted shrink-0" />
              <span className="text-text-base">
                {live.familyFriendly ? 'Family friendly' : 'Not family friendly'}
              </span>
            </div>
          )}

          {/* Tips */}
          {live.tips && (
            <section className="space-y-1.5">
              <SectionLabel>Tips</SectionLabel>
              <p className="text-sm leading-relaxed text-text-muted italic">{live.tips}</p>
            </section>
          )}

          {/* Highlights */}
          {live.highlights && live.highlights.length > 0 && (
            <section className="space-y-2">
              <SectionLabel>Highlights</SectionLabel>
              <ul className="space-y-1.5">
                {live.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-text-muted">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-text-muted shrink-0" />
                    <span className="leading-relaxed">{h}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Booking link status */}
          {isOwner && live.linkedEventId && (
            <section className="space-y-2">
              <SectionLabel>Booking</SectionLabel>
              <div className="rounded-xl border bg-card px-3 py-2.5 flex items-center gap-2">
                <CategoryIcon type={live.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-base leading-snug">Linked to booking</p>
                  <p className="text-xs text-text-muted">This activity is confirmed</p>
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

          {/* Empty state */}
          {!hasDetails && !needsEnrich && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <Info className="h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-muted">No details yet.</p>
            </div>
          )}

          {/* Re-enrich CTA */}
          {isOwner && needsEnrich && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-text-muted" />
                  <p className="text-sm font-medium text-text-base">Missing some details</p>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Get AI-powered details like tips, cost estimates, and highlights.
                </p>
              </div>
              <Button
                onClick={handleEnrich}
                disabled={enriching}
                className="w-full bg-primary text-primary-foreground hover:bg-primary-dark font-semibold gap-2"
              >
                {enriching
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Getting details…</>
                  : <><Sparkles className="h-4 w-4" /> Get details</>
                }
              </Button>
              {enrichError && (
                <p className="text-xs text-destructive leading-relaxed">{enrichError}</p>
              )}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="shrink-0 border-t pt-4 space-y-2">
            {/* Link to booking — shown when there are matching events and not already linked */}
            {!live.linkedEventId && candidateEvents.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setMergeOpen(true)}
                className="w-full gap-2"
              >
                <Link2 className="h-4 w-4" />
                Link to booking
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="w-full gap-2"
            >
              <Pencil className="h-4 w-4" />
              Edit activity
            </Button>
          </div>
        )}
      </SheetContent>

      {editOpen && (
        <ActivityEditModal
          activity={live}
          onSave={async (updated) => {
            setLive(updated);
            const updatedList = activities.map((a) => (a.id === updated.id ? updated : a));
            await fetch(`/api/trips/${tripId}/activities`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ activities: updatedList }),
            });
            onActivityUpdate(updatedList);
            queryClient.invalidateQueries({ queryKey: tripKeys.activities(tripId) });
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {mergeOpen && candidateEvents[0] && (
        <MergeActivityModal
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          tripId={tripId}
          activity={live}
          event={candidateEvents[0]}
          onMerged={() => {
            const updated = { ...live, linkedEventId: candidateEvents[0].id };
            setLive(updated);
            onActivityUpdate(activities.map((a) => (a.id === updated.id ? updated : a)));
          }}
        />
      )}
    </Sheet>
  );
}
