'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plane, MapPin, Upload, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from 'next-auth';
import Image from 'next/image';

const NAV_ITEMS = [
  { href: '/', label: 'Trips', icon: MapPin },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppNav({ session }: { session: Session }) {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <div className="rounded-lg bg-primary p-1.5">
            <Plane className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-text-base">TravelBuddy</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === href
                  ? 'border-l-2 border-primary bg-primary/10 text-text-base font-medium pl-[10px]'
                  : 'text-text-muted hover:bg-surface hover:text-text-base',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <Image
                src={session.user.image}
                alt={session.user.name ?? ''}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-base truncate">
                {session.user?.name ?? 'User'}
              </p>
              <p className="text-xs text-text-muted truncate">{session.user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              pathname === href ? 'text-primary-dark' : 'text-text-muted',
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
