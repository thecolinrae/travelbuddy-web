import { nanoid } from '../nanoid';
import { resolveTimezone } from '../timezone';
import { makeCost } from '../currency';
import {
  stripAirportCode,
  inferCityFromHotelName,
  extractAirportCode,
  airportsMatch,
} from './utils';
import {
  normalizeEvent,
  utcForEvent,
  eventSortKey,
  resolveDeparture,
  resolveArrival,
} from './normalize';
import type {
  ParsedArtifact,
  Passenger,
  Cost,
  TimelineEvent,
  HotelCheckInEvent,
  HotelCheckOutEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  ExpenseEvent,
  ActivityEvent,
  TransportType,
} from '@/types';

// ─── Deduplication key per event type ────────────────────────────────────────

/**
 * Produce a stable, normalized key for an airport string.
 * Uses the IATA/ICAO code when present ("Toronto (YYZ)" → "yyz");
 * falls back to the stripped city name so different spellings of the same
 * city still produce the same key.
 */
function airportKey(s: string): string {
  const code = extractAirportCode(s);
  if (code) return code.toLowerCase();
  return stripAirportCode(s).toLowerCase();
}

/**
 * Normalise a flight number so "AC 855" and "AC855" produce the same key.
 */
function normalizeFlightNo(fn: string): string {
  return fn.replace(/\s+/g, '').toUpperCase();
}

function dedupKey(e: TimelineEvent): string | null {
  switch (e.type) {
    case 'hotel':
      return `hotel|${e.subtype}|${e.date}|${e.locationCity.toLowerCase()}`;
    case 'flight':
      if (e.subtype === 'connection') {
        const ce = e as FlightConnectionEvent;
        return `flight|connection|${ce.date}|${ce.connectionAirport.toLowerCase()}`;
      }
      // Use IATA codes (not raw strings) so "Toronto (YYZ)" and
      // "Toronto Pearson International (YYZ)" produce the same key.
      return `flight|${e.subtype}|${normalizeFlightNo(e.flightNo)}|${e.date}|${airportKey(e.departureAirport)}|${airportKey(e.arrivalAirport)}`;
    case 'otherTransportation':
      return `transport|${e.subtype}|${e.date}|${e.departureLocation.toLowerCase()}`;
    case 'expense':
      if (e.isManual) return null;  // manual expenses are never deduplicated
      return `expense|${e.date}|${e.description.toLowerCase()}`;
    case 'activity':
      return `activity|${e.date}|${e.description.toLowerCase()}`;
    default:
      return null;
  }
}

// ─── Field-level merge for duplicate events ───────────────────────────────────

/**
 * Pick the first non-empty value.  Empty string / null / undefined all count
 * as "no value" and yield to the fallback.
 */
function pick<T>(a: T | undefined, b: T | undefined): T | undefined {
  if (a !== undefined && a !== null && a !== '') return a;
  return b;
}

function pickArr<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  return a?.length ? a : b;
}

/**
 * Merge two events that share the same deduplication key.
 * The existing event's `id` is always preserved.
 * Optional fields are filled from `incoming` when `existing` has no value,
 * so a boarding pass (gate/seat/boardingTime) and a booking confirmation
 * (bookingRef/loyaltyNo/baggageAllowance) both contribute to the same event.
 */
