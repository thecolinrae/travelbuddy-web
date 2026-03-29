'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  itineraryMd: string | null;
}

export function ItineraryTab({ itineraryMd }: Props) {
  if (!itineraryMd) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No itinerary generated yet. Add documents to generate one.
      </div>
    );
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{itineraryMd}</ReactMarkdown>
    </div>
  );
}
