'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';

interface Props {
  tripId: string;
  notes: string | null;
  isOwner: boolean;
}

export function NotesTab({ tripId, notes, isOwner }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/trips/${tripId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft }),
      });
      router.refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(notes ?? '');
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          className="w-full min-h-[300px] rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write your notes in Markdown…"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleDiscard} disabled={saving}>
            Discard
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save notes'}
          </Button>
        </div>
      </div>
    );
  }

  if (!notes) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-muted-foreground text-sm">No notes yet.</p>
        {isOwner && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Add notes
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => { setDraft(notes); setEditing(true); }}>
            Edit notes
          </Button>
        </div>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{notes}</ReactMarkdown>
      </div>
    </div>
  );
}
