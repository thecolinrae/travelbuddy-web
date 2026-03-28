'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (text: string, label: string) => void;
}

export function TextPasteModal({ open, onClose, onSubmit }: Props) {
  const [text, setText] = useState('');

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Use first non-empty line as the label (up to 60 chars)
    const label = trimmed.split('\n').find((l) => l.trim()) ?? 'Pasted text';
    onSubmit(trimmed, label.slice(0, 60));
    setText('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste booking text</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="paste-input">
            Paste a forwarded email, booking confirmation, or any travel text
          </Label>
          <textarea
            id="paste-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="Paste your confirmation email or booking text here…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!text.trim()}>
            Add text
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
