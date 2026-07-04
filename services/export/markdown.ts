/**
 * Markdown export service — generates a day-by-day itinerary as a .md file.
 *
 * Structure:
 *   YAML frontmatter (machine-parseable metadata)
 *   # Trip Name
 *   ## At a Glance
 *   ## Itinerary  (### Day N — Weekday, Mon DD — City)
 *   ## Budget Summary  (if any expenses or budget goal)
 *   ## Saved Activities  (if any unsaved/unscheduled activities)
 */

import type { TripExportPayload } from './json';
import type {
  TimelineEvent,
  Activity,
  FlightDepartureEvent,
  FlightArrivalEvent,
  FlightConnectionEvent,
  HotelCheckInEvent,
  TransportDepartureEvent,
  ExpenseEvent,
  ActivityEvent,
  Cost,
  BudgetItemCategory,
} from '@/types';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(time: string | undefined): string {
  if (!time) return '';
  // time is stored as "HH:MM"
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')}${ampm}`;
}

function fmtCost(cost: Cost): string {
  return `$${cost.amountPreferredCurrency.toFixed(2)} ${cost.preferredCurrency}`;
}

function fmtCurrency(amount: number, currency: string): string {
  return `$${amount.toFixed(2)} ${currency}`;
}

function dayKey(date: string): string {
  return date.slice(0, 10);
}

// ─── Day-range generation ─────────────────────────────────────────────────────

function buildDays(startDate: string | null, endDate: string | null, events: TimelineEvent[], activities: Activity[]): string[] {
  // Collect all event dates plus any scheduled activity dates
  const knownDates = new Set<string>([
    ...events.map((e) => dayKey(e.date)),
    ...activities.filter((a) => a.scheduledDate).map((a) => dayKey(a.scheduledDate!)),
  ]);

  if (!startDate && !endDate) {
    return Array.from(knownDates).sort();
  }

  const days: string[] = [];
  const start = new Date((startDate ?? endDate!) + 'T12:00:00');
  const end = new Date((endDate ?? startDate!) + 'T12:00:00');
  const cursor = new Date(start);

  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Add any known dates that fall outside the defined range
  for (const d of knownDates) {
    if (!days.includes(d)) days.push(d);
  }

  return days.sort();
}

// ─── Per-event renderers ──────────────────────────────────────────────────────

function renderFlight(e: FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent): string {
  const lines: string[] = [];

  if (e.subtype === 'departure') {
    const dep = e as FlightDepartureEvent;
    const timeStr = dep.time ? ` · ${fmtTime(dep.time)}` : '';
    lines.push(`**Depart** ${dep.flightNo} · ${dep.departureAirport} → ${dep.arrivalAirport}${timeStr}`);
    const details: string[] = [];
    if (dep.bookingRef) details.push(`Ref: ${dep.bookingRef}`);
    if (dep.seatNumber) details.push(`Seat ${dep.seatNumber}`);
    if (dep.travelClass) details.push(dep.travelClass);
    if (dep.boardingTime) details.push(`Boarding ${fmtTime(dep.boardingTime)}`);
    if (dep.gate) details.push(`Gate ${dep.gate}`);
    if (dep.baggageAllowance) details.push(`Bags: ${dep.baggageAllowance}`);
    if (dep.passengers && dep.passengers.length > 0) {
      details.push(`Passengers: ${dep.passengers.map((p) => p.name + (p.seatNumber ? ` (${p.seatNumber})` : '')).join(', ')}`);
    }
    if (details.length) lines.push(`- ${details.join(' · ')}`);
    if (dep.notes) lines.push(`- ${dep.notes}`);
  } else if (e.subtype === 'arrival') {
    const arr = e as FlightArrivalEvent;
    const timeStr = arr.time ? ` · ${fmtTime(arr.time)}` : '';
    lines.push(`**Arrive** ${arr.flightNo} · ${arr.arrivalAirport}${timeStr}`);
  } else {
    const conn = e as FlightConnectionEvent;
    const layover = conn.layoverMinutes
      ? ` (${Math.floor(conn.layoverMinutes / 60)}h ${conn.layoverMinutes % 60}m layover)`
      : '';
    lines.push(`**Connection** ${conn.connectionAirport}${layover}`);
    if (conn.requiresSecurity || conn.requiresCustoms) {
      const notes: string[] = [];
      if (conn.requiresSecurity) notes.push('security required');
      if (conn.requiresCustoms) notes.push('customs required');
      lines.push(`- ${notes.join(', ')}`);
    }
  }

  return lines.join('\n');
}