function mergeEvents(existing: TimelineEvent, incoming: TimelineEvent): TimelineEvent {
  // Shared base — fill missing time / location precision from incoming
  const base = {
    ...existing,
    // For transport/flight events the incoming date may have been corrected by
    // resolveArrival/resolveDeparture; always prefer incoming so re-imports fix
    // stale DB dates.  For other types keep existing (which is usually the same).
    date: (incoming.type === 'flight' || incoming.type === 'otherTransportation')
      ? (incoming.date ?? existing.date)
      : existing.date,
    time: pick(existing.time, incoming.time),
    // Similarly, always take a freshly-computed utcISO over a stale stored one
    utcISO: (incoming.type === 'flight' || incoming.type === 'otherTransportation')
      ? (incoming.utcISO ?? existing.utcISO)
      : pick(existing.utcISO, incoming.utcISO),
    locationCity: pick(existing.locationCity, incoming.locationCity),
    locationAddress: pick(existing.locationAddress, incoming.locationAddress),
    artifactSources: (() => {
      const combined = [...(existing.artifactSources ?? []), ...(incoming.artifactSources ?? [])];
      const unique = [...new Set(combined)];
      return unique.length ? unique : undefined;
    })(),
  };

  if (existing.type === 'flight' && incoming.type === 'flight') {
    // Connection stop + connection stop
    if (existing.subtype === 'connection' && incoming.subtype === 'connection') {
      const ec = existing as FlightConnectionEvent;
      const ic = incoming as FlightConnectionEvent;
      return {
        ...base,
        connectionAirport: pick(ec.connectionAirport, ic.connectionAirport) ?? '',
        inboundFlightNo: pick(ec.inboundFlightNo, ic.inboundFlightNo),
        outboundFlightNo: pick(ec.outboundFlightNo, ic.outboundFlightNo),
        inboundFromAirport: pick(ec.inboundFromAirport, ic.inboundFromAirport) ?? '',
        outboundToAirport: pick(ec.outboundToAirport, ic.outboundToAirport) ?? '',
        departureTime: pick(ec.departureTime, ic.departureTime),
        departureDate: pick(ec.departureDate, ic.departureDate),
        departureUtcISO: pick(ec.departureUtcISO, ic.departureUtcISO),
        layoverMinutes: ec.layoverMinutes ?? ic.layoverMinutes,
        requiresSecurity: ec.requiresSecurity ?? ic.requiresSecurity,
        requiresCustoms: ec.requiresCustoms ?? ic.requiresCustoms,
        bookingRef: pick(ec.bookingRef, ic.bookingRef),
      } as FlightConnectionEvent;
    }
    // Departure + departure or arrival + arrival
    const e = existing as FlightDepartureEvent | FlightArrivalEvent;
    const i = incoming as FlightDepartureEvent | FlightArrivalEvent;
    const merged = {
      ...base,
      flightNo: pick(e.flightNo, i.flightNo) ?? '',
      departureAirport: pick(e.departureAirport, i.departureAirport) ?? '',
      arrivalAirport: pick(e.arrivalAirport, i.arrivalAirport) ?? '',
      bookingRef: pick(e.bookingRef, i.bookingRef),
    };
    if (e.subtype === 'departure' && i.subtype === 'departure') {
      const ed = e as FlightDepartureEvent;
      const id = i as FlightDepartureEvent;
      // Merge passengers: union by name to avoid duplicates on re-import
      const mergedPassengers: Passenger[] | undefined = (() => {
        const all = [...(ed.passengers ?? []), ...(id.passengers ?? [])];
        if (all.length === 0) return undefined;
        const seen = new Set<string>();
        return all.filter((p) => {
          if (seen.has(p.name)) return false;
          seen.add(p.name);
          return true;
        });
      })();
      return {
        ...merged,
        travelClass: pick(ed.travelClass, id.travelClass),
        seatNumber: pick(ed.seatNumber, id.seatNumber),
        boardingTime: pick(ed.boardingTime, id.boardingTime),
        gate: pick(ed.gate, id.gate),
        baggageAllowance: pick(ed.baggageAllowance, id.baggageAllowance),
        loyaltyNo: pick(ed.loyaltyNo, id.loyaltyNo),
        loyaltyStatus: pick(ed.loyaltyStatus, id.loyaltyStatus),
        passengers: mergedPassengers,
        passengerCount: ed.passengerCount ?? id.passengerCount ?? mergedPassengers?.length,
        notes: pick(ed.notes, id.notes),
      } as FlightDepartureEvent;
    }
    // Arrival + arrival: preserve connectingFlight from whichever has it
    const ea = e as FlightArrivalEvent;
    const ia = i as FlightArrivalEvent;
    return {
      ...merged,
      connectingFlight: pick(ea.connectingFlight, ia.connectingFlight),
    } as FlightArrivalEvent;
  }

  if (existing.type === 'hotel' && incoming.type === 'hotel') {
    const e = existing as HotelCheckInEvent | HotelCheckOutEvent;
    const i = incoming as HotelCheckInEvent | HotelCheckOutEvent;
    const merged = {
      ...base,
      hotelName: pick(e.hotelName, i.hotelName) ?? '',
      bookingRef: pick(e.bookingRef, i.bookingRef),
    };
    if (e.subtype === 'check_in' && i.subtype === 'check_in') {
      const ec = e as HotelCheckInEvent;
      const ic = i as HotelCheckInEvent;
      // Prefer the checkout date that actually differs from check-in (fallback = same day)
      const existingCheckoutReal = ec.checkoutDate !== ec.date;
      const incomingCheckoutReal = ic.checkoutDate !== ic.date;
      return {
        ...merged,
        checkoutDate: existingCheckoutReal ? ec.checkoutDate
          : incomingCheckoutReal ? ic.checkoutDate
          : ec.checkoutDate,
        checkoutTime: pick(ec.checkoutTime, ic.checkoutTime),
        breakfastIncluded: ec.breakfastIncluded || ic.breakfastIncluded,
        amenities: pickArr(ec.amenities, ic.amenities) ?? [],
        roomType: pick(ec.roomType, ic.roomType),
        numberOfNights: ec.numberOfNights ?? ic.numberOfNights,
        loyaltyNumber: pick(ec.loyaltyNumber, ic.loyaltyNumber),
        loyaltyStatus: pick(ec.loyaltyStatus, ic.loyaltyStatus),
      } as HotelCheckInEvent;
    }
    return merged as HotelCheckOutEvent;
  }

  if (existing.type === 'otherTransportation' && incoming.type === 'otherTransportation') {
    const e = existing as TransportDepartureEvent | TransportArrivalEvent;
    const i = incoming as TransportDepartureEvent | TransportArrivalEvent;
    const merged = {
      ...base,
      departureLocation: pick(e.departureLocation, i.departureLocation) ?? '',
      arrivalLocation: pick(e.arrivalLocation, i.arrivalLocation) ?? '',
      vendor: pick(e.vendor, i.vendor),
    };
    if (e.subtype === 'departure' && i.subtype === 'departure') {
      const ed = e as TransportDepartureEvent;
      const id = i as TransportDepartureEvent;
      return {
        ...merged,
        bookingRef: pick(ed.bookingRef, id.bookingRef),
        notes: pick(ed.notes, id.notes),
      } as TransportDepartureEvent;
    }
    return merged as TransportArrivalEvent;
  }

  if (existing.type === 'activity' && incoming.type === 'activity') {
    const e = existing as ActivityEvent;
    const i = incoming as ActivityEvent;
    return {
      ...base,
      description: pick(e.description, i.description) ?? '',
      category: pick(e.category, i.category) ?? '',
      cost: e.cost ?? i.cost,
      notes: pick(e.notes, i.notes),
      bookingRef: pick(e.bookingRef, i.bookingRef),
    } as ActivityEvent;
  }

  if (existing.type === 'expense' && incoming.type === 'expense') {
    const e = existing as ExpenseEvent;
    const i = incoming as ExpenseEvent;
    return {
      ...base,
      description: pick(e.description, i.description) ?? '',
      vendor: pick(e.vendor, i.vendor),
      category: pick(e.category, i.category) ?? '',
      cost: e.cost,  // existing cost wins
      notes: pick(e.notes, i.notes),
      linkedEventId: pick(e.linkedEventId, i.linkedEventId),
      isManual: e.isManual ?? i.isManual,
    } as ExpenseEvent;
  }

  return existing;
}

