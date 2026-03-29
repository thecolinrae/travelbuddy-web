import { auth } from '@/lib/auth';
import { listTrips } from '@/services/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, MapPin } from 'lucide-react';
import { TripCard } from '@/components/TripCard';
import { Button } from '@/components/ui/button';
import type { TripRow } from '@/services/db';

export default async function TripsPage() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const trips = await listTrips(userId);

  const active    = trips.filter((t) => t.status === 'active');
  const upcoming  = trips.filter((t) => t.status === 'upcoming');
  const completed = trips.filter((t) => t.status === 'completed');

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Trips</h1>
        <Button asChild size="sm">
          <Link href="/import" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New trip
          </Link>
        </Button>
      </div>

      {trips.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-4 text-center">
          <div className="rounded-full bg-surface p-3">
            <MapPin className="h-8 w-8 text-text-muted" />
          </div>
          <div>
            <p className="font-medium">No trips yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Import your booking confirmations to get started.
            </p>
          </div>
          <Button asChild>
            <Link href="/import">Import documents</Link>
          </Button>
        </div>
      )}

      {active.length > 0 && (
        <Section title="Active" trips={active} />
      )}
      {upcoming.length > 0 && (
        <Section title="Upcoming" trips={upcoming} />
      )}
      {completed.length > 0 && (
        <Section title="Past" trips={completed} />
      )}
    </main>
  );
}

function Section({ title, trips }: { title: string; trips: TripRow[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      <ul className="space-y-2">
        {trips.map((t) => (
          <li key={t.id}>
            <TripCard trip={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}
