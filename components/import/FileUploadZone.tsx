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
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/40',
      ].join(' ')}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Drop files here or click to browse</p>
      <p className="text-xs text-muted-foreground">PDF, images (JPG, PNG), or text files</p>
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
