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
        <h1 className="type-heading">My Trips</h1>
        <Button asChild size="sm">
          <Link href="/import" className="gap-1.5">
            <Plus className="h-4 w-4" />
            New trip
          </Link>
        </Button>
      </div>

      {trips.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-5 text-center">
          <div className="rounded-full bg-primary/10 p-5 border-2 border-primary/20">
            <MapPin className="h-10 w-10 text-primary-dark" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h2 className="font-display font-semibold text-xl">No trips yet</h2>
            <p className="type-body text-text-muted">
              Import a confirmation email, itinerary PDF, or booking document to create your first trip.
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary-dark font-semibold">
            <Link href="/import">Import your first trip</Link>
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
