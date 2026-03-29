'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Trash2, FileText, File, Image, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}

export function DocumentsTab({ artifacts, tripId, isOwner }: Props) {
  const router = useRouter();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleDownload(artifact: ArtifactInfo) {
    setDownloading(artifact.id);
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/url`);
      const { url } = (await res.json()) as { url: string };
      const a = document.createElement('a');
      a.href = url;
      a.download = artifact.fileName;
      a.target = '_blank';
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
      <div className="py-12 text-center text-muted-foreground text-sm">
        No documents attached to this trip.
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

      <div className="pt-2">
        <a
          href={`/import?tripId=${tripId}`}
          className="text-sm text-primary hover:underline"
        >
          + Add more documents
        </a>
      </div>
    </div>
  );
}
