import { stripAirportCode } from './utils';
import type {
  TimelineEvent,
  ExpenseEvent,
  FlightConnectionEvent,
  BudgetItemCategory,
  TransportType,
} from '@/types';

/**
 * Return all expense events from a timeline (for Expenses/Budget views).
 */
export function getTimelineExpenses(events: TimelineEvent[]): ExpenseEvent[] {
  return events.filter((e): e is ExpenseEvent => e.type === 'expense');
}

/**
 * Map an expense event's open category string to a BudgetItemCategory for display.
 */
export function normalizeBudgetCategory(category: string): BudgetItemCategory {
  const map: Record<string, BudgetItemCategory> = {
    flights: 'flights',
    flight: 'flights',
    airlines: 'flights',
    airline: 'flights',
    hotels: 'hotels',
    hotel: 'hotels',
    lodging: 'hotels',
    accommodation: 'hotels',
    car_rental: 'car_rental',
    'car rental': 'car_rental',
    rental: 'car_rental',
    activities: 'activities',
    activity: 'activities',
    tours: 'activities',
    entertainment: 'activities',
    transport: 'transport',
    transportation: 'transport',
    transit: 'transport',
    taxi: 'transport',
    bus: 'transport',
    train: 'transport',
    ferry: 'transport',
    rideshare: 'transport',
    drive: 'transport',
    food: 'food',
    dining: 'food',
    restaurant: 'food',
    grocery: 'food',
    insurance: 'insurance',
  };
  return map[category.toLowerCase()] ?? 'other';
}

/**
 * Extract distinct destination cities visited from a timeline.
 * Hotels and activities are most reliable; falls back to flight arrivals.
 */
export function extractDestinationsFromTimeline(events: TimelineEvent[]): string[] {
  const confirmed = new Set<string>();
  const arrivals = new Set<string>();

  for (const e of events) {
    const city = e.locationCity;
    if (!city) continue;
    if (e.type === 'hotel' && e.subtype === 'check_in') {
      confirmed.add(city);
    } else if (e.type === 'activity') {
      confirmed.add(city);
    } else if (e.type === 'flight' && e.subtype === 'arrival') {
      arrivals.add(stripAirportCode(city) || city);
    }
  }

  const result = confirmed.size > 0 ? [...confirmed] : [...arrivals];
  return result.filter(Boolean);
}

// ─── Format timeline for Sonnet ───────────────────────────────────────────────

/**
 * Render a TimelineEvent[] as human-readable text for Claude Sonnet itinerary generation.
 * Expense events are omitted (Sonnet doesn't include prices in itineraries).
 */
