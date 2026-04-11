'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Trash2, FileText, File, Image, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GmailSyncSection } from '@/components/trip/GmailSyncSection';
import type { LabelSync } from '@/services/db';

export interface ArtifactInfo {
  id: string;
  fileName: string;
  mimeType: string;
  size: number | null;
  createdAt: string;
}

function fileIcon(mimeType: string) {
  if (mimeType === 'application/pdf') return <File className="h-4 w-4 text-red-500" />;
  if (mimeType.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />;
  if (mimeType === 'text/html') return <Mail className="h-4 w-4 text-blue-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  artifacts: ArtifactInfo[];
  tripId: string;
  isOwner: boolean;
  labelSyncs?: LabelSync[];
}

export function DocumentsTab({ artifacts, tripId, isOwner, labelSyncs }: Props) {
  const router = useRouter();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleDownload(artifact: ArtifactInfo) {
    setDownloading(artifact.id);
    try {
      const a = document.createElement('a');
      a.href = `/api/artifacts/${artifact.id}/download`;
      a.download = artifact.fileName;
      a.click();
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(artifact: ArtifactInfo) {
    setDeleting(artifact.id);
    try {
      await fetch(`/api/artifacts/${artifact.id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  if (artifacts.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-surface p-4">
          <FileText className="h-8 w-8 text-text-muted" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-text-base">No documents attached</p>
          <p className="type-caption max-w-xs">Upload booking confirmations or email exports to attach them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {artifacts.length} document{artifacts.length > 1 ? 's' : ''}
      </p>
      <ul className="space-y-2">
        {artifacts.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
          >
            {fileIcon(a.mimeType)}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{a.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(a.size)}
                {a.size ? ' · ' : ''}
                {new Date(a.createdAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload(a)}
              disabled={downloading === a.id}
              className="shrink-0"
            >
              {downloading === a.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>

            {isOwner && confirmDelete !== a.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(a.id)}
                disabled={deleting === a.id}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}

            {isOwner && confirmDelete === a.id && (
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(a)}
                  disabled={deleting === a.id}
                >
                  {deleting === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isOwner && labelSyncs && labelSyncs.length > 0 && (
        <div className="pt-2">
          <GmailSyncSection tripId={tripId} labelSyncs={labelSyncs} />
        </div>
      )}

      <div className="pt-2">
        <a
          href={`/import?tripId=${tripId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          + Add more documents
        </a>
      </div>
    </div>
  );
}