function renderHotelCheckIn(e: HotelCheckInEvent): string {
  const lines: string[] = [];
  const nights = e.numberOfNights ? ` · ${e.numberOfNights} night${e.numberOfNights !== 1 ? 's' : ''}` : '';
  lines.push(`**Check in** ${e.hotelName}${nights}`);
  const details: string[] = [];
  if (e.bookingRef) details.push(`Ref: ${e.bookingRef}`);
  if (e.roomType) details.push(e.roomType);
  if (e.breakfastIncluded) details.push('Breakfast included');
  if (e.checkoutDate) details.push(`Check-out: ${fmtDate(e.checkoutDate)}${e.checkoutTime ? ' ' + fmtTime(e.checkoutTime) : ''}`);
  if (details.length) lines.push(`- ${details.join(' · ')}`);
  if (e.locationAddress) lines.push(`- ${e.locationAddress}`);
  if (e.amenities && e.amenities.length > 0) lines.push(`- Amenities: ${e.amenities.join(', ')}`);
  if (e.notes) lines.push(`- ${e.notes}`);
  return lines.join('\n');
}

function renderTransport(e: TransportDepartureEvent): string {
  const type = e.transportType.replace('_', ' ');
  const timeStr = e.time ? ` · ${fmtTime(e.time)}` : '';
  const lines: string[] = [];
  lines.push(`**${type.charAt(0).toUpperCase() + type.slice(1)}** ${e.departureLocation} → ${e.arrivalLocation}${timeStr}`);
  const details: string[] = [];
  if (e.vendor) details.push(e.vendor);
  if (e.bookingRef) details.push(`Ref: ${e.bookingRef}`);
  if (details.length) lines.push(`- ${details.join(' · ')}`);
  if (e.locationAddress) lines.push(`- ${e.locationAddress}`);
  if (e.notes) lines.push(`- ${e.notes}`);
  return lines.join('\n');
}

function renderExpense(e: ExpenseEvent): string {
  const costStr = fmtCost(e.cost);
  const vendor = e.vendor ? ` · ${e.vendor}` : '';
  return `- ${e.description}${vendor} — ${costStr}`;
}