// ─── Per-artifact event extraction ───────────────────────────────────────────

function extractEvents(
  artifact: ParsedArtifact,
  sourceFileName?: string,
  preferredCurrency = 'CAD',
  rates: Record<string, number> = {},
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const src = sourceFileName;

  // Cast to string to allow legacy type values ('car_rental', 'receipt') that
  // may appear in previously-saved artifact JSON from before the type rename.
  switch (artifact.type as string) {
    case 'flight': {
      const legs = artifact.legs;

      if (!legs || legs.length === 0) {
        // ── Fallback: no legs — use top-level artifact fields ────────────────
        if (artifact.startDate) {
          const fn = artifact.flightNumber ?? '';
          const depAirport = artifact.origin ?? '?';
          const arrAirport = artifact.destination ?? '?';
          const depTz = resolveTimezone(depAirport) ?? undefined;
          const journeyId = nanoid();
          const dep: FlightDepartureEvent = {
            id: nanoid(),
            type: 'flight', subtype: 'departure',
            date: artifact.startDate, time: artifact.startTime,
            timezone: depTz,
            utcISO: utcForEvent(artifact.startDate, artifact.startTime, depTz),
            locationCity: stripAirportCode(depAirport) || depAirport,
            flightNo: fn, departureAirport: depAirport, arrivalAirport: arrAirport,
            bookingRef: artifact.confirmationNumber,
            loyaltyNo: artifact.loyaltyNumber, loyaltyStatus: artifact.loyaltyStatus,
            seatNumber: artifact.seatNumber, notes: artifact.notes,
            passengers: artifact.passengers,
            passengerCount: artifact.passengers?.length ?? undefined,
            artifactSources: src ? [src] : undefined,
            journeyId,
          };
          events.push(dep);

          const arrTz = resolveTimezone(arrAirport) ?? undefined;
          const { date: arrDate, utcISO: arrUtcISO } = resolveArrival(
            artifact.endDate ?? artifact.startDate,
            artifact.endTime,
            arrTz,
            dep.utcISO,
          );
          const arr: FlightArrivalEvent = {
            id: nanoid(),
            type: 'flight', subtype: 'arrival',
            date: arrDate, time: artifact.endTime,
            timezone: arrTz,
            utcISO: arrUtcISO,
            locationCity: stripAirportCode(arrAirport) || arrAirport,
            flightNo: fn, departureAirport: depAirport, arrivalAirport: arrAirport,
            bookingRef: artifact.confirmationNumber,
            artifactSources: src ? [src] : undefined,
            journeyId,
          };
          events.push(arr);

          if (artifact.amount && artifact.amount > 0) {
            events.push({
              id: nanoid(), type: 'expense',
              date: dep.date, time: dep.time,
              timezone: depTz, utcISO: dep.utcISO,
              locationCity: dep.locationCity,
              description: artifact.vendor ? `${artifact.vendor} flight` : (fn || 'Flight'),
              vendor: artifact.vendor, category: 'flights',
              cost: makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates),
              linkedEventId: dep.id,
              artifactSources: src ? [src] : undefined,
            } as ExpenseEvent);
          }
        }
        break;
      }

      // ── Emit one departure + arrival per leg ─────────────────────────────
      // All legs of the same booking share a journeyId.
      // Connection arrivals (not at the primary destination) carry connectingFlight
      // pointing to the next departure's id so display layers can link them.
      const journeyId = nanoid();
      const primaryDest = artifact.destination ?? '';

      // Pre-generate departure IDs so arrival events can reference the next one.
      const depIds: string[] = legs.map(() => nanoid());

      let firstDepId: string | undefined;
      let firstDepDate: string | undefined;
      let firstDepTime: string | undefined;
      let firstDepUtc: string | undefined;
      let firstDepCity: string | undefined;
      let firstDepTz: string | undefined;
      // Track the previous leg's arrival UTC so we can detect off-by-one-day
      // departure dates caused by the LLM using the wrong timezone's calendar.
      let prevArrUtcISO: string | undefined;

      for (let li = 0; li < legs.length; li++) {
        const leg = legs[li];
        if (!leg.departureDate) continue;
        const isFirst = li === 0;
        const depAirport = leg.origin ?? artifact.origin ?? '?';
        const arrAirport = leg.destination ?? artifact.destination ?? '?';

        // Always resolve timezone from the airport/city rather than trusting the
        // LLM-provided UTC values — LLMs frequently get timezone offsets wrong,
        // especially for international flights and date-line crossings.
        const depTz = resolveTimezone(depAirport) ?? undefined;
        const arrTz = resolveTimezone(arrAirport) ?? undefined;

        // Compute UTC from the ticket's local time + location timezone.
        // If the computed gap from the previous leg's arrival exceeds 24 h, the
        // LLM has likely used the wrong calendar date — pull it back by one day.
        const { date: depDate, utcISO: depUtcISO } = resolveDeparture(
          leg.departureDate, leg.departureTime, depTz, prevArrUtcISO,
        );

        const dep: FlightDepartureEvent = {
          id: depIds[li],
          type: 'flight', subtype: 'departure',
          date: depDate,
          time: leg.departureTime,
          utcISO: depUtcISO,
          timezone: depTz,
          locationCity: stripAirportCode(depAirport) || depAirport,
          flightNo: leg.flightNumber ?? artifact.flightNumber ?? '',
          departureAirport: depAirport,
          arrivalAirport: arrAirport,
          bookingRef: isFirst ? artifact.confirmationNumber : undefined,
          loyaltyNo: isFirst ? artifact.loyaltyNumber : undefined,
          loyaltyStatus: isFirst ? artifact.loyaltyStatus : undefined,
          boardingTime: leg.boardingTime,
          travelClass: leg.travelClass,
          seatNumber: isFirst ? artifact.seatNumber : undefined,
          gate: leg.gate,
          baggageAllowance: leg.baggageAllowance,
          passengers: isFirst ? artifact.passengers : undefined,
          passengerCount: isFirst ? (artifact.passengers?.length ?? undefined) : undefined,
          notes: isFirst ? artifact.notes : undefined,
          artifactSources: src ? [src] : undefined,
          journeyId,
        };
        events.push(dep);
        if (!firstDepId) {
          firstDepId = dep.id;
          firstDepDate = dep.date;
          firstDepTime = dep.time;
          firstDepUtc = dep.utcISO;
          firstDepCity = dep.locationCity;
          firstDepTz = dep.timezone;
        }

        if (leg.arrivalDate) {
          // Find the next departure id (skip legs with no departureDate).
          const nextDepId = depIds.slice(li + 1).find((_, idx) => legs[li + 1 + idx]?.departureDate);
          // This arrival is a connection stop if it is NOT the primary destination AND
          // there is a subsequent departure in the same booking.
          const isConnection = !!nextDepId && !!primaryDest && !airportsMatch(arrAirport, primaryDest);

          const { date: arrDate, utcISO: arrUtcISO } = resolveArrival(
            leg.arrivalDate, leg.arrivalTime, arrTz, depUtcISO,
          );

          const arr: FlightArrivalEvent = {
            id: nanoid(),
            type: 'flight', subtype: 'arrival',
            date: arrDate,
            time: leg.arrivalTime,
            utcISO: arrUtcISO,
            timezone: arrTz,
            locationCity: stripAirportCode(arrAirport) || arrAirport,
            flightNo: leg.flightNumber ?? artifact.flightNumber ?? '',
            departureAirport: depAirport,
            arrivalAirport: arrAirport,
            bookingRef: artifact.confirmationNumber,
            artifactSources: src ? [src] : undefined,
            journeyId,
            connectingFlight: isConnection ? nextDepId : undefined,
          };

          events.push(arr);
          // Pass this arrival's UTC to the next leg's departure check
          prevArrUtcISO = arrUtcISO;
        }
      }

      // One expense for the whole booking, linked to the first departure
      if (artifact.amount && artifact.amount > 0 && firstDepDate) {
        const cost = makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates);
        events.push({
          id: nanoid(), type: 'expense',
          date: firstDepDate, time: firstDepTime,
          timezone: firstDepTz, utcISO: firstDepUtc,
          locationCity: firstDepCity ?? '',
          description: artifact.vendor
            ? `${artifact.vendor} flight`
            : (legs[0]?.flightNumber ?? artifact.flightNumber ?? 'Flight'),
          vendor: artifact.vendor, category: 'flights',
          cost, linkedEventId: firstDepId,
          artifactSources: src ? [src] : undefined,
        } as ExpenseEvent);
      }
      break;
    }

    case 'hotel': {
      const checkIn = artifact.checkIn ?? artifact.startDate;
      const checkOut = artifact.checkOut ?? artifact.endDate;
      const hotelName = artifact.hotelName ?? artifact.vendor ?? 'Hotel';
      const city = stripAirportCode(artifact.destination ?? '')
        || inferCityFromHotelName(hotelName);
      const tz = resolveTimezone(city) ?? undefined;

      let checkInId: string | undefined;
      if (checkIn) {
        const checkInEvent: HotelCheckInEvent = {
          id: nanoid(),
          type: 'hotel',
          subtype: 'check_in',
          date: checkIn,
          time: artifact.checkInTime,
          timezone: tz,
          utcISO: utcForEvent(checkIn, artifact.checkInTime, tz),
          locationCity: city,
          locationAddress: artifact.locationAddress,
          hotelName,
          checkoutDate: checkOut ?? checkIn,
          checkoutTime: artifact.checkOutTime,
          breakfastIncluded: artifact.breakfastIncluded ?? false,
          amenities: artifact.amenities ?? [],
          bookingRef: artifact.confirmationNumber,
          roomType: artifact.roomType,
          numberOfNights: artifact.numberOfNights,
          loyaltyNumber: artifact.loyaltyNumber,
          loyaltyStatus: artifact.loyaltyStatus,
          artifactSources: src ? [src] : undefined,
        };
        checkInId = checkInEvent.id;
        events.push(checkInEvent);
      }

      let checkOutId: string | undefined;
      if (checkOut) {
        const checkOutEvent: HotelCheckOutEvent = {
          id: nanoid(),
          type: 'hotel',
          subtype: 'check_out',
          date: checkOut,
          time: artifact.checkOutTime,
          timezone: tz,
          utcISO: utcForEvent(checkOut, artifact.checkOutTime, tz),
          locationCity: city,
          locationAddress: artifact.locationAddress,
          hotelName,
          bookingRef: artifact.confirmationNumber,
          artifactSources: src ? [src] : undefined,
        };
        checkOutId = checkOutEvent.id;
        events.push(checkOutEvent);
      }

      // Hotel expense linked to check-out (guest settles the bill on departure)
      // Falls back to check-in id when there is no check-out event.
      if (artifact.amount && artifact.amount > 0) {
        const linkedId = checkOutId ?? checkInId;
        const linkedDate = checkOut ?? checkIn ?? '';
        const linkedTime = checkOut ? artifact.checkOutTime : artifact.checkInTime;
        const cost = makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates);
        const expense: ExpenseEvent = {
          id: nanoid(),
          type: 'expense',
          date: linkedDate,
          time: linkedTime,
          timezone: tz,
          utcISO: utcForEvent(linkedDate, linkedTime, tz),
          locationCity: city,
          description: hotelName,
          vendor: artifact.vendor,
          category: 'hotels',
          cost,
          notes: artifact.roomType ? `Room: ${artifact.roomType}` : undefined,
          linkedEventId: linkedId,
          artifactSources: src ? [src] : undefined,
        };
        events.push(expense);
      }
      break;
    }

    case 'ground_transport':
    case 'car_rental': {
      // 'car_rental' kept as legacy fallback for previously-saved artifact JSON
      const tType: TransportType = artifact.transportType ?? ((artifact.type as string) === 'car_rental' ? 'car_rental' : 'other');
      const pickupCity = stripAirportCode(artifact.origin ?? artifact.destination ?? '') || '';
      const dropoffCity = stripAirportCode(artifact.destination ?? artifact.origin ?? '') || '';
      const pickupTz = resolveTimezone(pickupCity) ?? undefined;
      const dropoffTz = resolveTimezone(dropoffCity || pickupCity) ?? undefined;
      const gtJourneyId = nanoid();

      let pickupId: string | undefined;
      if (artifact.startDate) {
        const dep: TransportDepartureEvent = {
          id: nanoid(),
          type: 'otherTransportation',
          subtype: 'departure',
          date: artifact.startDate,
          time: artifact.startTime,
          timezone: pickupTz,
          utcISO: utcForEvent(artifact.startDate, artifact.startTime, pickupTz),
          locationCity: pickupCity,
          journeyId: gtJourneyId,
          transportType: tType,
          departureLocation: artifact.origin ?? pickupCity,
          arrivalLocation: artifact.destination ?? dropoffCity,
          vendor: artifact.vendor,
          bookingRef: artifact.confirmationNumber,
          notes: artifact.notes,
          artifactSources: src ? [src] : undefined,
        };
        pickupId = dep.id;
        events.push(dep);
      }

      if (artifact.endDate) {
        const arr: TransportArrivalEvent = {
          id: nanoid(),
          type: 'otherTransportation',
          subtype: 'arrival',
          date: artifact.endDate,
          time: artifact.endTime,
          timezone: dropoffTz,
          utcISO: utcForEvent(artifact.endDate, artifact.endTime, dropoffTz),
          locationCity: dropoffCity || pickupCity,
          journeyId: gtJourneyId,
          transportType: tType,
          departureLocation: artifact.origin ?? pickupCity,
          arrivalLocation: artifact.destination ?? dropoffCity,
          vendor: artifact.vendor,
          bookingRef: artifact.confirmationNumber,
          artifactSources: src ? [src] : undefined,
        };
        events.push(arr);
      }

      // ExpenseEvent at departure time
      if (artifact.amount && artifact.amount > 0) {
        const cost = makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates);
        const transportLabel = tType === 'car_rental' ? 'Car rental'
          : tType === 'drive' ? 'Drive'
          : tType === 'bus' ? 'Bus'
          : tType === 'train' ? 'Train'
          : tType === 'ferry' ? 'Ferry'
          : tType === 'taxi' ? 'Taxi'
          : tType === 'rideshare' ? 'Rideshare'
          : 'Transport';
        const expense: ExpenseEvent = {
          id: nanoid(),
          type: 'expense',
          date: artifact.startDate ?? '',
          time: artifact.startTime,
          timezone: pickupTz,
          utcISO: utcForEvent(artifact.startDate, artifact.startTime, pickupTz),
          locationCity: pickupCity,
          description: artifact.vendor ? `${artifact.vendor} ${transportLabel.toLowerCase()}` : transportLabel,
          vendor: artifact.vendor,
          category: 'transport',
          cost,
          linkedEventId: pickupId,
          artifactSources: src ? [src] : undefined,
        };
        events.push(expense);
      }
      break;
    }

    case 'activity': {
      const date = artifact.startDate;
      const city = stripAirportCode(artifact.destination ?? '') || '';
      const description = artifact.vendor ?? artifact.destination ?? 'Activity';
      const tz = resolveTimezone(city) ?? undefined;

      if (date) {
        // Activity event (informational cost only)
        const costInfo: Cost | undefined = (artifact.amount && artifact.amount > 0)
          ? makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates)
          : undefined;

        const activity: ActivityEvent = {
          id: nanoid(),
          type: 'activity',
          date,
          time: artifact.startTime,
          timezone: tz,
          utcISO: utcForEvent(date, artifact.startTime, tz),
          locationCity: city,
          locationAddress: artifact.locationAddress,
          description,
          category: artifact.activityCategory ?? 'sightseeing',
          cost: costInfo,
          notes: artifact.notes,
          bookingRef: artifact.confirmationNumber,
          artifactSources: src ? [src] : undefined,
        };
        events.push(activity);

        // Actual expense event (separate, used in budget logic)
        if (artifact.amount && artifact.amount > 0) {
          const cost = makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates);
          const expense: ExpenseEvent = {
            id: nanoid(),
            type: 'expense',
            date,
            time: artifact.startTime,
            timezone: tz,
            utcISO: utcForEvent(date, artifact.startTime, tz),
            locationCity: city,
            description,
            vendor: artifact.vendor,
            category: 'activities',
            cost,
            linkedEventId: activity.id,
            artifactSources: src ? [src] : undefined,
          };
          events.push(expense);
        }
      }
      break;
    }

    case 'expense': {
      // Explicitly typed expense/receipt — always emit an ExpenseEvent when date is present,
      // even if amount is missing or zero, so the user can see and edit it.
      const date = artifact.startDate ?? artifact.checkIn;
      if (!date) break;
      const defaultCity = stripAirportCode(artifact.destination ?? '') || artifact.destination || '';
      const defaultTz = resolveTimezone(defaultCity) ?? undefined;
      const cost = makeCost(
        artifact.amount ?? 0,
        artifact.currency ?? preferredCurrency,
        preferredCurrency,
        rates,
      );
      // Infer a more specific category from the activity category when available
      const expenseCategory = ((): string => {
        switch (artifact.activityCategory) {
          case 'food': case 'nightlife': return 'food';
          case 'sightseeing': case 'culture': case 'nature':
          case 'adventure': case 'wellness': return 'activities';
          default: return 'other';
        }
      })();
      events.push({
        id: nanoid(),
        type: 'expense',
        date,
        timezone: defaultTz,
        utcISO: utcForEvent(date, artifact.startTime, defaultTz),
        locationCity: defaultCity,
        locationAddress: artifact.locationAddress,
        description: artifact.vendor ?? artifact.destination ?? 'Expense',
        vendor: artifact.vendor,
        category: expenseCategory,
        cost,
        notes: artifact.notes,
        artifactSources: src ? [src] : undefined,
      } as ExpenseEvent);
      break;
    }

    default: {
      // Unknown type ('other') — only emit if there's an amount, otherwise treat as activity
      const date = artifact.startDate ?? artifact.checkIn;
      const defaultCity = stripAirportCode(artifact.destination ?? '') || artifact.destination || '';
      const defaultTz = resolveTimezone(defaultCity) ?? undefined;
      if (date && artifact.amount && artifact.amount > 0) {
        const cost = makeCost(artifact.amount, artifact.currency ?? preferredCurrency, preferredCurrency, rates);
        events.push({
          id: nanoid(),
          type: 'expense',
          date,
          timezone: defaultTz,
          utcISO: utcForEvent(date, artifact.startTime, defaultTz),
          locationCity: defaultCity,
          locationAddress: artifact.locationAddress,
          description: artifact.vendor ?? artifact.destination ?? 'Expense',
          vendor: artifact.vendor,
          category: 'other',
          cost,
          notes: artifact.notes,
          artifactSources: src ? [src] : undefined,
        } as ExpenseEvent);
      } else if (date) {
        events.push({
          id: nanoid(),
          type: 'activity',
          date,
          timezone: defaultTz,
          utcISO: utcForEvent(date, artifact.startTime, defaultTz),
          locationCity: defaultCity,
          locationAddress: artifact.locationAddress,
          description: artifact.vendor ?? artifact.destination ?? 'Booking',
          category: 'other',
          notes: artifact.notes,
          bookingRef: artifact.confirmationNumber,
          artifactSources: src ? [src] : undefined,
        } as ActivityEvent);
      }
      break;
    }
  }

  return events;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a chronologically sorted, deduplicated timeline from parsed artifacts.
 * Pass preferredCurrency + rates so expense events can store converted amounts.
 */
