/**
 * Lightweight regex-based extraction of key travel fields from plain text.
 *
 * Extracts prices, dates, times, flight numbers, carriers, hotel names, and
 * confirmation codes — the exact fields Claude needs — and returns a compact
 * summary prepended to a short tail of the original text.
 *
 * This reduces text-based Claude parse calls from ~40 000 input chars to
 * ~7 000, cutting response time significantly without losing relevant data.
 * PDF and image documents bypass this and go straight to Claude.
 */

// Currency amounts: $1,234.56 · CAD 99.00 · 1 234,00 EUR · USD 1 234
const PRICE_RE = /(?:[\$£€¥]|(?:USD|CAD|EUR|GBP|AUD|NZD|CHF|JPY|MXN|SEK|NOK|DKK)\s*[\$£€¥]?)\s*\d[\d,.\s]*\d|\d[\d,.\s]*\d\s*(?:USD|CAD|EUR|GBP|AUD|NZD|CHF|JPY|MXN|SEK|NOK|DKK)/gi;

// ISO and common English dates
const DATE_RE = /\b\d{4}[-\/]\d{2}[-\/]\d{2}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/gi;

// Times: 14:35, 9:10 AM, 23:59
const TIME_RE = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*(?:AM|PM|am|pm)?\b/g;

// 2-letter airline/carrier code + 1-4 digits (e.g. AC 123, UA1234)
const FLIGHT_RE = /\b([A-Z]{2})\s*(\d{1,4}[A-Z]?)\b/g;

// Major airline carrier names
const AIRLINE_RE = /\b(?:Air Canada|United(?:\s+Airlines)?|Delta(?:\s+Air Lines)?|American Airlines|Southwest(?:\s+Airlines)?|Alaska Airlines|JetBlue(?:\s+Airways)?|Lufthansa|British Airways|Air France|KLM|Emirates|Qantas|Ryanair|easyJet|Iberia|Swiss(?:\s+International)?|Turkish Airlines|Cathay Pacific|Singapore Airlines|Air New Zealand|WestJet|Frontier Airlines|Spirit Airlines|Norwegian(?:\s+Air)?|Wizz Air|Air Asia|Vueling|Transavia)\b/gi;

// Car rental companies
const RENTAL_RE = /\b(?:Hertz|Avis|Budget(?:\s+Car)?|Enterprise|National(?:\s+Car)?|Alamo|Dollar|Thrifty|Sixt|Europcar|Rent[\s-]?A[\s-]?Car)\b/gi;

// Hotel brands and generic "Hotel" keyword — captures the name before it
const HOTEL_RE = /\b((?:[\w'-]+\s+){0,4}[\w'-]+)\s+(?:Hotel|Hôtel|Boutique Hotel|Resort|Suites?|Inn|Lodge|Hostel|Motel|Marriott|Hilton|Hyatt|Sheraton|Westin|Fairmont|Accor|Radisson|IHG)\b/gi;

// Confirmation / booking reference codes
const CONFIRMATION_RE = /(?:confirmation|booking|reservation|reference|record\s+locator|order|pnr)\s*(?:number|#|no\.?|code|id)?\s*[:\s]\s*([A-Z0-9]{4,12})\b/gi;

// Max chars of original text to append after the extracted summary
const TAIL_CHARS = 5_000;

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((s) => s.trim()).filter(Boolean))];
}

function allMatches(re: RegExp, text: string): string[] {
  const r = new RegExp(re.source, re.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) out.push(m[0]);
  return out;
}

function groupMatches(re: RegExp, text: string, group: number): string[] {
  const r = new RegExp(re.source, re.flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) if (m[group]) out.push(m[group]);
  return out;
}

/**
 * Extract key travel fields from raw text and return a compact summary
 * prepended to a truncated tail of the original text.
 *
 * Claude receives the summary (high signal, low noise) + enough original
 * text for context — typically ~7 000 chars vs the original 40 000+.
 */
export function preprocessTravelText(raw: string): string {
  const lines: string[] = ['EXTRACTED TRAVEL DATA:'];

  const prices = dedupe(allMatches(PRICE_RE, raw));
  if (prices.length) lines.push(`Prices: ${prices.join('  |  ')}`);

  const dates = dedupe(allMatches(DATE_RE, raw));
  if (dates.length) lines.push(`Dates: ${dates.join('  |  ')}`);

  const times = dedupe(allMatches(TIME_RE, raw));
  if (times.length) lines.push(`Times: ${times.join('  |  ')}`);

  const flights = dedupe(allMatches(FLIGHT_RE, raw));
  if (flights.length) lines.push(`Flight numbers: ${flights.join('  |  ')}`);

  const carriers = dedupe([...allMatches(AIRLINE_RE, raw), ...allMatches(RENTAL_RE, raw)]);
  if (carriers.length) lines.push(`Carriers: ${carriers.join('  |  ')}`);

  const hotels = dedupe(groupMatches(HOTEL_RE, raw, 1));
  if (hotels.length) lines.push(`Hotels: ${hotels.join('  |  ')}`);

  const confirmations = dedupe(groupMatches(CONFIRMATION_RE, raw, 1));
  if (confirmations.length) lines.push(`Confirmation codes: ${confirmations.join('  |  ')}`);

  const summary = lines.join('\n');
  const tail = raw.length > TAIL_CHARS ? raw.slice(0, TAIL_CHARS) + '\n[…truncated]' : raw;

  return `${summary}\n\n---\nORIGINAL TEXT:\n${tail}`;
}
