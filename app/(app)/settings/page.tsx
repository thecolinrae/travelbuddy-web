import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { SettingsClient } from './SettingsClient';

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session as { userId?: string })?.userId;
  if (!userId) redirect('/login');

  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { name: true, email: true, avatarUrl: true, preferredCurrency: true },
  });

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>
      <SettingsClient
        name={profile?.name ?? null}
        email={profile?.email ?? ''}
        avatarUrl={profile?.avatarUrl ?? null}
        preferredCurrency={profile?.preferredCurrency ?? 'CAD'}
      />
    </main>
  );
}
