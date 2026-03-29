import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, loadActivities, listArtifacts } from '@/services/db';
import { redirect } from 'next/navigation';
import { TripDetailClient } from './TripDetailClient';

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const trip = await getTrip(id, userId);
  if (!trip) redirect('/');

  const [timeline, activitiesData, artifacts] = await Promise.all([
    loadTimeline(id),
    loadActivities(id),
    listArtifacts(id),
  ]);

  // Serialize for client component (convert Date/BigInt → primitives)
  const tripData = {
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    destinations: trip.destinations,
    startDate: trip.startDate,
    endDate: trip.endDate,
    status: trip.status,
    coverEmoji: trip.coverEmoji,
    itineraryMd: trip.itineraryMd,
    notes: trip.notes,
    budgetGoal: trip.budgetGoal,
    categoryGoals: trip.categoryGoals,
    preferredCurrency: trip.preferredCurrency,
  };

  const artifactData = artifacts.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    mimeType: a.mimeType,
    storagePath: a.storagePath,
    size: a.size !== null ? Number(a.size) : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <TripDetailClient
      trip={tripData}
      timeline={timeline}
      activities={activitiesData?.savedActivities ?? []}
      artifacts={artifactData}
      isOwner={trip.userId === userId}
    />
  );
}
