import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppNav } from '@/components/AppNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop only */}
      <AppNav session={session} />

      {/* Main content */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
