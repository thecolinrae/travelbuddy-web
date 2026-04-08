'use client';

import { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface Share {
  sharedWithEmail: string;
  createdAt: string;
}

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
}

export function ShareModal({ tripId, open, onClose }: Props) {
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/trips/${tripId}/shares`)
      .then((r) => r.json())
      .then((result: { data?: Share[] }) => setShares(result.data ?? []))
      .catch(() => toast.error('Failed to load shares'))
      .finally(() => setLoading(false));
  }, [open, tripId]);

  async function handleShare() {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      toast.success(`Shared with ${email.trim()}`);
      setShares((prev) => [...prev, { sharedWithEmail: email.trim().toLowerCase(), createdAt: new Date().toISOString() }]);
      setEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(sharedEmail: string) {
    setRemoving(sharedEmail);
    try {
      await fetch(`/api/trips/${tripId}/shares`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sharedEmail }),
      });
      setShares((prev) => prev.filter((s) => s.sharedWithEmail !== sharedEmail));
    } catch {
      toast.error('Failed to remove');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share trip</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="share-email">Invite by email</Label>
          <div className="flex gap-2">
            <Input
              id="share-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleShare()}
            />
            <Button onClick={handleShare} disabled={submitting || !email.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            They&apos;ll see this trip when they sign in with that email.
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && shares.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Shared with
            </p>
            <ul className="space-y-1.5">
              {shares.map((s) => (
                <li
                  key={s.sharedWithEmail}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm truncate">{s.sharedWithEmail}</span>
                  <button
                    onClick={() => handleRemove(s.sharedWithEmail)}
                    disabled={removing === s.sharedWithEmail}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-2 shrink-0"
                  >
                    {removing === s.sharedWithEmail ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
