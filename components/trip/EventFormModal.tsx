'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

type FormType =
  | 'activity'
  | 'transport'
  | 'other'
  | 'flightDep'
  | 'flightArr'
  | 'hotelIn'
  | 'hotelOut';

/** Pre-populate a new (non-edit) transport event — used when adding a missing counterpart. */
export interface TransportPrefill {
  transportSubtype: 'departure' | 'arrival';
  depLocation?: string;
  arrLocation?: string;
  transportType?: TransportDepartureEvent['transportType'];
  vendor?: string;
  bookingRef?: string;
  journeyId?: string;
}

interface Props {
  tripId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: TimelineEvent;
  /** Pre-fills a new transport event (create mode, not edit). */
  transportPrefill?: TransportPrefill;
}

export function EventFormModal({ tripId, open, onClose, onSaved, editing, transportPrefill }: Props) {
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

  // ── Activity ─────────────────────────────────────────────────────────────────
  const act = editing?.type === 'activity' ? (editing as ActivityEvent) : null;
  const [description, setDescription] = useState(act?.description ?? '');
  const [actCategory, setActCategory] = useState(act?.category ?? 'sightseeing');
  const [actAddress, setActAddress] = useState(editing?.locationAddress ?? '');
  const [actNotes, setActNotes] = useState(act?.notes ?? '');
  const [actBookingRef, setActBookingRef] = useState(act?.bookingRef ?? '');

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

  // ── Flight (shared departure + arrival fields) ────────────────────────────────
  const fd =
    editing?.type === 'flight' && editing.subtype === 'departure'
      ? (editing as FlightDepartureEvent)
      : null;
  const fa =
    editing?.type === 'flight' && editing.subtype === 'arrival'
      ? (editing as FlightArrivalEvent)
      : null;
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

  // ── Hotel (shared check-in + check-out fields) ────────────────────────────────
  const hi =
    editing?.type === 'hotel' && editing.subtype === 'check_in'
      ? (editing as HotelCheckInEvent)
      : null;
  const ho =
    editing?.type === 'hotel' && editing.subtype === 'check_out'
      ? (editing as HotelCheckOutEvent)
      : null;
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

  // ── Build payload ─────────────────────────────────────────────────────────────
  // Spread editing first so non-form fields (journeyId, utcISO, artifactSources, etc.)
  // are preserved exactly as-is.
  function buildEvent(): Omit<TimelineEvent, 'id'> {
    const base = editing
      ? { ...editing }
      : transportPrefill?.journeyId
        ? { journeyId: transportPrefill.journeyId }
        : {};

    // If the user changed date or time, the stored utcISO is no longer valid.
    // Clear it so sorting falls back to the new local date+time instead of the old UTC value.
    if (editing && (date !== editing.date || (time || '') !== (editing.time || ''))) {
      delete (base as Partial<TimelineEvent>).utcISO;
    }

    const common = { date, time: time || undefined, locationCity };

    if (formType === 'flightDep') {
      return {
        ...base,
        ...common,
        type: 'flight',
        subtype: 'departure',
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
        ...base,
        ...common,
        type: 'flight',
        subtype: 'arrival',
        flightNo: flightNo.trim(),
        departureAirport: depAirport.trim(),
        arrivalAirport: arrAirport.trim(),
        bookingRef: flightBookingRef.trim() || undefined,
      } as Omit<FlightArrivalEvent, 'id'>;
    }

    if (formType === 'hotelIn') {
      return {
        ...base,
        ...common,
        type: 'hotel',
        subtype: 'check_in',
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
        ...base,
        ...common,
        type: 'hotel',
        subtype: 'check_out',
        hotelName: hotelName.trim(),
        locationAddress: hotelAddress.trim() || undefined,
        bookingRef: hotelBookingRef.trim() || undefined,
      } as Omit<HotelCheckOutEvent, 'id'>;
    }

    if (formType === 'transport') {
      if (transportSubtype === 'arrival') {
        return {
          ...base,
          ...common,
          type: 'otherTransportation',
          subtype: 'arrival',
          transportType,
          departureLocation: depLocation.trim(),
          arrivalLocation: arrLocation.trim(),
          locationCity: arrLocation.trim(),
          vendor: vendor.trim() || undefined,
          bookingRef: trBookingRef.trim() || undefined,
        } as Omit<TransportArrivalEvent, 'id'>;
      }
      return {
        ...base,
        ...common,
        type: 'otherTransportation',
        subtype: 'departure',
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
      ...base,
      ...common,
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

  async function handleSave() {
    if (!isValid()) return;
    setSaving(true);
    try {
      const payload = buildEvent();
      if (editing) {
        await fetch(`/api/trips/${tripId}/timeline/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`/api/trips/${tripId}/timeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
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


  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle()}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Type selector */}
          {!editing ? (
            // New event: compact button strip for the three create types
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'activity', label: '🎭 Activity' },
                    { value: 'transport', label: '🚌 Transport' },
                    { value: 'other',    label: '📌 Other' },
                  ] as { value: FormType; label: string }[]
                ).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setFormType(t.value)}
                    className={[
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      formType === t.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Edit mode: dropdown covering all six editable types
            <div className="space-y-1.5">
              <Label htmlFor="ev-type">Event type</Label>
              <Select
                id="ev-type"
                value={formType}
                onChange={(e) => setFormType(e.target.value as FormType)}
              >
                <option value="flightDep">Flight departure</option>
                <option value="flightArr">Flight arrival</option>
                <option value="hotelIn">Hotel check-in</option>
                <option value="hotelOut">Hotel check-out</option>
                <option value="transport">Transport</option>
                <option value="activity">Activity</option>
                <option value="other">Other</option>
              </Select>
            </div>
          )}

          {/* Date + time — all types */}
          <div className="flex gap-3">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="ev-date">Date</Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="ev-time">Time (optional)</Label>
              <Input
                id="ev-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {/* ── Activity / Other ─────────────────────────────────────────────── */}
          {(formType === 'activity' || formType === 'other') && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ev-desc">Description</Label>
                <Input
                  id="ev-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Visit the Louvre"
                />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-city">City</Label>
                  <Input
                    id="ev-city"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    placeholder="e.g. Paris"
                  />
                </div>
                {formType === 'activity' && (
                  <div className="space-y-1.5 flex-1">
                    <Label htmlFor="ev-cat">Category</Label>
                    <Select
                      id="ev-cat"
                      value={actCategory}
                      onChange={(e) => setActCategory(e.target.value)}
                    >
                      <option value="sightseeing">Sightseeing</option>
                      <option value="food">Food</option>
                      <option value="adventure">Adventure</option>
                      <option value="culture">Culture</option>
                      <option value="shopping">Shopping</option>
                      <option value="nightlife">Nightlife</option>
                      <option value="nature">Nature</option>
                      <option value="wellness">Wellness</option>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-addr">Address (optional)</Label>
                <Input
                  id="ev-addr"
                  value={actAddress}
                  onChange={(e) => setActAddress(e.target.value)}
                  placeholder="Neighbourhood or address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-act-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-act-bref"
                  value={actBookingRef}
                  onChange={(e) => setActBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-act-notes">Notes (optional)</Label>
                <Input
                  id="ev-act-notes"
                  value={actNotes}
                  onChange={(e) => setActNotes(e.target.value)}
                  placeholder="Any notes"
                />
              </div>
            </>
          )}

          {/* ── Transport ────────────────────────────────────────────────────── */}
          {formType === 'transport' && (
            <>
              {/* Subtype toggle */}
              <div className="space-y-1.5">
                <Label>Leg type</Label>
                <div className="flex gap-2">
                  {(['departure', 'arrival'] as const).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setTransportSubtype(sub)}
                      className={[
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors capitalize',
                        transportSubtype === sub
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground/40',
                      ].join(' ')}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-dep">From</Label>
                  <Input
                    id="ev-dep"
                    value={depLocation}
                    onChange={(e) => setDepLocation(e.target.value)}
                    placeholder="e.g. Paris"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-arr">To</Label>
                  <Input
                    id="ev-arr"
                    value={arrLocation}
                    onChange={(e) => setArrLocation(e.target.value)}
                    placeholder="e.g. Lyon"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-ttype">Type</Label>
                  <Select
                    id="ev-ttype"
                    value={transportType}
                    onChange={(e) =>
                      setTransportType(e.target.value as TransportDepartureEvent['transportType'])
                    }
                  >
                    <option value="bus">Bus</option>
                    <option value="train">Train</option>
                    <option value="ferry">Ferry</option>
                    <option value="car_rental">Car rental</option>
                    <option value="taxi">Taxi</option>
                    <option value="rideshare">Rideshare</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-vendor">Vendor (optional)</Label>
                  <Input
                    id="ev-vendor"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="e.g. Eurostar"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-tr-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-tr-bref"
                  value={trBookingRef}
                  onChange={(e) => setTrBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-tr-notes">Notes (optional)</Label>
                <Input
                  id="ev-tr-notes"
                  value={trNotes}
                  onChange={(e) => setTrNotes(e.target.value)}
                  placeholder="Any notes"
                />
              </div>
            </>
          )}

          {/* ── Flight Departure ─────────────────────────────────────────────── */}
          {formType === 'flightDep' && (
            <>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-fno">Flight number</Label>
                  <Input
                    id="ev-fno"
                    value={flightNo}
                    onChange={(e) => setFlightNo(e.target.value)}
                    placeholder="e.g. AC 123"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-fd-city">City</Label>
                  <Input
                    id="ev-fd-city"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    placeholder="e.g. Toronto"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-dep-apt">From (airport)</Label>
                  <Input
                    id="ev-dep-apt"
                    value={depAirport}
                    onChange={(e) => setDepAirport(e.target.value)}
                    placeholder="e.g. YYZ"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-arr-apt">To (airport)</Label>
                  <Input
                    id="ev-arr-apt"
                    value={arrAirport}
                    onChange={(e) => setArrAirport(e.target.value)}
                    placeholder="e.g. LHR"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-fd-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-fd-bref"
                  value={flightBookingRef}
                  onChange={(e) => setFlightBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-fd-notes">Notes (optional)</Label>
                <Input
                  id="ev-fd-notes"
                  value={fdNotes}
                  onChange={(e) => setFdNotes(e.target.value)}
                  placeholder="Any notes"
                />
              </div>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {showAdvanced ? 'Fewer details' : 'More details'}
              </button>

              {showAdvanced && (
                <div className="space-y-3 rounded-lg border bg-muted/30 px-3 py-3">
                  <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="ev-seat">Seat</Label>
                      <Input
                        id="ev-seat"
                        value={seatNumber}
                        onChange={(e) => setSeatNumber(e.target.value)}
                        placeholder="e.g. 12A"
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="ev-gate">Gate</Label>
                      <Input
                        id="ev-gate"
                        value={gate}
                        onChange={(e) => setGate(e.target.value)}
                        placeholder="e.g. B22"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="ev-boarding">Boarding time</Label>
                      <Input
                        id="ev-boarding"
                        type="time"
                        value={boardingTime}
                        onChange={(e) => setBoardingTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <Label htmlFor="ev-class">Travel class</Label>
                      <Select
                        id="ev-class"
                        value={travelClass}
                        onChange={(e) => setTravelClass(e.target.value)}
                      >
                        <option value="">Not specified</option>
                        <option value="Economy">Economy</option>
                        <option value="Premium Economy">Premium Economy</option>
                        <option value="Business">Business</option>
                        <option value="First">First</option>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-baggage">Baggage allowance</Label>
                    <Input
                      id="ev-baggage"
                      value={baggageAllowance}
                      onChange={(e) => setBaggageAllowance(e.target.value)}
                      placeholder="e.g. 23 kg"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Flight Arrival ───────────────────────────────────────────────── */}
          {formType === 'flightArr' && (
            <>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-fno">Flight number</Label>
                  <Input
                    id="ev-fno"
                    value={flightNo}
                    onChange={(e) => setFlightNo(e.target.value)}
                    placeholder="e.g. AC 123"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-fa-city">City</Label>
                  <Input
                    id="ev-fa-city"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    placeholder="e.g. London"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-dep-apt">From (airport)</Label>
                  <Input
                    id="ev-dep-apt"
                    value={depAirport}
                    onChange={(e) => setDepAirport(e.target.value)}
                    placeholder="e.g. YYZ"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-arr-apt">To (airport)</Label>
                  <Input
                    id="ev-arr-apt"
                    value={arrAirport}
                    onChange={(e) => setArrAirport(e.target.value)}
                    placeholder="e.g. LHR"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-fa-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-fa-bref"
                  value={flightBookingRef}
                  onChange={(e) => setFlightBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
            </>
          )}

          {/* ── Hotel Check-in ───────────────────────────────────────────────── */}
          {formType === 'hotelIn' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ev-hotel">Hotel name</Label>
                <Input
                  id="ev-hotel"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="e.g. The Ritz London"
                />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-hi-city">City</Label>
                  <Input
                    id="ev-hi-city"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    placeholder="e.g. London"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-hi-addr">Address (optional)</Label>
                  <Input
                    id="ev-hi-addr"
                    value={hotelAddress}
                    onChange={(e) => setHotelAddress(e.target.value)}
                    placeholder="e.g. 15 Piccadilly"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-checkout-date">Check-out date</Label>
                  <Input
                    id="ev-checkout-date"
                    type="date"
                    value={checkoutDate}
                    onChange={(e) => setCheckoutDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-checkout-time">Check-out time (optional)</Label>
                  <Input
                    id="ev-checkout-time"
                    type="time"
                    value={checkoutTime}
                    onChange={(e) => setCheckoutTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-room">Room type (optional)</Label>
                <Input
                  id="ev-room"
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  placeholder="e.g. Deluxe Double"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="ev-breakfast"
                  type="checkbox"
                  checked={breakfastIncluded}
                  onChange={(e) => setBreakfastIncluded(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="ev-breakfast" className="font-normal">
                  Breakfast included
                </Label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-hi-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-hi-bref"
                  value={hotelBookingRef}
                  onChange={(e) => setHotelBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-hi-notes">Notes (optional)</Label>
                <Input
                  id="ev-hi-notes"
                  value={hiNotes}
                  onChange={(e) => setHiNotes(e.target.value)}
                  placeholder="Any notes"
                />
              </div>
            </>
          )}

          {/* ── Hotel Check-out ──────────────────────────────────────────────── */}
          {formType === 'hotelOut' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ev-hotel">Hotel name</Label>
                <Input
                  id="ev-hotel"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="e.g. The Ritz London"
                />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-ho-city">City</Label>
                  <Input
                    id="ev-ho-city"
                    value={locationCity}
                    onChange={(e) => setLocationCity(e.target.value)}
                    placeholder="e.g. London"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="ev-ho-addr">Address (optional)</Label>
                  <Input
                    id="ev-ho-addr"
                    value={hotelAddress}
                    onChange={(e) => setHotelAddress(e.target.value)}
                    placeholder="e.g. 15 Piccadilly"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-ho-bref">Booking ref (optional)</Label>
                <Input
                  id="ev-ho-bref"
                  value={hotelBookingRef}
                  onChange={(e) => setHotelBookingRef(e.target.value)}
                  placeholder="Confirmation number"
                />
              </div>
            </>
          )}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !isValid()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
