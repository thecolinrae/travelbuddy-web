/**
 * Claude API service (web / server-side).
 *
 * API key is read from ANTHROPIC_API_KEY environment variable.
 * All functions must be called server-side (Next.js API routes / Server Actions).
 *
 * File reading (PDF/image base64) is handled by the caller before invoking these
 * functions — this keeps the service pure and testable.
 */

import type { ParseResult, Activity, ActivityType } from '@/types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL_PARSE = 'claude-haiku-4-5-20251001';
const MODEL_GENERATE = 'claude-sonnet-4-6';

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

const MAX_RETRIES = 3;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  return key;
}

async function callClaude(
  system: string,
  userContent: ContentBlock[] | string,
  model: string = MODEL_GENERATE,
): Promise<string> {
  const apiKey = getApiKey();
  let attempt = 0;

  while (true) {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (res.status === 429 || res.status === 529) {
      if (attempt >= MAX_RETRIES) {
        const err = await res.text();
        throw new Error(`Claude API error ${res.status}: ${err}`);
      }
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
      await new Promise<void>((r) => setTimeout(r, Math.min(retryAfter * 1000, 60_000)));
      attempt++;
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.content?.find((b: { type: string }) => b.type === 'text');
    return text?.text ?? '';
  }
}

// ─── Document Parsing ─────────────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a travel document parser. Extract all booking information from the given travel document and return it as valid JSON.

Return ONLY a JSON object matching this schema:
{
  "artifacts": [
    {
      "type": "flight|hotel|car_rental|activity|receipt|other",
      "vendor": "string (airline, hotel chain, rental company, etc.)",
      "confirmationNumber": "string",
      "startDate": "YYYY-MM-DD (first departure / check-in / pickup date)",
      "endDate": "YYYY-MM-DD (last arrival / check-out / return date)",
      "origin": "string (flights: first-leg departure city + airport code)",
      "destination": "string (flights: PRIMARY destination — see destination rules; hotels: city where the hotel is located — REQUIRED, never blank; always city/municipality level, never a neighbourhood)",
      "locationAddress": "string (sub-city detail only — neighbourhood, district, or street if known, e.g. 'Surry Hills', 'Kensington', '123 Main St'; omit if destination is already at city level)",

      // FLIGHTS ONLY:
      "tripType": "round_trip|one_way (round_trip if the final leg arrives back at the journey's origin city; one_way otherwise)",

      // FLIGHTS ONLY — include one entry per flight segment (even for a single leg):
      "legs": [
        {
          "flightNumber": "string (e.g. AC855)",
          "origin": "string (e.g. Toronto (YYZ))",
          "destination": "string (e.g. Frankfurt (FRA))",
          "departureDate": "YYYY-MM-DD (local date at origin airport)",
          "departureTime": "HH:MM (24h local time at origin airport)",
          "departureUtc": "YYYY-MM-DDTHH:MM:00Z (UTC — convert using known airport timezone; omit if uncertain)",
          "arrivalDate": "YYYY-MM-DD (local date at destination airport)",
          "arrivalTime": "HH:MM (24h local time at destination airport)",
          "arrivalUtc": "YYYY-MM-DDTHH:MM:00Z (UTC — convert using known airport timezone; omit if uncertain)",
          "travelClass": "Economy|Premium Economy|Business|First (omit if not stated)",
          "boardingTime": "HH:MM (local boarding time if shown on ticket/boarding pass; omit if not shown)",
          "gate": "string (departure gate if shown; omit if not shown)",
          "baggageAllowance": "string (e.g. '2×23 kg checked + 10 kg carry-on'; omit if not stated)"
        }
      ],

      "flightNumber": "string (first/only flight number; omit for multi-leg)",
      "seatNumber": "string",
      "passengers": [{ "name": "string", "seatNumber": "string (optional)", "mealChoice": "string (optional)" }],
      "passengerCount": number,
      "loyaltyNumber": "string (frequent flyer or hotel loyalty membership number if shown in document)",
      "loyaltyStatus": "string (loyalty tier/status shown in document, e.g. Gold, Platinum; omit if not stated)",
      "amenities": ["string (hotel amenity, e.g. Free WiFi, Pool, Gym, Spa — list only what is explicitly confirmed in the booking; omit array entirely if none stated)"],
      "startTime": "HH:MM (non-flight artifacts)",
      "endTime": "HH:MM (non-flight artifacts)",
      "hotelName": "string",
      "roomType": "string",
      "checkIn": "YYYY-MM-DD",
      "checkInTime": "HH:MM (hotels: earliest standard check-in time stated in booking, e.g. 15:00)",
      "checkOut": "YYYY-MM-DD",
      "checkOutTime": "HH:MM (hotels: latest standard check-out time stated in booking, e.g. 11:00)",
      "numberOfNights": number,
      "breakfastIncluded": true,
      "amount": number,
      "currency": "USD",
      "notes": "string",
      "activityCategory": "sightseeing|food|adventure|culture|shopping|nightlife|nature|wellness (activity artifacts only)"
    }
  ],
  "suggestedTripName": "string",
  "primaryDestination": "string",
  "destinations": ["string"],
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "totalCost": number,
  "currency": "string"
}

Rules:
- FLIGHT LEGS: For flights, always populate "legs" — one object per segment. A connecting itinerary (YYZ→FRA→LHR) produces two leg objects.
- TRIP TYPE: Set "tripType" to "round_trip" if the final leg's destination airport matches the first leg's origin airport (the traveler returns home). Set "tripType" to "one_way" if the final destination is different from the origin. Omit "tripType" only if the document provides insufficient information to determine this.
- ROUND TRIPS IN ONE DOCUMENT: If a single document covers both the outbound and return flights under one booking reference, create ONE flight artifact with all segments in "legs" (outbound first, then return). Do NOT create two separate artifacts for a single booking.
- SEPARATE BOOKINGS: Only create separate artifacts when the outbound and return have distinct confirmation numbers or were purchased separately.
- FLIGHT COST: "amount" is the TOTAL confirmed price for the entire flight booking. Always set "amount" at the artifact level — never inside a leg. Do not omit it if any price is visible in the document.
- CURRENCY: Use the ISO currency code explicitly stated in the document. If no currency is stated, infer it from the location/country of the transaction (e.g. a hotel in Tokyo → JPY, a restaurant receipt in London → GBP, a flight departing Sydney → AUD, a car rental in Paris → EUR). Never leave currency blank if the amount is non-zero.
- HOTEL TIMES: "checkInTime" is the EARLIEST standard check-in time stated in the booking (e.g. "3:00 PM" → "15:00"). "checkOutTime" is the LATEST standard check-out time (e.g. "11:00 AM" → "11:00"). If the booking states a specific scheduled check-in time (e.g. early check-in arranged), use that. Omit if no time is stated anywhere in the document.
- Set "startDate"/"endDate" at the artifact level to the overall first departure / last arrival dates.
- Set "origin" at the artifact level to the first leg's origin city+airport (where the outbound journey begins).
- DESTINATION RULES (critical): "destination" at the artifact level is the PRIMARY destination of the trip — the place where the traveler actually stays, not a mere layover or connection. For round trips (e.g. YYZ→LHR→YYZ), "destination" is "London (LHR)", NOT "Toronto (YYZ)" even though Toronto is the final arrival. A destination is where the traveler spends at least one night and the purpose of the journey. Connection airports where the traveler only transits are NOT destinations.
- HOTEL DESTINATION (required): For hotel artifacts, "destination" is the city where the hotel is located. This field MUST always be populated — never leave it blank. Infer the city from the hotel name (e.g. "Marriott Paris" → "Paris", "Hilton London Kensington" → "London"), the booking address, or any location reference in the document. Use a plain city name (e.g. "Paris", "Tokyo") — no airport codes, no full addresses.
- ACTIVITY CATEGORY: For artifacts with type "activity", set "activityCategory" to the best-matching label: "food" (restaurants, cafes, dining), "sightseeing" (landmarks, museums, tours), "culture" (theatre, concerts, galleries), "nightlife" (bars, clubs, evening entertainment), "shopping" (markets, shops, malls), "nature" (parks, hikes, beaches, outdoors), "adventure" (extreme sports, zip-lining, water sports), "wellness" (spa, yoga, fitness). Use "sightseeing" as the default if uncertain.
- CITY NORMALISATION (critical): "destination" must always be at the city or municipality level — never a neighbourhood, district, suburb, or street. If the document mentions a sub-city area, put the parent city in "destination" and store the sub-city detail in "locationAddress". Examples: hotel in "Surry Hills" → destination="Sydney", locationAddress="Surry Hills"; activity in "The Annex, Toronto" → destination="Toronto", locationAddress="The Annex"; restaurant on "Rue du Faubourg Saint-Honoré, Paris" → destination="Paris", locationAddress="Rue du Faubourg Saint-Honoré". Apply the same rule to activity and transport artifacts.
- CAR RENTAL / TRANSPORT DESTINATION (required): For car_rental and other transport artifacts, "destination" is the drop-off or arrival city. This field MUST always be populated — never leave it blank. If no explicit drop-off location is stated (e.g. a round-trip rental returning to the same location), use the pickup city. Use a plain city name — no airport codes, no full addresses.
- TRIP-LEVEL: "primaryDestination" in the top-level response is the main destination city for the whole document (same logic — for round trips it is where the traveler goes, not where they live). Use plain city names only — no airport codes (e.g. "London", not "London (LHR)"). "destinations" is an ARRAY of ALL distinct cities/places the traveler will actually visit and stay (not origins, not layovers) — for a YYZ→LHR→CDG→YYZ round trip this would be ["London", "Paris"]. City names only, no airport codes. "suggestedTripName" should be a brief, evocative name like "London & Paris" or "Tokyo Adventure" — not "Trip from Toronto to Toronto".
- ARRIVAL TIME CALCULATION — follow these four steps exactly for every leg:
  Step 1 — departure → UTC: departureUtc = departureDate + departureTime − (origin UTC offset).
    For UTC+ airports, subtract the offset (e.g. SYD UTC+11: 09:00 − 11h = previous day 22:00 UTC).
    For UTC− airports, add the absolute offset (e.g. YYZ UTC−4: 23:30 + 4h = next day 03:30 UTC).
  Step 2 — add flight duration: arrivalUtc = departureUtc + flight duration. Carry the date forward if addition crosses midnight UTC.
  Step 3 — UTC → arrival local: arrivalLocal = arrivalUtc + (destination UTC offset). Carry the date forward/back if this crosses midnight.
  Step 4 — VALIDATE: arrivalUtc MUST be strictly greater than departureUtc. It is physically impossible to arrive before you depart when both times are in UTC. If arrivalUtc ≤ departureUtc you have made an arithmetic error — recheck your offsets and redo steps 1–3.
  NEVER add flight duration to local departure time. NEVER apply date-line crossing intuitions ("going east loses a day"). Always compute through UTC.
  EXAMPLE A — high-UTC+ origin to UTC− destination (Sydney → Vancouver, February):
    Depart SYD 2025-02-20 09:00 AEDT (UTC+11)
    Step 1: 09:00 − 11h = 2025-02-19T22:00Z  ← UTC date is Feb 19, one day before local Sydney date
    Step 2: + 14h = 2025-02-20T12:00Z
    Step 3: YVR PST (UTC−8): 12:00 − 8h = 04:00 same UTC date → arrivalDate=2025-02-20, arrivalTime=04:00
    Step 4: 2025-02-20T12:00Z > 2025-02-19T22:00Z ✓
  EXAMPLE B — UTC− origin to UTC+ destination, crosses midnight UTC (Toronto → London, June):
    Depart YYZ 2024-06-10 23:30 EDT (UTC−4)
    Step 1: 23:30 + 4h = 2024-06-11T03:30Z  ← UTC date is Jun 11
    Step 2: + 8h = 2024-06-11T11:30Z
    Step 3: LHR BST (UTC+1): 11:30 + 1h = 12:30 → arrivalDate=2024-06-11, arrivalTime=12:30
    Step 4: 2024-06-11T11:30Z > 2024-06-11T03:30Z ✓
  EXAMPLE C — long westbound, arrival date +2 from local departure date (LA → Tokyo, June):
    Depart LAX 2024-06-10 22:00 PDT (UTC−7)
    Step 1: 22:00 + 7h = 2024-06-11T05:00Z
    Step 2: + 11h = 2024-06-11T16:00Z
    Step 3: NRT JST (UTC+9): 16:00 + 9h = 25:00 → +1 day → arrivalDate=2024-06-12, arrivalTime=01:00
    Step 4: 2024-06-11T16:00Z > 2024-06-11T05:00Z ✓
  EXAMPLE D — eastbound across the date line, local arrival SAME day as departure (Tokyo → Los Angeles, June):
    Depart NRT 2025-06-10 11:00 JST (UTC+9)
    Step 1: 11:00 − 9h = 2025-06-10T02:00Z
    Step 2: + 9h 30min flight = 2025-06-10T11:30Z
    Step 3: LAX PDT (UTC−7): 11:30 − 7h = 04:30 → arrivalDate=2025-06-10, arrivalTime=04:30
    Step 4: 2025-06-10T11:30Z > 2025-06-10T02:00Z ✓
    Note: local arrival date (June 10) is the SAME as local departure date even though ~9.5 h
    elapsed. This is normal for eastbound transpacific flights — do NOT add a day to the arrival.
- EASTBOUND DATE LINE: When flying east across the date line (e.g. Asia/Pacific → Americas), local arrival date is often the same as or only one day after the local departure date. Trust the UTC arithmetic — do not "correct" this by adding a day to the arrival.
- UTC times: populate departureUtc and arrivalUtc for every leg whenever you know or can reliably infer the airport timezone. Common offsets (account for DST by date): YYZ=UTC−5/−4DST, LHR=UTC+0/+1BST, NRT=UTC+9, SYD=UTC+10/+11AEDT(Oct–Apr), LAX=UTC−8/−7PDT, YVR=UTC−8/−7PDT, CDG=UTC+1/+2CEST, DXB=UTC+4, SIN=UTC+8, HKG=UTC+8. Omit only if truly uncertain.
- DATE YEAR INFERENCE: When a document states a date without a year (e.g. "Jun 10", "Mon 10 Mar", "March 10th"), infer the year using the current date provided at the top of the request. Do not use any other default year.
- PASSENGERS (flight artifacts): If the booking lists multiple passengers by name, populate "passengers" as an array with one entry per passenger — each entry having at minimum "name". Include "seatNumber" per passenger if individual seat assignments are shown, and "mealChoice" if meal preferences are listed. For a single-passenger document, omit "passengers" entirely. Set "passengerCount" to the total number of passengers (infer from passengers.length if not explicitly stated; omit if unknown). The top-level "seatNumber" remains the primary/first-passenger seat for backward compatibility.
- Omit any other field that is not present in the document. Return only the JSON, no commentary.`;

/**
 * Parse a file from a base64-encoded buffer (PDF or image).
 * The caller reads the file and provides base64 + mimeType.
 */
export async function parseDocumentBuffer(
  base64: string,
  mimeType: string,
): Promise<Omit<ParseResult, 'generatedItinerary' | 'generatedBudget'>> {
  const today = new Date().toISOString().slice(0, 10);
  const dateCtx = `Today's date is ${today} — use this year for any dates in the document that don't include a year.`;

  let content: ContentBlock[];

  if (mimeType === 'application/pdf') {
    content = [
      { type: 'text', text: `${dateCtx}\n\nPlease parse this travel document and extract all booking information.` },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    ];
  } else if (mimeType.startsWith('image/')) {
    content = [
      { type: 'text', text: `${dateCtx}\n\nPlease parse this travel receipt or confirmation image and extract all booking information.` },
      { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
    ];
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const raw = await callClaude(PARSE_SYSTEM, content, MODEL_PARSE);
  return parseJsonResponse(raw);
}

/**
 * Parse plain text (forwarded email content, pasted confirmation).
 */
export async function parseTextContent(
  text: string,
): Promise<Omit<ParseResult, 'generatedItinerary' | 'generatedBudget'>> {
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today's date is ${today} — use this year for any dates in the document that don't include a year.\n\nPlease parse this travel confirmation text and extract all booking information:\n\n${text}`;
  const raw = await callClaude(PARSE_SYSTEM, prompt, MODEL_PARSE);
  return parseJsonResponse(raw);
}

