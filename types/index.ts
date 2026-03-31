// ─── Trip ─────────────────────────────────────────────────────────────────────

export interface Trip {
  id: string;
  userId: string;
  name: string;
  destination: string;          // primary destination
  destinations?: string[];      // all visited destinations (multi-city)
  startDate: string | null;     // YYYY-MM-DD
  endDate: string | null;       // YYYY-MM-DD
  status: 'upcoming' | 'active' | 'completed';
  coverEmoji: string;
  itineraryMd?: string | null;  // AI-generated markdown (display only)
  budgetGoal?: number | null;
  categoryGoals?: Partial<Record<BudgetItemCategory, number>> | null;
  preferredCurrency: string;
  ownerEmail?: string | null;
  isShared?: boolean;           // runtime flag — not persisted
  createdAt: string;
  updatedAt: string;
}

// ─── Artifacts & Parsing ─────────────────────────────────────────────────────

export type ArtifactType = 'flight' | 'hotel' | 'car_rental' | 'activity' | 'receipt' | 'other';

export interface FlightLeg {
  flightNumber?: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  departureUtc?: string;
  arrivalDate: string;
  arrivalTime?: string;
  arrivalUtc?: string;
  travelClass?: string;
  boardingTime?: string;
  gate?: string;
  baggageAllowance?: string;
}

export interface Passenger {
  name: string;
  seatNumber?: string;
  mealChoice?: string;
}

export interface ParsedArtifact {
  type: ArtifactType;
  vendor?: string;
  confirmationNumber?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  origin?: string;
  destination?: string;
  locationAddress?: string;
  activityCategory?: ActivityType;
  tripType?: 'round_trip' | 'one_way';
  flightNumber?: string;
  seatNumber?: string;
  legs?: FlightLeg[];
  passengers?: Passenger[];
  hotelName?: string;
  roomType?: string;
  checkIn?: string;
  checkOut?: string;
  numberOfNights?: number;
  checkInTime?: string;
  checkOutTime?: string;
  breakfastIncluded?: boolean;
  amenities?: string[];
  loyaltyNumber?: string;
  loyaltyStatus?: string;
  amount?: number;
  currency?: string;
  notes?: string;
  rawText?: string;
}

export interface ParseResult {
  artifacts: ParsedArtifact[];
  suggestedTripName: string;
  primaryDestination: string;
  destinations?: string[];
  startDate: string;
  endDate: string;
  totalCost: number;
  currency: string;
  generatedItinerary: string;
  generatedBudget: string;
}

// ─── Timeline — discriminated union ──────────────────────────────────────────

export interface Cost {
  amountPreferredCurrency: number;
  preferredCurrency: string;
  amountLocalCurrency?: number;
  localCurrency?: string;
  conversionRate?: number;
}

export interface BaseTimelineEvent {
  id: string;
  date: string;
  time?: string;
  utcISO?: string;
  timezone?: string;
  locationCity: string;
  locationAddress?: string;
  artifactSources?: string[];
  journeyId?: string;
  legId?: string;
  displayOrder?: number;
}

export interface TransportLeg {
  id: string;
  tripId: string;
  name: string | null;
  nameIsCustom: boolean;
  order: number;
  createdAt: string;
  events?: TimelineEvent[];
}

export interface HotelCheckInEvent extends BaseTimelineEvent {
  type: 'hotel';
  subtype: 'check_in';
  hotelName: string;
  checkoutDate: string;
  checkoutTime?: string;
  breakfastIncluded: boolean;
  amenities: string[];
  bookingRef?: string;
  roomType?: string;
  numberOfNights?: number;
  loyaltyNumber?: string;
  loyaltyStatus?: string;
  notes?: string;
}

export interface HotelCheckOutEvent extends BaseTimelineEvent {
  type: 'hotel';
  subtype: 'check_out';
  hotelName: string;
  bookingRef?: string;
}