export function buildTimeline(
  artifacts: ParsedArtifact[],
  sourceFileNames?: string[],
  preferredCurrency = 'CAD',
  rates: Record<string, number> = {},
): TimelineEvent[] {
  return deduplicateTimeline(
    artifacts.flatMap((a, i) => extractEvents(a, sourceFileNames?.[i], preferredCurrency, rates)),
  );
}

/**
 * Deduplicate a timeline using per-type canonical keys.
 * Manual expense events are never deduplicated.
 * When duplicates are found, the one with richer data wins and the source is combined.
 */
export function deduplicateTimeline(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Map<string, TimelineEvent>();
  const noKey: TimelineEvent[] = [];

  for (const e of events) {
    const key = dedupKey(e);
    if (!key) {
      // No dedup key (manual expenses) — keep as-is
      noKey.push(e);
      continue;
    }
    const existing = seen.get(key);
    if (existing) {
      seen.set(key, mergeEvents(existing, e));
    } else {
      seen.set(key, e);
    }
  }

  return [...seen.values(), ...noKey].sort((a, b) =>
    eventSortKey(a).localeCompare(eventSortKey(b)),
  );
}

/**
 * Merge two timelines, deduplicate, and return sorted.
 */
export function mergeTimelines(existing: TimelineEvent[], incoming: TimelineEvent[]): TimelineEvent[] {
  return deduplicateTimeline([...existing, ...incoming]);
}

