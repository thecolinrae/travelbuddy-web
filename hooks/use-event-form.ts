import { useState } from 'react';
import { localToUtcISO } from '@/services/timezone';
import { useSaveTimelineEvent } from '@/hooks/use-trip-mutations';
import type {
  ActivityEvent,
  TransportDepartureEvent,
  TransportArrivalEvent,
  FlightDepartureEvent,
  FlightArrivalEvent,
  HotelCheckInEvent,
  HotelCheckOutEvent,
  TimelineEvent,
} from '@/types';
import type { TransportPrefill } from '@/components/trip/EventFormModal';

export type FormType =
  | 'activity'
  | 'transport'
  | 'other'
  | 'flightDep'
  | 'flightArr'
  | 'hotelIn'
  | 'hotelOut';

interface UseEventFormProps {
  tripId: string;
  editing?: TimelineEvent;
  transportPrefill?: TransportPrefill;
}

export function useEventForm({ tripId, editing, transportPrefill }: UseEventFormProps) {
  const saveEvent = useSaveTimelineEvent(tripId);

  const detectType = (): FormType => {
    if (transportPrefill) return 'transport';
    if (!editing) return 'activity';
    if (editing.type === 'activity') return 'activity';
    if (editing.type === 'otherTransportation') return 'transport';
    if (editing.type === 'flight' && editing.subtype === 'departure') return 'flightDep';
    if (editing.type === 'flight' && editing.subtype === 'arrival') return 'flightArr';
    if (editing.type === 'hotel' && editing.subtype === 'check_in') return 'hotelIn';
    if (editing.type === 'hotel' && editing.subtype === 'check_out') return 'hotelOut';
    return 'other';
  };

  const [formType, setFormType] = useState<FormType>(detectType);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Common ──────────────────────────────────────────────────────────────────
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(editing?.time ?? '');
  const [locationCity, setLocationCity] = useState(editing?.locationCity ?? '');
  const [timezone, setTimezone] = useState<string | undefined>(editing?.timezone ?? undefined);

  // ── Activity ─────────────────────────────────────────────────────────────────
  const act = editing?.type === 'activity' ? (editing as ActivityEvent) : null;
  const originalDescription = act?.description ?? '';
  const [description, setDescription] = useState(act?.description ?? '');
  const [actCategory, setActCategory] = useState(act?.category ?? 'sightseeing');
  const [actAddress, setActAddress] = useState(editing?.locationAddress ?? '');
  const [actNotes, setActNotes] = useState(act?.notes ?? '');
  const [actBookingRef, setActBookingRef] = useState(act?.bookingRef ?? '');
  const [enrichedOverrides, setEnrichedOverrides] = useState<Partial<ActivityEvent>>({});
  const [enriching, setEnriching] = useState(false);

  // ── Transport ─────────────────────────────────────────────────────────────────
  const tr = editing?.type === 'otherTransportation' ? (editing as TransportDepartureEvent | TransportArrivalEvent) : null;
  const [transportSubtype, setTransportSubtype] = useState<'departure' | 'arrival'>(
    transportPrefill?.transportSubtype ?? (tr?.subtype === 'arrival' ? 'arrival' : 'departure'),
  );
  const [depLocation, setDepLocation] = useState(transportPrefill?.depLocation ?? tr?.departureLocation ?? '');
  const [arrLocation, setArrLocation] = useState(transportPrefill?.arrLocation ?? tr?.arrivalLocation ?? '');
  const [transportType, setTransportType] = useState<TransportDepartureEvent['transportType']>(
    transportPrefill?.transportType ?? tr?.transportType ?? 'other',
  );
  const [vendor, setVendor] = useState(transportPrefill?.vendor ?? tr?.vendor ?? '');
  const [trBookingRef, setTrBookingRef] = useState(transportPrefill?.bookingRef ?? (tr as TransportDepartureEvent | null)?.bookingRef ?? '');
  const [trNotes, setTrNotes] = useState((tr as TransportDepartureEvent | null)?.notes ?? '');

  // ── Flight ────────────────────────────────────────────────────────────────────
  const fd = editing?.type === 'flight' && editing.subtype === 'departure' ? (editing as FlightDepartureEvent) : null;
  const fa = editing?.type === 'flight' && editing.subtype === 'arrival' ? (editing as FlightArrivalEvent) : null;
  const flightBase = fd ?? fa;
  const [flightNo, setFlightNo] = useState(flightBase?.flightNo ?? '');
  const [depAirport, setDepAirport] = useState(flightBase?.departureAirport ?? '');
  const [arrAirport, setArrAirport] = useState(flightBase?.arrivalAirport ?? '');
  const [flightBookingRef, setFlightBookingRef] = useState(flightBase?.bookingRef ?? '');

  // ── Flight departure advanced ─────────────────────────────────────────────────
  const [seatNumber, setSeatNumber] = useState(fd?.seatNumber ?? '');
  const [gate, setGate] = useState(fd?.gate ?? '');
  const [boardingTime, setBoardingTime] = useState(fd?.boardingTime ?? '');
  const [travelClass, setTravelClass] = useState(fd?.travelClass ?? '');
  const [baggageAllowance, setBaggageAllowance] = useState(fd?.baggageAllowance ?? '');
  const [fdNotes, setFdNotes] = useState(fd?.notes ?? '');

  // ── Hotel ─────────────────────────────────────────────────────────────────────
  const hi = editing?.type === 'hotel' && editing.subtype === 'check_in' ? (editing as HotelCheckInEvent) : null;
  const ho = editing?.type === 'hotel' && editing.subtype === 'check_out' ? (editing as HotelCheckOutEvent) : null;
  const hotelBase = hi ?? ho;
  const [hotelName, setHotelName] = useState(hotelBase?.hotelName ?? '');
  const [hotelAddress, setHotelAddress] = useState(editing?.locationAddress ?? '');
  const [hotelBookingRef, setHotelBookingRef] = useState(hotelBase?.bookingRef ?? '');

  // ── Hotel check-in specific ───────────────────────────────────────────────────
  const [checkoutDate, setCheckoutDate] = useState(hi?.checkoutDate ?? '');
  const [checkoutTime, setCheckoutTime] = useState(hi?.checkoutTime ?? '');
  const [breakfastIncluded, setBreakfastIncluded] = useState(hi?.breakfastIncluded ?? false);
  const [roomType, setRoomType] = useState(hi?.roomType ?? '');
  const [hiNotes, setHiNotes] = useState(hi?.notes ?? '');

  const [saving, setSaving] = useState(false);

  // ── Re-enrich activity details ────────────────────────────────────────────────
  async function handleReEnrich() {
    if (!description.trim() || enriching) return;
    setEnriching(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/activities/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: description.trim(), city: locationCity || undefined }),
      });
      if (!res.ok) return;
      const data = await res.json() as {
        type?: string;
        locationAddress?: string;
        estimatedCost?: string;
        duration?: string;
        bestTime?: string;
        tips?: string;
        familyFriendly?: boolean;
        highlights?: string[];
      };
      if (data.type) setActCategory(data.type);
      if (data.locationAddress) setActAddress(data.locationAddress);
      setEnrichedOverrides({
        estimatedCost: data.estimatedCost,
        duration: data.duration,
        bestTime: data.bestTime,
        tips: data.tips,
        familyFriendly: data.familyFriendly,
        highlights: data.highlights,
      });
    } finally {
      setEnriching(false);
    }
  }

  // ── Build payload ─────────────────────────────────────────────────────────────
  function buildEvent(): Omit<TimelineEvent, 'id'> {
    const base = editing
      ? { ...editing }
      : transportPrefill?.journeyId
        ? { journeyId: transportPrefill.journeyId }
        : {};

    if (editing && (date !== editing.date || (time || '') !== (editing.time || '') || timezone !== editing.timezone)) {
      delete (base as Partial<TimelineEvent>).utcISO;
    }

    if (timezone && date && time) {
      (base as Partial<TimelineEvent>).utcISO = localToUtcISO(date, time, timezone);
    }

    const common = { date, time: time || undefined, locationCity, timezone: timezone || undefined };

    if (formType === 'flightDep') {
      return {
        ...base, ...common,
        type: 'flight', subtype: 'departure',
        flightNo: flightNo.trim(),
        departureAirport: depAirport.trim(),
        arrivalAirport: arrAirport.trim(),
        bookingRef: flightBookingRef.trim() || undefined,
        notes: fdNotes.trim() || undefined,
        seatNumber: seatNumber.trim() || undefined,
        gate: gate.trim() || undefined,
        boardingTime: boardingTime || undefined,
        travelClass: travelClass || undefined,
        baggageAllowance: baggageAllowance.trim() || undefined,
      } as Omit<FlightDepartureEvent, 'id'>;
    }

    if (formType === 'flightArr') {
      return {
        ...base, ...common,
        type: 'flight', subtype: 'arrival',
        flightNo: flightNo.trim(),
        departureAirport: depAirport.trim(),
        arrivalAirport: arrAirport.trim(),
        bookingRef: flightBookingRef.trim() || undefined,
      } as Omit<FlightArrivalEvent, 'id'>;
    }

    if (formType === 'hotelIn') {
      return {
        ...base, ...common,
        type: 'hotel', subtype: 'check_in',
        hotelName: hotelName.trim(),
        locationAddress: hotelAddress.trim() || undefined,
        checkoutDate: checkoutDate || date,
        checkoutTime: checkoutTime || undefined,
        breakfastIncluded,
        amenities: (base as Partial<HotelCheckInEvent>).amenities ?? [],
        roomType: roomType.trim() || undefined,
        bookingRef: hotelBookingRef.trim() || undefined,
        notes: hiNotes.trim() || undefined,
      } as Omit<HotelCheckInEvent, 'id'>;
    }

    if (formType === 'hotelOut') {
      return {
        ...base, ...common,
        type: 'hotel', subtype: 'check_out',
        hotelName: hotelName.trim(),
        locationAddress: hotelAddress.trim() || undefined,
        bookingRef: hotelBookingRef.trim() || undefined,
      } as Omit<HotelCheckOutEvent, 'id'>;
    }

    if (formType === 'transport') {
      if (transportSubtype === 'arrival') {
        return {
          ...base, ...common,
          type: 'otherTransportation', subtype: 'arrival',
          transportType,
          departureLocation: depLocation.trim(),
          arrivalLocation: arrLocation.trim(),
          locationCity: arrLocation.trim(),
          vendor: vendor.trim() || undefined,
          bookingRef: trBookingRef.trim() || undefined,
        } as Omit<TransportArrivalEvent, 'id'>;
      }
      return {
        ...base, ...common,
        type: 'otherTransportation', subtype: 'departure',
        transportType,
        departureLocation: depLocation.trim(),
        arrivalLocation: arrLocation.trim(),
        locationCity: depLocation.trim(),
        vendor: vendor.trim() || undefined,
        bookingRef: trBookingRef.trim() || undefined,
        notes: trNotes.trim() || undefined,
      } as Omit<TransportDepartureEvent, 'id'>;
    }

    // activity / other
    return {
      ...base, ...enrichedOverrides, ...common,
      type: 'activity',
      description: description.trim(),
      category: formType === 'other' ? 'other' : actCategory,
      locationAddress: actAddress.trim() || undefined,
      notes: actNotes.trim() || undefined,
      bookingRef: actBookingRef.trim() || undefined,
    } as Omit<ActivityEvent, 'id'>;
  }

  function isValid(): boolean {
    if (!date) return false;
    if (formType === 'activity' || formType === 'other') return !!description.trim();
    if (formType === 'transport') return !!depLocation.trim() && !!arrLocation.trim();
    if (formType === 'flightDep' || formType === 'flightArr')
      return !!flightNo.trim() && !!depAirport.trim() && !!arrAirport.trim();
    if (formType === 'hotelIn' || formType === 'hotelOut') return !!hotelName.trim();
    return false;
  }

  async function handleSave(onSaved: () => void, onClose: () => void) {
    if (!isValid()) return;
    setSaving(true);
    try {
      const payload = buildEvent();
      await saveEvent.mutateAsync(editing ? { ...payload, id: editing.id } : payload);
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function dialogTitle() {
    if (!editing) return 'Add event';
    if (formType === 'flightDep') return 'Edit flight departure';
    if (formType === 'flightArr') return 'Edit flight arrival';
    if (formType === 'hotelIn') return 'Edit hotel check-in';
    if (formType === 'hotelOut') return 'Edit hotel check-out';
    if (formType === 'transport') return editing ? 'Edit transport' : `Add transport ${transportSubtype}`;
    return 'Edit event';
  }

  return {
    // UI state
    formType, setFormType,
    showAdvanced, setShowAdvanced,
    saving,
    // Common fields
    date, setDate,
    time, setTime,
    locationCity, setLocationCity,
    timezone, setTimezone,
    // Activity fields
    description, setDescription,
    actCategory, setActCategory,
    actAddress, setActAddress,
    actNotes, setActNotes,
    actBookingRef, setActBookingRef,
    enriching,
    originalDescription,
    handleReEnrich,
    // Transport fields
    transportSubtype, setTransportSubtype,
    depLocation, setDepLocation,
    arrLocation, setArrLocation,
    transportType, setTransportType,
    vendor, setVendor,
    trBookingRef, setTrBookingRef,
    trNotes, setTrNotes,
    // Flight fields
    flightNo, setFlightNo,
    depAirport, setDepAirport,
    arrAirport, setArrAirport,
    flightBookingRef, setFlightBookingRef,
    seatNumber, setSeatNumber,
    gate, setGate,
    boardingTime, setBoardingTime,
    travelClass, setTravelClass,
    baggageAllowance, setBaggageAllowance,
    fdNotes, setFdNotes,
    // Hotel fields
    hotelName, setHotelName,
    hotelAddress, setHotelAddress,
    hotelBookingRef, setHotelBookingRef,
    checkoutDate, setCheckoutDate,
    checkoutTime, setCheckoutTime,
    breakfastIncluded, setBreakfastIncluded,
    roomType, setRoomType,
    hiNotes, setHiNotes,
    // Actions
    handleSave,
    isValid,
    dialogTitle,
  };
}

export type EventFormState = ReturnType<typeof useEventForm>;
