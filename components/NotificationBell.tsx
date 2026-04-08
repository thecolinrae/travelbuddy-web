'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@/hooks/use-trip-queries';
import { useMarkNotificationsRead } from '@/hooks/use-trip-mutations';
import { tripKeys } from '@/lib/query-keys';

interface NotificationBellProps {
  /** 'sidebar' — desktop nav link style; 'mobile' — bottom tab style */
  variant?: 'sidebar' | 'mobile';
}

export function NotificationBell({ variant = 'sidebar' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useNotifications();
  const markAllRead = useMarkNotificationsRead();

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.data ?? [];

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      // Optimistic: clear badge immediately
      queryClient.setQueryData(tripKeys.notifications, (prev: typeof data) =>
        prev ? { ...prev, unreadCount: 0, data: prev.data.map((n) => ({ ...n, read: true })) } : prev,
      );
      markAllRead.mutate();
    }
  }

  const trigger =
    variant === 'mobile' ? (
      <button className="flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors text-text-muted relative">
        <span className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        Alerts
      </button>
    ) : (
      <button
        className={cn(
          'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-text-muted hover:bg-surface hover:text-text-base',
        )}
      >
        <span className="relative shrink-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        Notifications
        {unreadCount > 0 && (
          <span className="ml-auto text-xs bg-primary/20 text-primary-foreground font-semibold rounded-full px-1.5 py-0.5">
            {unreadCount}
          </span>
        )}
      </button>
    );

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-80 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-surface p-4">
                <Bell className="h-8 w-8 text-text-muted" />
              </div>
              <p className="type-caption max-w-xs">
                Activity recommendations will appear here after you import a trip.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NotificationItem({
  notification,
  onClose,
}: {
  notification: { id: string; type: string; read: boolean; trip: { id: string; name: string } };
  onClose: () => void;
}) {
  const isGenerating = notification.type === 'activities_generating';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 space-y-2',
        !notification.read ? 'bg-primary/5 border-primary/20' : 'bg-card border-border',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isGenerating ? (
            <Loader2 className="h-4 w-4 text-text-muted animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          )}
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-text-base leading-snug">
            {isGenerating ? 'Generating activities…' : 'Activities ready'}
          </p>
          {isGenerating ? (
            <p className="type-caption">Finding things to do in {notification.trip.name}</p>
          ) : (
            <Link
              href={`/trip/${notification.trip.id}?tab=activities`}
              onClick={onClose}
              className="type-caption text-secondary hover:underline"
            >
              View activities for {notification.trip.name}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