export interface FlightDepartureEvent extends BaseTimelineEvent {
  type: 'flight';
  subtype: 'departure';
  flightNo: string;
  departureAirport: string;
  arrivalAirport: string;
  bookingRef?: string;
  loyaltyNo?: string;
  loyaltyStatus?: string;
  boardingTime?: string;
  travelClass?: string;
  seatNumber?: string;
  gate?: string;
  baggageAllowance?: string;
  passengers?: Passenger[];
  passengerCount?: number;
  notes?: string;
}

export interface FlightArrivalEvent extends BaseTimelineEvent {
  type: 'flight';
  subtype: 'arrival';
  flightNo: string;
  departureAirport: string;
  arrivalAirport: string;
  bookingRef?: string;
  connectingFlight?: string;
}

export interface FlightConnectionEvent extends BaseTimelineEvent {
  type: 'flight';
  subtype: 'connection';
  connectionAirport: string;
  inboundFlightNo?: string;
  outboundFlightNo?: string;
  inboundFromAirport: string;
  outboundToAirport: string;
  departureTime?: string;
  departureDate?: string;
  departureUtcISO?: string;
  layoverMinutes?: number;
  requiresSecurity?: boolean;
  requiresCustoms?: boolean;
  bookingRef?: string;
}

export type TransportType = 'bus' | 'train' | 'ferry' | 'car_rental' | 'taxi' | 'rideshare' | 'other';

export interface TransportDepartureEvent extends BaseTimelineEvent {
  type: 'otherTransportation';
  subtype: 'departure';
  transportType: TransportType;
  departureLocation: string;
  arrivalLocation: string;
  vendor?: string;
  bookingRef?: string;
  notes?: string;
}

export interface TransportArrivalEvent extends BaseTimelineEvent {
  type: 'otherTransportation';
  subtype: 'arrival';
  transportType: TransportType;
  departureLocation: string;
  arrivalLocation: string;
  vendor?: string;
  bookingRef?: string;
  notes?: string;
}

export interface ExpenseEvent extends BaseTimelineEvent {
  type: 'expense';
  description: string;
  vendor?: string;
  category: string;
  cost: Cost;
  isManual?: boolean;
  linkedEventId?: string;
  notes?: string;
}

export interface ActivityEvent extends BaseTimelineEvent {
  type: 'activity';
  description: string;
  category: string;
  cost?: Cost;
  notes?: string;
  bookingRef?: string;
  bestTime?: string;
  estimatedCost?: string;
  duration?: string;
  tips?: string;
  familyFriendly?: boolean;
  highlights?: string[];
}

export type TimelineEvent =
  | HotelCheckInEvent
  | HotelCheckOutEvent
  | FlightDepartureEvent
  | FlightArrivalEvent
  | FlightConnectionEvent
  | TransportDepartureEvent
  | TransportArrivalEvent
  | ExpenseEvent
  | ActivityEvent;

// ─── Budget & Expenses ────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'flights'
  | 'hotels'
  | 'food'
  | 'transport'
  | 'activities'
  | 'shopping'
  | 'insurance'
  | 'other';

export type BudgetItemCategory =
  | 'flights'
  | 'hotels'
  | 'car_rental'
  | 'activities'
  | 'transport'
  | 'food'
  | 'insurance'
  | 'other';

export interface BudgetData {
  preferredCurrency: string;
  budgetGoal?: number;
  categoryGoals?: Partial<Record<BudgetItemCategory, number>>;
  generatedAt?: string;
  updatedAt?: string;
}

// ─── Activities ───────────────────────────────────────────────────────────────

export type ActivityType =
  | 'sightseeing'
  | 'food'
  | 'adventure'
  | 'culture'
  | 'shopping'
  | 'nightlife'
  | 'nature'
  | 'wellness';

export interface Activity {
  id: string;
  name: string;
  description: string;
  type: ActivityType;
  estimatedCost?: string;
  duration?: string;
  bestTime?: string;
  tips?: string;
  city?: string;
  address?: string;
  rating?: number;
  saved: boolean;
  scheduledDate?: string;
  scheduledTime?: string;
  latitude?: number;
  longitude?: number;
  familyFriendly?: boolean;
  highlights?: string[];
  importSource?: 'kml' | 'takeout';
}