export function formatTimeline(events: TimelineEvent[]): string {
  const logisticsEvents = events.filter((e) => e.type !== 'expense');
  if (logisticsEvents.length === 0) return '(No scheduled events found in this document.)';

  const lines: string[] = [
    'TRIP TIMELINE (chronological order by UTC when available):',
    'NOTE: All times are LOCAL to the event location. Display exactly as given — never convert.',
  ];

  for (const e of logisticsEvents) {
    const localWhen = e.time ? `${e.date} ${e.time} local` : `${e.date} (time unspecified)`;
    const utcPart = e.utcISO ? ` [${e.utcISO}]` : '';
    lines.push('');
    lines.push(`${localWhen}${utcPart}`);

    switch (e.type) {
      case 'flight': {
        if (e.subtype === 'connection') {
          const ce = e as FlightConnectionEvent;
          let layover = '';
          if (ce.layoverMinutes) {
            const h = Math.floor(ce.layoverMinutes / 60);
            const m = ce.layoverMinutes % 60;
            layover = `  (${h}h${m > 0 ? `${m}m` : ''} layover)`;
          }
          lines.push(`  🔄 CONNECTION STOP`);
          lines.push(`  ${ce.connectionAirport}${layover}`);
          lines.push(`  ${ce.inboundFromAirport} → [${ce.connectionAirport}] → ${ce.outboundToAirport}`);
          if (ce.inboundFlightNo) lines.push(`  Inbound: ${ce.inboundFlightNo}`);
          if (ce.time) lines.push(`  Arrives: ${ce.time} local`);
          if (ce.outboundFlightNo) lines.push(`  Outbound: ${ce.outboundFlightNo}`);
          if (ce.departureTime) lines.push(`  Departs: ${ce.departureTime} local`);
          if (ce.requiresSecurity) lines.push(`  Security screening required`);
          if (ce.requiresCustoms) lines.push(`  Customs/border control required`);
          if (ce.bookingRef) lines.push(`  Ref: ${ce.bookingRef}`);
        } else {
          const label = e.subtype === 'departure' ? '✈️ FLIGHT DEPARTURE' : '🛬 FLIGHT ARRIVAL';
          lines.push(`  ${label}`);
          if (e.subtype === 'departure') {
            lines.push(`  ${e.flightNo ? e.flightNo + ': ' : ''}${e.departureAirport} → ${e.arrivalAirport}`);
            if (e.bookingRef) lines.push(`  Ref: ${e.bookingRef}`);
            if (e.travelClass) lines.push(`  Class: ${e.travelClass}`);
            if (e.seatNumber) lines.push(`  Seat: ${e.seatNumber}`);
            if (e.boardingTime) lines.push(`  Boarding: ${e.boardingTime}`);
            if (e.gate) lines.push(`  Gate: ${e.gate}`);
            if (e.baggageAllowance) lines.push(`  Baggage: ${e.baggageAllowance}`);
            if (e.loyaltyNo) lines.push(`  FF#: ${e.loyaltyNo}${e.loyaltyStatus ? ` (${e.loyaltyStatus})` : ''}`);
            if (e.notes) lines.push(`  ${e.notes}`);
          } else {
            lines.push(`  ${e.flightNo ? e.flightNo + ' arrives ' : 'Arrives '}${e.arrivalAirport}`);
          }
          if (e.locationCity) lines.push(`  City: ${e.locationCity}`);
        }
        break;
      }

      case 'hotel': {
        if (e.subtype === 'check_in') {
          lines.push(`  🏨 HOTEL CHECK-IN`);
          lines.push(`  ${e.hotelName}`);
          if (e.locationCity) lines.push(`  City: ${e.locationCity}`);
          if (e.bookingRef) lines.push(`  Ref: ${e.bookingRef}`);
          if (e.roomType) lines.push(`  Room: ${e.roomType}`);
          if (e.numberOfNights) lines.push(`  Nights: ${e.numberOfNights}`);
          if (e.breakfastIncluded) lines.push(`  Breakfast: Included`);
          if (e.amenities?.length) lines.push(`  Amenities: ${e.amenities.join(', ')}`);
          if (e.loyaltyNumber) lines.push(`  Member#: ${e.loyaltyNumber}${e.loyaltyStatus ? ` (${e.loyaltyStatus})` : ''}`);
          lines.push(`  Check-out: ${e.checkoutDate}${e.checkoutTime ? ' ' + e.checkoutTime : ''}`);
        } else {
          lines.push(`  🏨 HOTEL CHECK-OUT`);
          lines.push(`  ${e.hotelName}`);
          if (e.locationCity) lines.push(`  City: ${e.locationCity}`);
        }
        break;
      }

      case 'otherTransportation': {
        const typeLabel = ({
          car_rental: '🚗 CAR RENTAL',
          drive: '🚗 DRIVE',
          bus: '🚌 BUS',
          train: '🚆 TRAIN',
          ferry: '⛴️ FERRY',
          taxi: '🚕 TAXI',
          rideshare: '🚕 RIDESHARE',
          other: '🚌 TRANSPORT',
        } as Record<TransportType, string>)[e.transportType] ?? '🚌 TRANSPORT';

        if (e.subtype === 'departure') {
          lines.push(`  ${typeLabel} PICKUP`);
          lines.push(`  ${e.departureLocation} → ${e.arrivalLocation}`);
          if (e.vendor) lines.push(`  Provider: ${e.vendor}`);
          if (e.bookingRef) lines.push(`  Ref: ${e.bookingRef}`);
          if (e.notes) lines.push(`  ${e.notes}`);
        } else {
          lines.push(`  ${typeLabel} RETURN/DROP-OFF`);
          lines.push(`  ${e.arrivalLocation}`);
          if (e.vendor) lines.push(`  Provider: ${e.vendor}`);
        }
        if (e.locationCity) lines.push(`  City: ${e.locationCity}`);
        break;
      }

      case 'activity': {
        lines.push(`  🎭 ACTIVITY`);
        lines.push(`  ${e.description}`);
        if (e.locationCity) lines.push(`  City: ${e.locationCity}`);
        if (e.bookingRef) lines.push(`  Ref: ${e.bookingRef}`);
        if (e.notes) lines.push(`  ${e.notes}`);
        break;
      }
    }

    e.artifactSources?.forEach((s) => lines.push(`  Source: ${s}`));
  }

  return lines.join('\n');
}
