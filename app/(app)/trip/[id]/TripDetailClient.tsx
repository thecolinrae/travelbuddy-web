'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Plus, Share2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ShareModal } from '@/components/trip/ShareModal';
import { TripEditModal } from '@/components/trip/TripEditModal';
import { DayTab } from '@/components/trip/DayTab';
import { buildDayRange } from '@/components/trip/day/utils';
import { TimelineTab } from '@/components/trip/TimelineTab';
import { FlightsTab } from '@/components/trip/FlightsTab';
import { SpendTab } from '@/components/trip/SpendTab';
import { MapTab } from '@/components/trip/MapTab';
import { ActivitiesTab } from '@/components/trip/ActivitiesTab';
import { DocumentsTab } from '@/components/trip/DocumentsTab';
import { NotesTab } from '@/components/trip/NotesTab';
import type { ArtifactInfo } from '@/components/trip/DocumentsTab';
import type { TimelineEvent, Activity, BudgetItemCategory } from '@/types';

type TabId =
  | 'day'
  | 'timeline'
  | 'flights'
  | 'spend'
  | 'map'
  | 'activities'
  | 'documents'
  | 'notes';

function buildTabs(status: string) {
  return [
    { id: 'day' as const,         label: status === 'active' ? 'Today' : 'Day' },
    { id: 'flights' as const,     label: 'Flights'     },
    { id: 'spend' as const,       label: 'Spend'       },
    { id: 'map' as const,         label: 'Map'         },
    { id: 'activities' as const,  label: 'Activities'  },
    { id: 'documents' as const,   label: 'Documents'   },
    { id: 'notes' as const,       label: 'Notes'       },
  ];
}

interface TripData {
  id: string;
  name: string;
  destination: string;
  destinations: string[];
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverEmoji: string;
  coverPhotoUrl: string | null;
  itineraryMd: string | null;
  notes: string | null;
  budgetGoal: number | null;
  categoryGoals: Partial<Record<BudgetItemCategory, number>> | null;
  preferredCurrency: string;
}

interface Props {
  trip: TripData;
  timeline: TimelineEvent[];
  activities: Activity[];
  artifacts: ArtifactInfo[];
  isOwner: boolean;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  if (start && end && start !== end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt((start ?? end)!);
}

export function TripDetailClient({ trip, timeline, activities: initialActivities, artifacts, isOwner }: Props) {
  const router = useRouter();
  const TABS = buildTabs(trip.status);
  const [activeTab, setActiveTab] = useState<TabId>('day');
  const [activities, setActivities] = useState(initialActivities);

  // Sync when router.refresh() delivers updated server data (e.g. after ActivitiesTab saves)
  useEffect(() => { setActivities(initialActivities); }, [initialActivities]);

  const days = useMemo(
    () => buildDayRange(trip.startDate, trip.endDate, timeline, activities),
    [trip.startDate, trip.endDate, timeline, activities],
  );
  const [dayIndex, setDayIndex] = useState<number>(() => {
    if (trip.status === 'active') {
      const today = new Date().toISOString().slice(0, 10);
      const idx = days.indexOf(today);
      if (idx !== -1) return idx;
    }
    return 0;
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const destinations =
    trip.destinations?.length > 1
      ? trip.destinations.join(' · ')
      : trip.destination;

  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  const flightCount = timeline.filter(
    (e) => e.type === 'flight' && e.subtype === 'departure',
  ).length;

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      router.push('/');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Cover photo hero */}
      <div className="relative h-48">
        {trip.coverPhotoUrl ? (
          <Image
            src={trip.coverPhotoUrl}
            alt={trip.destination}
            fill
            className="object-cover dark:brightness-75"
            priority
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/60 to-yellow-600" />
        )}
        {/* Gradient scrim for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Back link — top left */}
        <div className="absolute top-4 left-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-sm font-medium transition-colors drop-shadow"
          >
            <ArrowLeft className="h-4 w-4" />
            Trips
          </Link>
        </div>

        {/* Action buttons — top right */}
        <div className="absolute top-4 right-4 flex gap-2">
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="gap-1.5 text-white/90 hover:text-white hover:bg-white/15 border border-white/20"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShareOpen(true)}
              className="gap-1.5 text-white/90 hover:text-white hover:bg-white/15 border border-white/20"
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          )}
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="gap-1.5 text-white/90 hover:text-white hover:bg-white/15 border border-white/20"
          >
            <Link href={`/import?tripId=${trip.id}`}>
              <Plus className="h-4 w-4" />
              Add docs
            </Link>
          </Button>
          {isOwner && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeleteConfirm(true)}
              className="text-white/70 hover:text-white hover:bg-white/15 border border-white/20"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Trip name — bottom left, over photo */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-4">
          <h1 className="font-display font-bold text-3xl text-white leading-tight drop-shadow-md">
            {trip.name}
          </h1>
          {(destinations || dateRange) && (
            <p className="text-white/80 text-sm mt-1 drop-shadow">
              {[destinations, dateRange].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Yellow accent bar + tab navigation */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="h-1 bg-primary" />
        <div className="overflow-x-auto">
          <div className="flex max-w-4xl mx-auto px-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-text-base'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
                {tab.id === 'flights' && flightCount > 0 && (
                  <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                    {flightCount}
                  </span>
                )}
                {tab.id === 'documents' && artifacts.length > 0 && (
                  <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                    {artifacts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {activeTab === 'day' && (
          <DayTab
            trip={trip}
            tripId={trip.id}
            timeline={timeline}
            activities={activities}
            isOwner={isOwner}
            currentIndex={dayIndex}
            onIndexChange={setDayIndex}
            onViewTimeline={() => setActiveTab('timeline')}
            onActivityUpdate={setActivities}
          />
        )}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <button
              onClick={() => setActiveTab('day')}
              className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-base transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to {trip.status === 'active' ? 'Today' : 'Day'}
            </button>
            <TimelineTab
              tripId={trip.id}
              timeline={timeline}
              activities={activities}
              isOwner={isOwner}
            />
          </div>
        )}
        {activeTab === 'flights' && <FlightsTab timeline={timeline} />}
        {activeTab === 'spend' && (
          <SpendTab
            tripId={trip.id}
            timeline={timeline}
            budgetGoal={trip.budgetGoal}
            categoryGoals={trip.categoryGoals}
            currency={trip.preferredCurrency}
            isOwner={isOwner}
          />
        )}
        {activeTab === 'map' && <MapTab timeline={timeline} />}
        {activeTab === 'activities' && (
          <ActivitiesTab
            tripId={trip.id}
            destination={trip.destination}
            destinations={trip.destinations}
            activities={activities}
            timeline={timeline}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            isOwner={isOwner}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            artifacts={artifacts}
            tripId={trip.id}
            isOwner={isOwner}
          />
        )}
        {activeTab === 'notes' && (
          <NotesTab
            tripId={trip.id}
            notes={trip.notes}
            isOwner={isOwner}
          />
        )}
      </div>

      {/* Modals */}
      {isOwner && (
        <ShareModal tripId={trip.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      )}
      {isOwner && editOpen && (
        <TripEditModal
          tripId={trip.id}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          initial={{
            name: trip.name,
            coverEmoji: trip.coverEmoji,
            destination: trip.destination,
            startDate: trip.startDate,
            endDate: trip.endDate,
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete trip?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{trip.name}</strong> and all its
            timeline events, expenses, activities, and documents. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
