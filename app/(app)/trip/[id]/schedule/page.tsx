import { auth } from '@/lib/auth';
import { getTrip, loadTimeline, loadActivities } from '@/services/db';
import { redirect } from 'next/navigation';
import { ScheduleEditor } from '@/components/trip/schedule/ScheduleEditor';
import type { ScheduleView } from '@/components/trip/schedule/constants';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const trip = await getTrip(id, userId);
  if (!trip) redirect('/');

  const [timeline, activitiesData] = await Promise.all([
    loadTimeline(id),
    loadActivities(id),
  ]);

  const initialDate = query.date ?? trip.startDate ?? today();
  const rawView = query.view;
  const initialView: ScheduleView =
    rawView === '3day' || rawView === 'week' ? rawView : 'day';
  const returnDayIndex = query.dayIndex ? parseInt(query.dayIndex, 10) : undefined;

  return (
    <ScheduleEditor
      tripId={trip.id}
      tripName={trip.name}
      initialDate={initialDate}
      initialView={initialView}
      timeline={timeline}
      initialActivities={activitiesData?.savedActivities ?? []}
      returnDayIndex={returnDayIndex}
    />
  );
}
