'use client';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { FlightDepartureDetail, FlightArrivalDetail, FlightConnectionDetail } from './detail/FlightDetail';
import { HotelCheckInDetail, HotelCheckOutDetail } from './detail/HotelDetail';
import { TransportDetail } from './detail/TransportDetail';
import { ActivityEventDetail } from './detail/ActivityEventDetail';
import type {
  TimelineEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  ActivityEvent,
  Activity,
} from '@/types';

interface EventDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: TimelineEvent;
  // Optional — used for ActivityEvent link/unlink actions
  tripId?: string;
  activities?: Activity[];
  timeline?: ActivityEvent[];
  isOwner?: boolean;
  onActivityUpdate?: (updated: Activity[]) => void;
  linkedActivity?: Activity;
}

export function EventDetailSheet({
  open,
  onOpenChange,
  event,
  tripId,
  activities,
  timeline,
  isOwner,
  onActivityUpdate,
  linkedActivity,
}: EventDetailSheetProps) {
  function renderContent() {
    if (event.type === 'flight') {
      if (event.subtype === 'departure') return <FlightDepartureDetail event={event} />;
      if (event.subtype === 'arrival') return <FlightArrivalDetail event={event} />;
      return <FlightConnectionDetail event={event} />;
    }
    if (event.type === 'hotel') {
      if (event.subtype === 'check_in') return <HotelCheckInDetail event={event} />;
      return <HotelCheckOutDetail event={event} />;
    }
    if (event.type === 'otherTransportation') {
      return <TransportDetail event={event as TransportDepartureEvent | TransportArrivalEvent} />;
    }
    if (event.type === 'activity') {
      return (
        <ActivityEventDetail
          event={event}
          tripId={tripId}
          activities={activities}
          timeline={timeline}
          isOwner={isOwner}
          onActivityUpdate={onActivityUpdate}
          linkedActivity={linkedActivity}
        />
      );
    }
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md overflow-y-auto">
        {renderContent()}
      </SheetContent>
    </Sheet>
  );
}
