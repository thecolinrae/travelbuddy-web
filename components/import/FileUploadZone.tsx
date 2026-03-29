'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.html';
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/html',
]);

interface Props {
  onFiles: (files: File[]) => void;
}

export function FileUploadZone({ onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const valid = Array.from(fileList).filter(
      (f) => ACCEPTED_TYPES.has(f.type) || f.name.match(/\.(pdf|jpe?g|png|webp|gif|txt|html)$/i),
    );
    if (valid.length) onFiles(valid);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={[
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-12 cursor-pointer transition-colors min-h-48',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/60 hover:bg-surface/60',
      ].join(' ')}
    >
      <div className={[
        'rounded-full p-4 transition-colors',
        dragging ? 'bg-primary/15' : 'bg-surface',
      ].join(' ')}>
        <Upload className={[
          'h-8 w-8 transition-colors',
          dragging ? 'text-primary-dark' : 'text-text-muted',
        ].join(' ')} />
      </div>
      <div className="space-y-1.5 text-center">
        <p className="type-subheading">Drop your travel documents here</p>
        <p className="type-body text-text-muted max-w-xs">
          PDF confirmations, booking emails, itineraries — we&apos;ll parse everything
        </p>
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {['PDF', 'Email', 'Image'].map((fmt) => (
          <span key={fmt} className="text-xs font-medium px-2.5 py-1 rounded-full bg-surface border border-border text-text-muted">
            {fmt}
          </span>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