// ─── Connection event migration ───────────────────────────────────────────────

/**
 * Convert legacy FlightConnectionEvent records to dep+arr pairs linked by journeyId.
 * Also applies the same journeyId to adjacent outer departure/arrival events that
 * can be matched by flight number.
 */
function migrateConnectionEvents(events: TimelineEvent[]): TimelineEvent[] {
  const connections = events.filter(
    (e): e is FlightConnectionEvent => e.type === 'flight' && e.subtype === 'connection',
  );
  if (connections.length === 0) return events;

  // Index existing dep/arr events by flightNo for outer-leg matching
  const depByFlightNo = new Map<string, FlightDepartureEvent>();
  const arrByFlightNo = new Map<string, FlightArrivalEvent>();
  for (const e of events) {
    if (e.type === 'flight' && e.subtype === 'departure') {
      const fe = e as FlightDepartureEvent;
      if (fe.flightNo) depByFlightNo.set(fe.flightNo, fe);
    }
    if (e.type === 'flight' && e.subtype === 'arrival') {
      const fe = e as FlightArrivalEvent;
      if (fe.flightNo) arrByFlightNo.set(fe.flightNo, fe);
    }
  }

  const journeyIdForEventId = new Map<string, string>(); // existing event id → journeyId
  const replacements = new Map<string, TimelineEvent[]>(); // connection id → [arr, dep]

  for (const conn of connections) {
    const journeyId = nanoid();

    // Reconstruct inbound arrival at the connection airport
    const connArr: FlightArrivalEvent = {
      id: nanoid(),
      type: 'flight', subtype: 'arrival',
      date: conn.date,
      time: conn.time,
      utcISO: conn.utcISO,
      timezone: conn.timezone,
      locationCity: conn.locationCity,
      flightNo: conn.inboundFlightNo ?? '',
      departureAirport: conn.inboundFromAirport,
      arrivalAirport: conn.connectionAirport,
      bookingRef: conn.bookingRef,
      artifactSources: conn.artifactSources,
      journeyId,
    };

    // Reconstruct outbound departure from the connection airport
    const connDep: FlightDepartureEvent = {
      id: nanoid(),
      type: 'flight', subtype: 'departure',
      date: conn.departureDate ?? conn.date,
      time: conn.departureTime,
      utcISO: conn.departureUtcISO,
      timezone: conn.timezone,
      locationCity: conn.locationCity,
      flightNo: conn.outboundFlightNo ?? '',
      departureAirport: conn.connectionAirport,
      arrivalAirport: conn.outboundToAirport,
      bookingRef: conn.bookingRef,
      artifactSources: conn.artifactSources,
      journeyId,
    };

    replacements.set(conn.id, [connArr, connDep]);

    // Tag outer events with the same journeyId when matched by flight number
    if (conn.inboundFlightNo) {
      const outer = depByFlightNo.get(conn.inboundFlightNo);
      if (outer) journeyIdForEventId.set(outer.id, journeyId);
    }
    if (conn.outboundFlightNo) {
      const outer = arrByFlightNo.get(conn.outboundFlightNo);
      if (outer) journeyIdForEventId.set(outer.id, journeyId);
    }
  }

  const result: TimelineEvent[] = [];
  for (const e of events) {
    if (e.type === 'flight' && e.subtype === 'connection') {
      const reps = replacements.get(e.id);
      if (reps) result.push(...reps);
    } else {
      const jid = journeyIdForEventId.get(e.id);
      result.push(jid ? { ...e, journeyId: jid } as TimelineEvent : e);
    }
  }
  return result;
}

