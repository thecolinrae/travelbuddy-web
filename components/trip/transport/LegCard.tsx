'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, Pencil, Scissors, Trash2, Check, X } from 'lucide-react';
import { FlightCard } from '@/components/trip/day/FlightCard';
import { TransportCard } from '@/components/trip/day/TransportCard';
import { SplitAffordance } from './SplitAffordance';
import type { LegWithEvents } from '@/services/legs';
import type {
  TimelineEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
} from '@/types';

function formatGap(aUtc?: string, bUtc?: string): string | null {
  if (!aUtc || !bUtc) return null;
  const ms = new Date(bUtc).getTime() - new Date(aUtc).getTime();
  if (ms <= 0) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Get the "end" UTC time for a transport event (arrival time if available, otherwise departure). */
function eventEndUtc(e: TimelineEvent): string | undefined {
  return e.utcISO;
}

interface Props {
  leg: LegWithEvents;
  tripId: string;
  isOwner: boolean;
  legOptions: LegWithEvents[];
  onSplit: (legId: string, atEventId: string) => Promise<void>;
  onRename: (legId: string, name: string) => Promise<void>;
  onDelete: (legId: string) => Promise<void>;
  onAssignEvent: (eventId: string) => Promise<void>;
}

export function LegCard({
  leg,
  isOwner,
  onSplit,
  onRename,
  onDelete,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(leg.name ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [splittingAt, setSplittingAt] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync rename value if leg name changes externally
  useEffect(() => {
    if (!isRenaming) setRenameValue(leg.name ?? '');
  }, [leg.name, isRenaming]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function commitRename() {
    const name = renameValue.trim();
    if (name && name !== leg.name) await onRename(leg.id, name);
    setIsRenaming(false);
  }

  function startRename() {
    setRenameValue(leg.name ?? '');
    setIsRenaming(true);
    setMenuOpen(false);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  }

  async function handleSplit(atEventId: string) {
    setSplittingAt(atEventId);
    try {
      await onSplit(leg.id, atEventId);
    } finally {
      setSplittingAt(null);
    }
  }

  const displayName = leg.name ?? 'Unnamed leg';

  return (
    <div className="space-y-3">
      {/* Leg header */}
      <div className="flex items-center gap-2">
        {isRenaming ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              className="flex-1 min-w-0 font-display font-semibold text-base bg-transparent border-b border-primary outline-none pb-0.5"
            />
            <button
              onClick={commitRename}
              className="text-text-muted hover:text-text-base transition-colors"
              aria-label="Confirm rename"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsRenaming(false)}
              className="text-text-muted hover:text-text-base transition-colors"
              aria-label="Cancel rename"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display font-semibold text-base leading-snug flex-1 min-w-0 truncate">
              {displayName}
            </h2>
            {isOwner && (
              <>
                <button
                  onClick={startRename}
                  className="shrink-0 text-text-muted hover:text-text-base transition-colors"
                  aria-label="Rename leg"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <div className="relative shrink-0" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="text-text-muted hover:text-text-base transition-colors"
                    aria-label="Leg options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 top-6 z-20 w-40 rounded-lg border bg-card shadow-md py-1">
                      <button
                        onClick={startRename}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-base hover:bg-surface transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 text-text-muted" />
                        Rename
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); onDelete(leg.id); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-surface transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete leg
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Events list */}
      {leg.events.length === 0 ? (
        <p className="type-caption text-text-muted py-2">No events in this leg.</p>
      ) : (
        <div className="space-y-0">
          {leg.events.map((event, idx) => {
            const next = leg.events[idx + 1];
            const gap = next ? formatGap(eventEndUtc(event), eventEndUtc(next)) : null;

            return (
              <div key={event.id}>
                <EventRow event={event} />
                {isOwner && next && (
                  <SplitAffordance
                    gap={gap}
                    splitting={splittingAt === next.id}
                    onSplit={() => handleSplit(next.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: TimelineEvent }) {
  if (event.type === 'flight') {
    return (
      <FlightCard
        event={event as FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent}
      />
    );
  }
  if (event.type === 'otherTransportation') {
    return (
      <TransportCard
        event={event as TransportDepartureEvent | TransportArrivalEvent}
      />
    );
  }
  return null;
}