/**
 * Parse email content from Gmail (subject + body).
 */
export async function parseEmailContent(
  subject: string,
  body: string,
): Promise<Omit<ParseResult, 'generatedItinerary' | 'generatedBudget'>> {
  const prompt = `Please parse this travel confirmation email and extract all booking information.\n\nSubject: ${subject}\n\n${body}`;
  return parseTextContent(prompt);
}

function parseJsonResponse(raw: string): Omit<ParseResult, 'generatedItinerary' | 'generatedBudget'> {
  const jsonMatch = raw.match(/```json\n?([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonText = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw;
  try {
    return JSON.parse(jsonText.trim());
  } catch {
    throw new Error('Failed to parse Claude response as JSON. Response: ' + raw.substring(0, 200));
  }
}

// ─── Activity Suggestions ─────────────────────────────────────────────────────

const ACTIVITIES_SYSTEM = `You are a knowledgeable travel guide. When given a location and travel dates, suggest 12 diverse, interesting things to do there.

The location may be a neighbourhood, district, or full city name. Structure your suggestions in three geographic layers:
1. NEARBY (4–5 suggestions): Activities in or immediately around the given neighbourhood / district — places reachable on foot or within a short walk from a hotel there.
2. CITY (4–5 suggestions): Activities across the broader city that are worth a short trip (metro, bus, or taxi).
3. REGION (2–3 suggestions): Day-trip or half-day highlights in the wider metro area or surrounding region (30–90 min travel).

If the location is already a major city rather than a sub-district, skip layer 1 and distribute between city highlights and notable neighbourhoods to visit.

Return ONLY a JSON array with this schema:
[
  {
    "id": "unique-slug",
    "name": "Activity Name",
    "description": "2-3 sentence description of the activity and why it's worth doing",
    "type": "sightseeing|food|adventure|culture|shopping|nightlife|nature|wellness",
    "estimatedCost": "$10-20 per person",
    "duration": "2-3 hours",
    "bestTime": "Morning|Evening|Anytime",
    "tips": "One practical tip for visitors",
    "address": "Specific neighbourhood or area (not a full street address)",
    "rating": 4.5,
    "saved": false
  }
]

Vary the types. Include at least 2 food options, 2 culture/sightseeing, 1 nature, and mix others.
Return only the JSON array, no commentary.`;

export async function suggestActivities(
  destination: string,
  startDate: string,
  endDate: string,
  customPrompt?: string,
): Promise<Activity[]> {
  let prompt = `Suggest things to do in and around "${destination}" for a trip from ${startDate} to ${endDate}. Remember to include activities close to ${destination} itself, across the broader city, and in the surrounding region.`;
  if (customPrompt?.trim()) {
    prompt += `\n\nAdditional request from the traveler: "${customPrompt.trim()}"`;
  }
  const raw = await callClaude(ACTIVITIES_SYSTEM, prompt);
  const jsonMatch = raw.match(/```json\n?([\s\S]*?)```/) ?? raw.match(/(\[[\s\S]*\])/);
  const jsonText = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw;
  try {
    return JSON.parse(jsonText.trim()) as Activity[];
  } catch {
    throw new Error('Failed to parse activity suggestions.');
  }
}

// ─── Activity Enrichment ──────────────────────────────────────────────────────

export interface EnrichedActivityResult {
  name?: string;
  description?: string;
  type?: ActivityType;
  estimatedCost?: string;
  duration?: string;
  bestTime?: string;
  tips?: string;
  familyFriendly?: boolean;
  highlights?: string[];
  locationAddress?: string;
  city?: string;
}

const ENRICH_ACTIVITY_SYSTEM = `You are a knowledgeable travel concierge. When given an activity name and city, provide detailed information about that activity.

Return ONLY a JSON object with these exact fields:
{
  "name": "Activity name (refined/corrected if needed)",
  "description": "2–3 sentence engaging description of what this activity is and why it's worth doing",
  "type": "one of: sightseeing | food | adventure | culture | shopping | nightlife | nature | wellness",
  "estimatedCost": "e.g. Free, $10–20 per person, $$ (mid-range)",
  "duration": "e.g. 1–2 hours, Half day, Full day",
  "bestTime": "e.g. Morning for smaller crowds, Year-round, Avoid peak season (July–August)",
  "tips": "1–2 practical insider tips for first-time visitors",
  "familyFriendly": true or false,
  "highlights": ["key feature 1", "key feature 2", "key feature 3"],
  "city": "City name only (e.g. 'Sydney', 'Paris', 'New York') — the municipality, not a neighbourhood or country",
  "locationAddress": "Street address if well-known, or neighbourhood/district (e.g. 'Marais district' or '233 S Wacker Dr'). Omit the field entirely if unknown."
}

Return only the JSON object, no commentary.`;

export async function enrichActivity(name: string, city: string): Promise<EnrichedActivityResult> {
  const prompt = `Activity: "${name}"${city ? ` in ${city}` : ''}`;
  const raw = await callClaude(ENRICH_ACTIVITY_SYSTEM, prompt);
  const jsonMatch = raw.match(/```json\n?([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonText = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw;
  try {
    return JSON.parse(jsonText.trim()) as EnrichedActivityResult;
  } catch {
    throw new Error('Failed to parse activity details.');
  }
}

// ─── Packing List ─────────────────────────────────────────────────────────────

const PACKING_SYSTEM = `You are a travel packing expert. Generate a personalized packing list based on the destination, duration, and trip type. Format as Markdown with checkboxes (- [ ] item). Group by category (Documents, Clothing, Toiletries, Electronics, Misc). Keep it practical and not overwhelming.`;

export async function generatePackingList(
  destination: string,
  startDate: string,
  endDate: string,
): Promise<string> {
  const prompt = `Generate a packing list for a trip to ${destination} from ${startDate} to ${endDate}.`;
  return callClaude(PACKING_SYSTEM, prompt);
}

// ─── Trip Chat (streaming + tool use) ────────────────────────────────────────

export interface ChatToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// Anthropic message formats for multi-turn tool use
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export type AnthropicChatMessage =
  | { role: 'user'; content: string | AnthropicContentBlock[] }
  | { role: 'assistant'; content: AnthropicContentBlock[] };

export type ChatStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'message_stop' };

/**
 * Stream a single Claude turn with tool use support.
 * Calls onEvent for each event as it arrives. Retries on 429/529.
 */
export async function streamTripChat(
  systemPrompt: string,
  messages: AnthropicChatMessage[],
  tools: ChatToolDefinition[],
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const apiKey = getApiKey();
  let attempt = 0;

  while (true) {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_GENERATE,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
        tools,
        stream: true,
      }),
    });

    if (res.status === 429 || res.status === 529) {
      if (attempt >= MAX_RETRIES) {
        const err = await res.text();
        throw new Error(`Claude API error ${res.status}: ${err}`);
      }
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
      await new Promise<void>((r) => setTimeout(r, Math.min(retryAfter * 1000, 60_000)));
      attempt++;
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('No response body from Claude API');

    // Per-block state: track type, id, name, and accumulated json for tool_use blocks
    const blockState: Record<
      number,
      { type: 'text' | 'tool_use'; id?: string; name?: string; jsonBuffer: string }
    > = {};

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6);
      if (raw === '[DONE]') return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }

      const eventType = data.type as string;

      if (eventType === 'content_block_start') {
        const index = data.index as number;
        const block = data.content_block as { type: string; id?: string; name?: string };
        blockState[index] = {
          type: block.type === 'tool_use' ? 'tool_use' : 'text',
          id: block.id,
          name: block.name,
          jsonBuffer: '',
        };
      } else if (eventType === 'content_block_delta') {
        const index = data.index as number;
        const delta = data.delta as { type: string; text?: string; partial_json?: string };
        const state = blockState[index];
        if (!state) return;

        if (delta.type === 'text_delta' && delta.text) {
          onEvent({ type: 'text_delta', text: delta.text });
        } else if (delta.type === 'input_json_delta' && delta.partial_json) {
          state.jsonBuffer += delta.partial_json;
        }
      } else if (eventType === 'content_block_stop') {
        const index = data.index as number;
        const state = blockState[index];
        if (state?.type === 'tool_use' && state.id && state.name) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(state.jsonBuffer);
          } catch {
            // malformed tool input — skip
          }
          onEvent({ type: 'tool_call', id: state.id, name: state.name, input });
        }
      } else if (eventType === 'message_stop') {
        onEvent({ type: 'message_stop' });
      } else if (eventType === 'error') {
        const err = data.error as { message?: string };
        throw new Error(`Claude stream error: ${err?.message ?? JSON.stringify(data)}`);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    }
    if (lineBuffer) processLine(lineBuffer);

    return;
  }
}

// ─── Concurrency Limiter ──────────────────────────────────────────────────────

export const CLAUDE_PARSE_CONCURRENCY = 3;

/**
 * Run async `fn` over `items` with at most `concurrency` in-flight at once.
 * Calls `onProgress(completed, total)` after each item finishes.
 * Returns results in original order (PromiseSettledResult[] for error resilience).
 */
export async function parseConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIdx = 0;
  let done = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { status: 'rejected', reason: e };
      }
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