// ─── Migration: old TravelEvent[] → TimelineEvent[] ─────────────────────────

interface LegacyTravelEvent {
  date: string;
  time?: string;
  utcDateTime?: string;
  kind: string;
  headline: string;
  details?: string;
  city?: string;
  amount?: number;
  currency?: string;
  artifactSources?: string[];
}

/**
 * Detect whether a raw event array uses the old TravelEvent format (has `kind` field).
 * Converts old events to the new TimelineEvent[] format, generating ExpenseEvents
 * for any old events that had an amount.
 */
export function migrateTimeline(raw: unknown[]): TimelineEvent[] {
  if (!raw.length) return [];

  // Detect old format by presence of `kind` field
  const first = raw[0] as Record<string, unknown>;
  const isOldFormat = typeof first.kind === 'string' && !('type' in first);
  if (!isOldFormat) {
    // Upgrade intermediate format: artifactSource (singular string) → artifactSources (array)
    // Then normalise: derive date/time from utcISO+timezone when both are present.
    const normalized = (raw as Record<string, unknown>[]).map((e) => {
      let event: TimelineEvent;
      if (!Array.isArray(e.artifactSources) && typeof e.artifactSource === 'string') {
        const { artifactSource, ...rest } = e;
        event = { ...rest, artifactSources: [artifactSource] } as unknown as TimelineEvent;
      } else {
        event = e as unknown as TimelineEvent;
      }
      return normalizeEvent(event);
    });
    // Convert legacy FlightConnectionEvent → dep+arr pairs with shared journeyId
    const migrated = migrateConnectionEvents(normalized);
    // Fix hotel expenses that were stored on checkout date — move them to check-in date.
    const checkInById = new Map<string, TimelineEvent>();
    for (const e of migrated) {
      if (e.type === 'hotel' && (e as HotelCheckInEvent).subtype === 'check_in') {
        checkInById.set(e.id, e);
      }
    }
    for (const e of migrated) {
      if (e.type === 'expense' && (e as ExpenseEvent).category === 'hotels' && (e as ExpenseEvent).linkedEventId) {
        const linked = checkInById.get((e as ExpenseEvent).linkedEventId!);
        if (linked && linked.date !== e.date) {
          e.date = linked.date;
          e.time = (linked as HotelCheckInEvent).time;
          e.utcISO = linked.utcISO;
        }
      }
    }
    return migrated.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
  }

  const events: TimelineEvent[] = [];

  for (const rawEvent of raw as LegacyTravelEvent[]) {
    const src = rawEvent.artifactSources?.[0];
    const city = rawEvent.city ?? '';

    // Helper to make a Cost from old amount/currency fields (no conversion rates available)
    const legacyCost = (amount: number, currency: string): Cost => ({
      amountPreferredCurrency: amount,
      preferredCurrency: currency,
    });

    switch (rawEvent.kind) {
      case 'departure': {
        // Best-effort: extract flight number from headline like "AC856: Toronto (YYZ) → London (LHR)"
        const match = rawEvent.headline.match(/^([A-Z]{2}\d+):\s*(.+?)\s*→\s*(.+)$/);
        const flightNo = match?.[1] ?? rawEvent.headline;
        const depAirport = match?.[2] ?? rawEvent.city ?? rawEvent.headline;
        const arrAirport = match?.[3] ?? '';
        const dep: FlightDepartureEvent = {
          id: nanoid(),
          type: 'flight',
          subtype: 'departure',
          date: rawEvent.date,
          time: rawEvent.time,
          utcISO: rawEvent.utcDateTime,
          locationCity: stripAirportCode(depAirport) || city,
          flightNo,
          departureAirport: depAirport,
          arrivalAirport: arrAirport,
          notes: rawEvent.details,
          artifactSources: src ? [src] : undefined,
        };
        events.push(dep);
        // Legacy cost → ExpenseEvent
        if (rawEvent.amount && rawEvent.amount > 0) {
          events.push({
            id: nanoid(),
            type: 'expense',
            date: dep.date,
            locationCity: dep.locationCity,
            description: `Flight ${dep.flightNo}`,
            category: 'flights',
            cost: legacyCost(rawEvent.amount, rawEvent.currency ?? 'CAD'),
            linkedEventId: dep.id,
            artifactSources: src ? [src] : undefined,
          } as ExpenseEvent);
        }
        break;
      }

      case 'arrival': {
        const match = rawEvent.headline.match(/^([A-Z]{2}\d+):\s*(.+?)\s*→\s*(.+)$/);
        const flightNo = match?.[1] ?? rawEvent.headline;
        const depAirport = match?.[2] ?? '';
        const arrAirport = match?.[3] ?? rawEvent.city ?? rawEvent.headline;
        events.push({
          id: nanoid(),
          type: 'flight',
          subtype: 'arrival',
          date: rawEvent.date,
          time: rawEvent.time,
          utcISO: rawEvent.utcDateTime,
          locationCity: stripAirportCode(arrAirport) || city,
          flightNo,
          departureAirport: depAirport,
          arrivalAirport: arrAirport,
          artifactSources: src ? [src] : undefined,
        } as FlightArrivalEvent);
        break;
      }

      case 'hotel_checkin': {
        const hi: HotelCheckInEvent = {
          id: nanoid(),
          type: 'hotel',
          subtype: 'check_in',
          date: rawEvent.date,
          time: rawEvent.time,
          utcISO: rawEvent.utcDateTime,
          locationCity: city,
          hotelName: rawEvent.headline,
          checkoutDate: rawEvent.date, // unknown checkout
          breakfastIncluded: false,
          amenities: [],
          artifactSources: src ? [src] : undefined,
        };
        events.push(hi);
        if (rawEvent.amount && rawEvent.amount > 0) {
          events.push({
            id: nanoid(),
            type: 'expense',
            date: hi.date,
            locationCity: hi.locationCity,
            description: hi.hotelName,
            category: 'hotels',
            cost: legacyCost(rawEvent.amount, rawEvent.currency ?? 'CAD'),
            linkedEventId: hi.id,
            artifactSources: src ? [src] : undefined,
          } as ExpenseEvent);
        }
        break;
      }

      case 'hotel_checkout': {
        events.push({
          id: nanoid(),
          type: 'hotel',
          subtype: 'check_out',
          date: rawEvent.date,
          time: rawEvent.time,
          utcISO: rawEvent.utcDateTime,
          locationCity: city,
          hotelName: rawEvent.headline,
          artifactSources: src ? [src] : undefined,
        } as HotelCheckOutEvent);
        break;
      }

      case 'car_pickup':
      case 'car_dropoff': {
        const isPickup = rawEvent.kind === 'car_pickup';
        const match = rawEvent.headline.match(/(.+?)\s*→\s*(.+)/);
        const depLoc = match?.[1] ?? city;
        const arrLoc = match?.[2] ?? city;
        if (isPickup) {
          const dep: TransportDepartureEvent = {
            id: nanoid(),
            type: 'otherTransportation',
            subtype: 'departure',
            date: rawEvent.date,
            time: rawEvent.time,
            utcISO: rawEvent.utcDateTime,
            locationCity: city,
            transportType: 'car_rental',
            departureLocation: depLoc,
            arrivalLocation: arrLoc,
            artifactSources: src ? [src] : undefined,
          };
          events.push(dep);
          if (rawEvent.amount && rawEvent.amount > 0) {
            events.push({
              id: nanoid(),
              type: 'expense',
              date: dep.date,
              locationCity: dep.locationCity,
              description: `Car rental`,
              category: 'car_rental',
              cost: legacyCost(rawEvent.amount, rawEvent.currency ?? 'CAD'),
              linkedEventId: dep.id,
              artifactSources: src ? [src] : undefined,
            } as ExpenseEvent);
          }
        } else {
          events.push({
            id: nanoid(),
            type: 'otherTransportation',
            subtype: 'arrival',
            date: rawEvent.date,
            time: rawEvent.time,
            utcISO: rawEvent.utcDateTime,
            locationCity: city,
            transportType: 'car_rental',
            departureLocation: depLoc,
            arrivalLocation: arrLoc,
            artifactSources: src ? [src] : undefined,
          } as TransportArrivalEvent);
        }
        break;
      }

      default: {
        // Generic events → ActivityEvent; costs → ExpenseEvent
        if (rawEvent.amount && rawEvent.amount > 0) {
          events.push({
            id: nanoid(),
            type: 'expense',
            date: rawEvent.date,
            locationCity: city,
            description: rawEvent.headline,
            category: 'other',
            cost: legacyCost(rawEvent.amount, rawEvent.currency ?? 'CAD'),
            notes: rawEvent.details,
            artifactSources: src ? [src] : undefined,
          } as ExpenseEvent);
        } else {
          events.push({
            id: nanoid(),
            type: 'activity',
            date: rawEvent.date,
            time: rawEvent.time,
            utcISO: rawEvent.utcDateTime,
            locationCity: city,
            description: rawEvent.headline,
            category: 'other',
            notes: rawEvent.details,
            artifactSources: src ? [src] : undefined,
          } as ActivityEvent);
        }
        break;
      }
    }
  }

  return events.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));
}
