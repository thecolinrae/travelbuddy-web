import { auth } from '@/lib/auth';
import { getTrip } from '@/services/db';
import { listLegsWithEvents } from '@/services/legs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { TransportationView } from '@/components/trip/transport/TransportationView';

export default async function TransportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const trip = await getTrip(id, userId);
  if (!trip) redirect('/');

  const { legs, unassigned } = await listLegsWithEvents(id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <Link
        href={`/trip/${id}`}
        className="inline-flex items-center gap-1 type-caption text-text-muted hover:text-text-base transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        {trip.name}
      </Link>

      <h1 className="type-display">Transportation</h1>

      <TransportationView
        tripId={id}
        initialLegs={legs}
        initialUnassigned={unassigned}
        isOwner={trip.userId === userId}
      />
    </div>
  );
}
