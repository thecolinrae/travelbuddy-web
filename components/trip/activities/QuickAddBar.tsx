'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, CheckCircle2, X, Clock, DollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from '@/components/trip/activityIcons';
import { nanoid } from '@/services/nanoid';
import { toActivityType } from './activityTypeUtils';
import { cn } from '@/lib/utils';
import type { Activity } from '@/types';
import type { EnrichedActivityResult } from '@/services/claude';

interface QuickAddBarProps {
  tripId: string;
  destinations: string[];
  onAdd: (activity: Activity) => void;
}

export function QuickAddBar({ tripId, destinations, onAdd }: QuickAddBarProps) {
  const multiCity = destinations.length > 1;
  const [input, setInput] = useState('');
  const [selectedCity, setSelectedCity] = useState(destinations[0] ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'preview' | 'error'>('idle');
  const [preview, setPreview] = useState<Activity | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-select city when the user types a destination name in the input
  useEffect(() => {
    if (!multiCity) return;
    const lower = input.toLowerCase();
    const match = destinations.find((d) => lower.includes(d.toLowerCase()));
    if (match) setSelectedCity(match);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLookup() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/trips/${tripId}/activities/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, city: selectedCity }),
      });
      if (!res.ok) throw new Error('Request failed');
      const result: EnrichedActivityResult = await res.json();

      const activity: Activity = {
        id: nanoid(),
        name: result.name ?? trimmed,
        description: result.description ?? '',
        type: toActivityType(result.type),
        estimatedCost: result.estimatedCost,
        duration: result.duration,
        bestTime: result.bestTime,
        tips: result.tips,
        familyFriendly: result.familyFriendly,
        highlights: result.highlights,
        city: result.city ?? selectedCity,
        address: result.locationAddress,
        saved: true,
      };
      setPreview(activity);
      setStatus('preview');
    } catch {
      setErrorMsg("Couldn't fetch details. You can still add it manually.");
      setStatus('error');
    }
  }

  function handleConfirm() {
    if (!preview) return;
    onAdd(preview);
    setInput('');
    setPreview(null);
    setStatus('idle');
  }

  function handleDiscard() {
    setPreview(null);
    setInput('');
    setSelectedCity(destinations[0] ?? '');
    setStatus('idle');
  }

  const isLoading = status === 'loading';
  const isPreview = status === 'preview';

  return (
    <div className="rounded-xl border bg-surface p-3 space-y-3">
      {/* City selector — only shown for multi-destination trips */}
      {multiCity && (
        <div className="flex flex-wrap gap-1.5">
          {destinations.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedCity(d)}
              disabled={isLoading || isPreview}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                selectedCity === d
                  ? 'bg-primary/10 border-primary/50 text-text-base'
                  : 'border-border text-text-muted hover:text-text-base hover:border-border',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && !isPreview && handleLookup()}
          placeholder={multiCity ? `Add an activity in ${selectedCity}` : 'Add an activity — name it or describe it'}
          disabled={isLoading || isPreview}
          className="flex-1"
        />
        <Button
          onClick={handleLookup}
          disabled={!input.trim() || isLoading || isPreview}
          size="sm"
          className="shrink-0 bg-primary text-primary-foreground hover:bg-primary-dark font-semibold"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Error state */}
      {status === 'error' && (
        <p className="text-xs text-destructive leading-relaxed">{errorMsg}</p>
      )}

      {/* Preview card */}
      {isPreview && preview && (
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="flex items-start gap-2">
            <CategoryIcon type={preview.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-text-base leading-snug">{preview.name}</p>
                <Badge variant="outline" className="text-xs font-normal capitalize">
                  {preview.type}
                </Badge>
              </div>
              {preview.city && <p className="type-caption">{preview.city}</p>}
            </div>
            <button
              onClick={handleDiscard}
              className="shrink-0 text-text-muted hover:text-text-base transition-colors"
              aria-label="Discard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {preview.description && (
            <p className="text-sm text-text-muted leading-relaxed line-clamp-2">
              {preview.description}
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {preview.estimatedCost && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <DollarSign className="h-3 w-3" />{preview.estimatedCost}
              </span>
            )}
            {preview.duration && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Clock className="h-3 w-3" />{preview.duration}
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={handleDiscard} className="flex-1">
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary-dark font-semibold gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              Add to list
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