function renderActivity(e: ActivityEvent): string {
  const duration = e.duration ? ` (${e.duration})` : '';
  const cost = e.cost ? ` — ${fmtCost(e.cost)}` : '';
  const details: string[] = [];
  if (e.bookingRef) details.push(`Ref: ${e.bookingRef}`);
  if (e.tips) details.push(`Tip: ${e.tips}`);
  let line = `- ${e.description}${duration}${cost}`;
  if (details.length) line += `\n  - ${details.join(' · ')}`;
  if (e.locationAddress) line += `\n  - ${e.locationAddress}`;
  return line;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateMarkdown(payload: TripExportPayload): string {
  const { trip, timeline, activities } = payload;
  const lines: string[] = [];

  // ── Frontmatter ──────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push(`title: "${trip.name.replace(/"/g, '\\"')}"`);
  lines.push(`destination: "${trip.destination}"`);
  if (trip.destinations.length > 1) {
    lines.push(`destinations: [${trip.destinations.map((d) => `"${d}"`).join(', ')}]`);
  }
  if (trip.startDate) lines.push(`startDate: "${trip.startDate}"`);
  if (trip.endDate) lines.push(`endDate: "${trip.endDate}"`);
  lines.push(`status: ${trip.status}`);
  lines.push(`currency: "${trip.preferredCurrency}"`);
  if (trip.budgetGoal) lines.push(`budgetGoal: ${trip.budgetGoal}`);
  lines.push(`exportedAt: "${payload.exportedAt}"`);
  lines.push('travelbuddy: true');
  lines.push('---');
  lines.push('');

  // ── Title ─────────────────────────────────────────────────────────────────────
  lines.push(`# ${trip.name}`);
  lines.push('');

  // ── At a Glance ───────────────────────────────────────────────────────────────
  lines.push('## At a Glance');
  const dests = trip.destinations.length > 1 ? trip.destinations.join(', ') : trip.destination;
  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate + 'T12:00:00');
    const end = new Date(trip.endDate + 'T12:00:00');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    lines.push(`- ${days} day${days !== 1 ? 's' : ''} · ${dests}`);
  } else {
    lines.push(`- ${dests}`);
  }

  // Total expenses
  const expenses = timeline.filter((e): e is ExpenseEvent => e.type === 'expense');
  if (expenses.length > 0) {
    const total = expenses.reduce((sum, e) => sum + e.cost.amountPreferredCurrency, 0);
    const budgetStr = trip.budgetGoal
      ? ` of ${fmtCurrency(trip.budgetGoal, trip.preferredCurrency)}`
      : '';
    lines.push(`- Total expenses: ${fmtCurrency(total, trip.preferredCurrency)}${budgetStr}`);
  } else if (trip.budgetGoal) {
    lines.push(`- Budget goal: ${fmtCurrency(trip.budgetGoal, trip.preferredCurrency)}`);
  }

  // Flight summary
  const flights = timeline.filter(
    (e): e is FlightDepartureEvent => e.type === 'flight' && e.subtype === 'departure',
  );
  if (flights.length > 0) {
    const summary = flights.map((f) => `${f.flightNo} ${f.departureAirport}→${f.arrivalAirport}`).join(', ');
    lines.push(`- Flights: ${summary}`);
  }

  if (trip.notes) {
    lines.push(`- Notes: ${trip.notes.split('\n')[0]}${trip.notes.includes('\n') ? '…' : ''}`);
  }
  lines.push('');

  // ── Itinerary ─────────────────────────────────────────────────────────────────
  lines.push('## Itinerary');
  lines.push('');

  const scheduledActivities = activities.filter((a) => a.scheduledDate);
  const days = buildDays(trip.startDate, trip.endDate, timeline, scheduledActivities);

  let dayNumber = 1;
  for (const day of days) {
    const dayEvents = timeline.filter((e) => dayKey(e.date) === day);
    const dayActivities = scheduledActivities.filter((a) => a.scheduledDate === day);

    if (dayEvents.length === 0 && dayActivities.length === 0) {
      dayNumber++;
      continue;
    }

    // Find city for this day (from first non-expense, non-activity event)
    const cityEvent = dayEvents.find((e) => e.type !== 'expense');
    const city = cityEvent?.locationCity ?? '';
    const dateLabel = fmtDate(day);
    const cityPart = city ? ` — ${city}` : '';
    lines.push(`### Day ${dayNumber} — ${dateLabel}${cityPart}`);
    lines.push('');

    // Separate events by type for ordered rendering
    const flightEvents = dayEvents.filter((e) => e.type === 'flight');
    const hotelEvents = dayEvents.filter((e) => e.type === 'hotel' && (e as { subtype: string }).subtype === 'check_in');
    const transportEvents = dayEvents.filter(
      (e) => e.type === 'otherTransportation' && (e as { subtype: string }).subtype === 'departure',
    );
    const activityEvents = dayEvents.filter((e) => e.type === 'activity');
    const expenseEvents = dayEvents.filter((e) => e.type === 'expense');

    // Flights
    for (const e of flightEvents) {
      if (e.type === 'flight') {
        lines.push(renderFlight(e as FlightDepartureEvent | FlightArrivalEvent | FlightConnectionEvent));
        lines.push('');
      }
    }

    // Hotels
    for (const e of hotelEvents) {
      lines.push(renderHotelCheckIn(e as HotelCheckInEvent));
      lines.push('');
    }

    // Ground transport
    for (const e of transportEvents) {
      lines.push(renderTransport(e as TransportDepartureEvent));
      lines.push('');
    }

    // Activities (timeline events)
    if (activityEvents.length > 0) {
      lines.push('**Activities**');
      for (const e of activityEvents) {
        lines.push(renderActivity(e as ActivityEvent));
      }
      lines.push('');
    }

    // Scheduled saved activities
    if (dayActivities.length > 0) {
      if (activityEvents.length === 0) lines.push('**Activities**');
      for (const a of dayActivities) {
        const timeStr = a.scheduledTime ? ` at ${fmtTime(a.scheduledTime)}` : '';
        const duration = a.duration ? ` (${a.duration})` : '';
        lines.push(`- ${a.name}${timeStr}${duration}`);
        if (a.address) lines.push(`  - ${a.address}`);
      }
      lines.push('');
    }

    // Expenses
    if (expenseEvents.length > 0) {
      lines.push('**Expenses**');
      for (const e of expenseEvents) {
        lines.push(renderExpense(e as ExpenseEvent));
      }
      lines.push('');
    }

    dayNumber++;
  }

  // ── Budget Summary ────────────────────────────────────────────────────────────
  if (expenses.length > 0 || trip.budgetGoal) {
    lines.push('## Budget Summary');
    lines.push('');

    const CATEGORIES: BudgetItemCategory[] = [
      'flights', 'hotels', 'car_rental', 'activities', 'transport', 'food', 'insurance', 'other',
    ];

    const categoryLabels: Record<BudgetItemCategory, string> = {
      flights: 'Flights',
      hotels: 'Hotels',
      car_rental: 'Car Rental',
      activities: 'Activities',
      transport: 'Transport',
      food: 'Food & Drink',
      insurance: 'Insurance',
      other: 'Other',
    };

    // Map expense categories (ExpenseCategory) to BudgetItemCategory for display
    const expenseCategoryMap: Record<string, BudgetItemCategory> = {
      flights: 'flights',
      hotels: 'hotels',
      food: 'food',
      transport: 'transport',
      activities: 'activities',
      shopping: 'other',
      insurance: 'insurance',
      other: 'other',
    };

    const actualByCategory = new Map<BudgetItemCategory, number>();
    for (const e of expenses) {
      const budgetCat = expenseCategoryMap[e.category] ?? 'other';
      actualByCategory.set(budgetCat, (actualByCategory.get(budgetCat) ?? 0) + e.cost.amountPreferredCurrency);
    }

    const rows: string[] = [];
    for (const cat of CATEGORIES) {
      const actual = actualByCategory.get(cat);
      const goal = trip.categoryGoals?.[cat];
      if (!actual && !goal) continue;
      const actualStr = actual ? fmtCurrency(actual, trip.preferredCurrency) : '—';
      const goalStr = goal ? fmtCurrency(goal, trip.preferredCurrency) : '—';
      rows.push(`| ${categoryLabels[cat]} | ${goalStr} | ${actualStr} |`);
    }

    if (rows.length > 0) {
      lines.push('| Category | Budget | Actual |');
      lines.push('|---|---|---|');
      lines.push(...rows);
      lines.push('');
    }

    const totalActual = expenses.reduce((s, e) => s + e.cost.amountPreferredCurrency, 0);
    if (trip.budgetGoal) {
      lines.push(`**Total: ${fmtCurrency(totalActual, trip.preferredCurrency)} / ${fmtCurrency(trip.budgetGoal, trip.preferredCurrency)}**`);
    } else {
      lines.push(`**Total: ${fmtCurrency(totalActual, trip.preferredCurrency)}**`);
    }
    lines.push('');
  }

  // ── Saved Activities (unscheduled) ────────────────────────────────────────────
  const unscheduled = activities.filter((a) => a.saved && !a.scheduledDate);
  if (unscheduled.length > 0) {
    lines.push('## Saved Activities');
    lines.push('');
    for (const a of unscheduled) {
      const meta: string[] = [];
      if (a.city) meta.push(a.city);
      if (a.estimatedCost) meta.push(a.estimatedCost);
      if (a.duration) meta.push(a.duration);
      const metaStr = meta.length ? ` (${meta.join(' · ')})` : '';
      lines.push(`- **${a.name}**${metaStr}`);
      if (a.address) lines.push(`  ${a.address}`);
      if (a.description) lines.push(`  ${a.description}`);
    }
    lines.push('');
  }

  // ── Notes ─────────────────────────────────────────────────────────────────────
  if (trip.notes) {
    lines.push('## Notes');
    lines.push('');
    lines.push(trip.notes);
    lines.push('');
  }

  return lines.join('\n');
}
