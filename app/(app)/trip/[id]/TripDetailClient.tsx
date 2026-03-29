'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareModal } from '@/components/trip/ShareModal';
import { ItineraryTab } from '@/components/trip/ItineraryTab';
import { TimelineTab } from '@/components/trip/TimelineTab';
import { FlightsTab } from '@/components/trip/FlightsTab';
import { BudgetTab } from '@/components/trip/BudgetTab';
import { ExpensesTab } from '@/components/trip/ExpensesTab';
import { MapTab } from '@/components/trip/MapTab';
import { ActivitiesTab } from '@/components/trip/ActivitiesTab';
import { DocumentsTab } from '@/components/trip/DocumentsTab';
import type { ArtifactInfo } from '@/components/trip/DocumentsTab';
import type { TimelineEvent, Activity, BudgetItemCategory } from '@/types';

const TABS = [
  { id: 'itinerary',   label: 'Itinerary'   },
  { id: 'timeline',    label: 'Timeline'    },
  { id: 'flights',     label: 'Flights'     },
  { id: 'budget',      label: 'Budget'      },
  { id: 'expenses',    label: 'Expenses'    },
  { id: 'map',         label: 'Map'         },
  { id: 'activities',  label: 'Activities'  },
  { id: 'documents',   label: 'Documents'   },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface TripData {
  id: string;
  name: string;
  destination: string;
  destinations: string[];
  startDate: string | null;
  endDate: string | null;
  status: string;
  coverEmoji: string;
  itineraryMd: string | null;
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

export function TripDetailClient({ trip, timeline, activities, artifacts, isOwner }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('itinerary');
  const [shareOpen, setShareOpen] = useState(false);

  const destinations =
    trip.destinations?.length > 1
      ? trip.destinations.join(' · ')
      : trip.destination;

  const dateRange = formatDateRange(trip.startDate, trip.endDate);

  const flightCount = timeline.filter(
    (e) => e.type === 'flight' && e.subtype === 'departure',
  ).length;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Link
                href="/"
                className="text-muted-foreground hover:text-foreground transition-colors mt-1 shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
                  <span>{trip.coverEmoji}</span>
                  <span>{trip.name}</span>
                </h1>
                {(destinations || dateRange) && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {[destinations, dateRange].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {isOwner && (
                <Button size="sm" variant="outline" onClick={() => setShareOpen(true)} className="gap-1.5">
                  <Share2 className="h-4 w-4" />
                  Share
                </Button>
              )}
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/import?tripId=${trip.id}`} className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add docs
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="overflow-x-auto">
          <div className="flex max-w-4xl mx-auto px-4">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
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
        {activeTab === 'itinerary' && <ItineraryTab itineraryMd={trip.itineraryMd} />}
        {activeTab === 'timeline' && <TimelineTab timeline={timeline} />}
        {activeTab === 'flights' && <FlightsTab timeline={timeline} />}
        {activeTab === 'budget' && (
          <BudgetTab
            timeline={timeline}
            budgetGoal={trip.budgetGoal}
            categoryGoals={trip.categoryGoals}
            currency={trip.preferredCurrency}
          />
        )}
        {activeTab === 'expenses' && (
          <ExpensesTab timeline={timeline} currency={trip.preferredCurrency} />
        )}
        {activeTab === 'map' && <MapTab timeline={timeline} />}
        {activeTab === 'activities' && <ActivitiesTab activities={activities} />}
        {activeTab === 'documents' && (
          <DocumentsTab artifacts={artifacts} tripId={trip.id} />
        )}
      </div>

      {isOwner && (
        <ShareModal tripId={trip.id} open={shareOpen} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}
