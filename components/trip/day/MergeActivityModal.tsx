'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, X, CheckCircle2, DollarSign, Clock, MapPin, Hash, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { fmt12 } from './utils';
import type { Activity, ActivityEvent } from '@/types';
import type { MatchCandidate } from '@/services/activityMerge';

// ─── Merge modal ──────────────────────────────────────────────────────────────

interface MergeActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  activity: Activity;
  event: ActivityEvent;
  onMerged: () => void;
}

export function MergeActivityModal({
  open,
  onOpenChange,
  tripId,
  activity,
  event,
  onMerged,
}: MergeActivityModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleMerge() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/activities/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: activity.id, eventId: event.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? 'Failed to link');
      }
      onMerged();
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Link these together?</DialogTitle>
          <DialogDescription>
            One card will appear on your day view, combining the confirmed booking with your planning notes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center py-2">
          {/* Left: planned activity */}
          <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <CategoryIcon type={activity.type} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-base leading-snug text-sm">{activity.name}</p>
                <Badge variant="outline" className="text-xs font-normal mt-1">Planned</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {activity.estimatedCost && (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <DollarSign className="h-3 w-3" />{activity.estimatedCost}
                </span>
              )}
              {activity.duration && (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="h-3 w-3" />{activity.duration}
                </span>
              )}
              {(activity.address || activity.city) && (
                <span className="flex items-center gap-1 text-xs text-text-muted truncate max-w-[12rem]">
                  <MapPin className="h-3 w-3 shrink-0" />{activity.address ?? activity.city}
                </span>
              )}
            </div>
            {activity.tips && (
              <p className="text-xs text-text-muted italic leading-relaxed line-clamp-2">{activity.tips}</p>
            )}
          </div>

          {/* Center divider */}
          <div className="flex sm:flex-col items-center justify-center gap-1 py-1">
            <div className="hidden sm:block w-px h-6 bg-border" />
            <Link2 className="h-4 w-4 text-text-muted" />
            <div className="hidden sm:block w-px h-6 bg-border" />
            <div className="sm:hidden h-px w-6 bg-border" />
          </div>

          {/* Right: confirmed booking */}
          <div className="rounded-xl border bg-card px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <CategoryIcon type={event.category} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-base leading-snug text-sm">{event.description}</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 mt-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Confirmed booking
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {event.time && (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <Clock className="h-3 w-3" />{fmt12(event.time)}
                </span>
              )}
              {event.bookingRef && (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <Hash className="h-3 w-3" />{event.bookingRef}
                </span>
              )}
              {event.locationAddress && (
                <span className="flex items-center gap-1 text-xs text-text-muted truncate max-w-[12rem]">
                  <MapPin className="h-3 w-3 shrink-0" />{event.locationAddress}
                </span>
              )}
            </div>
          </div>
        </div>

        {activity.scheduledDate && event.date && activity.scheduledDate !== event.date && (
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            These are on different dates ({activity.scheduledDate} vs {event.date}). You can still link them.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-dark gap-2"
            onClick={handleMerge}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Link activities
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inline suggestion chip ───────────────────────────────────────────────────

interface MergeSuggestionChipProps {
  candidate: MatchCandidate;
  tripId: string;
  onDismiss: () => void;
}

export function MergeSuggestionChip({ candidate, tripId, onDismiss }: MergeSuggestionChipProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="rounded-lg border border-dashed bg-surface/50 px-3 py-2 flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
        <p className="text-xs text-text-muted flex-1 leading-snug">
          Matches your booking — <button
            onClick={() => setModalOpen(true)}
            className="font-medium text-green-700 dark:text-green-400 hover:underline"
          >
            Link
          </button>
        </p>
        <button
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
          className="text-text-muted hover:text-text-base transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <MergeActivityModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tripId={tripId}
        activity={candidate.activity}
        event={candidate.event}
        onMerged={() => router.refresh()}
      />
    </>
  );
}
