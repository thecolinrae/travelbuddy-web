import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

// Trips list — implemented in Phase 3
// Placeholder redirects to import until Phase 3 is complete
export default async function TripsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-text-base mb-2">My Trips</h1>
      <p className="text-text-muted">Trip list coming in Phase 3.</p>
    </div>
  );
}
