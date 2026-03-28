import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const trip = await getTrip(id, userId);
  if (!trip) redirect('/');

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Back to trips"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {trip.coverEmoji} {trip.name}
          </h1>
          {trip.destination && (
            <p className="text-muted-foreground text-sm">{trip.destination}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Trip detail tabs are coming in Phase 3. Your trip was imported successfully!
      </div>

      {trip.itineraryMd && (
        <div className="rounded-xl border bg-card p-6 prose prose-sm dark:prose-invert max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {trip.itineraryMd}
          </pre>
        </div>
      )}
    </main>
  );
}
