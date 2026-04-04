/**
 * Resolves city names and IATA airport codes to IANA timezone strings,
 * then converts local date+time to UTC ISO.
 */

// ── IATA → IANA timezone ──────────────────────────────────────────────────────

const IATA_TIMEZONES: Record<string, string> = {
  // Canada
  YYZ: 'America/Toronto', YOW: 'America/Toronto', YUL: 'America/Toronto',
  YHZ: 'America/Halifax', YWG: 'America/Winnipeg', YEG: 'America/Edmonton',
  YYC: 'America/Edmonton', YVR: 'America/Vancouver', YXE: 'America/Regina',
  // USA
  JFK: 'America/New_York', LGA: 'America/New_York', EWR: 'America/New_York',
  BOS: 'America/New_York', PHL: 'America/New_York', IAD: 'America/New_York',
  DCA: 'America/New_York', BWI: 'America/New_York', MIA: 'America/New_York',
  FLL: 'America/New_York', ATL: 'America/New_York', CLT: 'America/New_York',
  RDU: 'America/New_York', PIT: 'America/New_York', BUF: 'America/New_York',
  ORD: 'America/Chicago', MDW: 'America/Chicago', DFW: 'America/Chicago',
  DAL: 'America/Chicago', MSP: 'America/Chicago', MKE: 'America/Chicago',
  STL: 'America/Chicago', MSY: 'America/Chicago', IAH: 'America/Chicago',
  HOU: 'America/Chicago', OKC: 'America/Chicago', MCI: 'America/Chicago',
  DEN: 'America/Denver', SLC: 'America/Denver', ABQ: 'America/Denver',
  PHX: 'America/Phoenix', TUS: 'America/Phoenix',
  LAX: 'America/Los_Angeles', SFO: 'America/Los_Angeles', SJC: 'America/Los_Angeles',
  OAK: 'America/Los_Angeles', SEA: 'America/Los_Angeles', PDX: 'America/Los_Angeles',
  LAS: 'America/Los_Angeles', SAN: 'America/Los_Angeles', SMF: 'America/Los_Angeles',
  HNL: 'Pacific/Honolulu', OGG: 'Pacific/Honolulu', KOA: 'Pacific/Honolulu',
  ANC: 'America/Anchorage',
  DTW: 'America/Detroit', CLE: 'America/New_York', CVG: 'America/New_York',
  // Mexico & Central America
  MEX: 'America/Mexico_City', GDL: 'America/Mexico_City', MTY: 'America/Mexico_City',
  CUN: 'America/Cancun', SJD: 'America/Mazatlan',
  // Caribbean
  NAS: 'America/Nassau', MBJ: 'America/Jamaica', KIN: 'America/Jamaica',
  PUJ: 'America/Santo_Domingo', SJU: 'America/Puerto_Rico',
  // South America
  GRU: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', BSB: 'America/Sao_Paulo',
  EZE: 'America/Argentina/Buenos_Aires', AEP: 'America/Argentina/Buenos_Aires',
  SCL: 'America/Santiago', BOG: 'America/Bogota', LIM: 'America/Lima',
  UIO: 'America/Guayaquil', CCS: 'America/Caracas',
  // UK & Ireland
  LHR: 'Europe/London', LGW: 'Europe/London', LCY: 'Europe/London',
  STN: 'Europe/London', MAN: 'Europe/London', BHX: 'Europe/London',
  GLA: 'Europe/London', EDI: 'Europe/London', BFS: 'Europe/London',
  DUB: 'Europe/Dublin', SNN: 'Europe/Dublin',
  // Western Europe
  CDG: 'Europe/Paris', ORY: 'Europe/Paris', NCE: 'Europe/Paris', LYS: 'Europe/Paris',
  AMS: 'Europe/Amsterdam',
  FRA: 'Europe/Berlin', MUC: 'Europe/Berlin', DUS: 'Europe/Berlin',
  BER: 'Europe/Berlin', TXL: 'Europe/Berlin', HAM: 'Europe/Berlin',
  STR: 'Europe/Berlin', CGN: 'Europe/Berlin', NUE: 'Europe/Berlin',
  ZRH: 'Europe/Zurich', GVA: 'Europe/Zurich', BSL: 'Europe/Zurich',
  VIE: 'Europe/Vienna', SZG: 'Europe/Vienna',
  FCO: 'Europe/Rome', MXP: 'Europe/Rome', LIN: 'Europe/Rome',
  NAP: 'Europe/Rome', VCE: 'Europe/Rome', BGY: 'Europe/Rome',
  BCN: 'Europe/Madrid', MAD: 'Europe/Madrid', PMI: 'Europe/Madrid',
  AGP: 'Europe/Madrid', VLC: 'Europe/Madrid', SVQ: 'Europe/Madrid',
  LIS: 'Europe/Lisbon', OPO: 'Europe/Lisbon', FAO: 'Europe/Lisbon',
  BRU: 'Europe/Brussels', CRL: 'Europe/Brussels',
  // Nordics
  CPH: 'Europe/Copenhagen', ARN: 'Europe/Stockholm', GOT: 'Europe/Stockholm',
  HEL: 'Europe/Helsinki', OSL: 'Europe/Oslo', BGO: 'Europe/Oslo',
  KEF: 'Atlantic/Reykjavik',
  // Eastern Europe
  WAW: 'Europe/Warsaw', KRK: 'Europe/Warsaw',
  PRG: 'Europe/Prague', BUD: 'Europe/Budapest',
  OTP: 'Europe/Bucharest', SOF: 'Europe/Sofia',
  ZAG: 'Europe/Zagreb', LJU: 'Europe/Ljubljana',
  ATH: 'Europe/Athens', SKG: 'Europe/Athens',
  // Turkey
  IST: 'Europe/Istanbul', SAW: 'Europe/Istanbul', AYT: 'Europe/Istanbul',
  ESB: 'Europe/Istanbul',
  // Russia & CIS
  SVO: 'Europe/Moscow', DME: 'Europe/Moscow', VKO: 'Europe/Moscow',
  LED: 'Europe/Moscow',
  // Middle East
  DXB: 'Asia/Dubai', AUH: 'Asia/Dubai', SHJ: 'Asia/Dubai',
  DOH: 'Asia/Qatar', KWI: 'Asia/Kuwait',
  RUH: 'Asia/Riyadh', JED: 'Asia/Riyadh', DMM: 'Asia/Riyadh',
  TLV: 'Asia/Jerusalem', AMM: 'Asia/Amman', BEY: 'Asia/Beirut',
  CAI: 'Africa/Cairo',
  // South Asia
  DEL: 'Asia/Kolkata', BOM: 'Asia/Kolkata', MAA: 'Asia/Kolkata',
  BLR: 'Asia/Kolkata', CCU: 'Asia/Kolkata', HYD: 'Asia/Kolkata',
  CMB: 'Asia/Colombo', DAC: 'Asia/Dhaka', KTM: 'Asia/Kathmandu',
  KHI: 'Asia/Karachi', LHE: 'Asia/Karachi', ISB: 'Asia/Karachi',
  // Southeast Asia
  BKK: 'Asia/Bangkok', DMK: 'Asia/Bangkok',
  SGN: 'Asia/Ho_Chi_Minh', HAN: 'Asia/Bangkok', DAD: 'Asia/Bangkok',
  SIN: 'Asia/Singapore',
  KUL: 'Asia/Kuala_Lumpur', PEN: 'Asia/Kuala_Lumpur',
  CGK: 'Asia/Jakarta', DPS: 'Asia/Makassar', SUB: 'Asia/Jakarta',
  MNL: 'Asia/Manila', CEB: 'Asia/Manila',
  RGN: 'Asia/Rangoon',
  PNH: 'Asia/Phnom_Penh', VTE: 'Asia/Vientiane',
  // East Asia
  NRT: 'Asia/Tokyo', HND: 'Asia/Tokyo', KIX: 'Asia/Tokyo',
  NGO: 'Asia/Tokyo', CTS: 'Asia/Tokyo', FUK: 'Asia/Tokyo',
  ICN: 'Asia/Seoul', GMP: 'Asia/Seoul', PUS: 'Asia/Seoul',
  PEK: 'Asia/Shanghai', PKX: 'Asia/Shanghai', PVG: 'Asia/Shanghai',
  SHA: 'Asia/Shanghai', CAN: 'Asia/Shanghai', SZX: 'Asia/Shanghai',
  CTU: 'Asia/Shanghai', CKG: 'Asia/Shanghai', XIY: 'Asia/Shanghai',
  HKG: 'Asia/Hong_Kong', MFM: 'Asia/Macau',
  TPE: 'Asia/Taipei', RMQ: 'Asia/Taipei', KHH: 'Asia/Taipei',
  ULN: 'Asia/Ulaanbaatar',
  // Central Asia
  ALA: 'Asia/Almaty', NQZ: 'Asia/Almaty',
  TAS: 'Asia/Tashkent', GYD: 'Asia/Baku',
  EVN: 'Asia/Yerevan', TBS: 'Asia/Tbilisi',
  // Australia & Pacific
  SYD: 'Australia/Sydney', MEL: 'Australia/Melbourne',
  BNE: 'Australia/Brisbane', ADL: 'Australia/Adelaide',
  PER: 'Australia/Perth', DRW: 'Australia/Darwin',
  CBR: 'Australia/Sydney', HBA: 'Australia/Hobart',
  CNS: 'Australia/Brisbane', OOL: 'Australia/Brisbane',
  AKL: 'Pacific/Auckland', CHC: 'Pacific/Auckland', WLG: 'Pacific/Auckland',
  NAN: 'Pacific/Fiji', APW: 'Pacific/Apia', PPT: 'Pacific/Tahiti',
  // Africa
  JNB: 'Africa/Johannesburg', CPT: 'Africa/Johannesburg', DUR: 'Africa/Johannesburg',
  NBO: 'Africa/Nairobi', MBA: 'Africa/Nairobi', ADD: 'Africa/Addis_Ababa',
  CMN: 'Africa/Casablanca', RAK: 'Africa/Casablanca',
  LOS: 'Africa/Lagos', ABV: 'Africa/Lagos', ABJ: 'Africa/Abidjan',
  ACC: 'Africa/Accra', DKR: 'Africa/Dakar',
  TUN: 'Africa/Tunis', ALG: 'Africa/Algiers', TRI: 'Africa/Tripoli',
  DAR: 'Africa/Dar_es_Salaam', LUN: 'Africa/Lusaka',
  HRE: 'Africa/Harare', LAD: 'Africa/Luanda',
  MPM: 'Africa/Maputo', EBB: 'Africa/Kampala', KGL: 'Africa/Kigali',
};

// ── City name → IANA timezone ─────────────────────────────────────────────────

const CITY_TIMEZONES: Record<string, string> = {
  // Canada
  toronto: 'America/Toronto', ottawa: 'America/Toronto',
  montreal: 'America/Toronto', quebec: 'America/Toronto',
  halifax: 'America/Halifax', winnipeg: 'America/Winnipeg',
  calgary: 'America/Edmonton', edmonton: 'America/Edmonton',
  vancouver: 'America/Vancouver', victoria: 'America/Vancouver',
  // USA
  'new york': 'America/New_York', nyc: 'America/New_York',
  boston: 'America/New_York', philadelphia: 'America/New_York',
  washington: 'America/New_York', 'washington dc': 'America/New_York',
  miami: 'America/New_York', orlando: 'America/New_York',
  'fort lauderdale': 'America/New_York', tampa: 'America/New_York',
  atlanta: 'America/New_York', charlotte: 'America/New_York',
  raleigh: 'America/New_York', pittsburgh: 'America/New_York',
  buffalo: 'America/New_York', richmond: 'America/New_York',
  detroit: 'America/Detroit', cleveland: 'America/New_York',
  columbus: 'America/New_York', cincinnati: 'America/New_York',
  chicago: 'America/Chicago', dallas: 'America/Chicago',
  'fort worth': 'America/Chicago', houston: 'America/Chicago',
  minneapolis: 'America/Chicago', milwaukee: 'America/Chicago',
  'st louis': 'America/Chicago', 'new orleans': 'America/Chicago',
  'kansas city': 'America/Chicago', nashville: 'America/Chicago',
  memphis: 'America/Chicago', indianapolis: 'America/Indiana/Indianapolis',
  denver: 'America/Denver', 'salt lake city': 'America/Denver',
  albuquerque: 'America/Denver', boise: 'America/Denver',
  phoenix: 'America/Phoenix', tucson: 'America/Phoenix',
  'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', sf: 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles', oakland: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles', portland: 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles', sacramento: 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  honolulu: 'Pacific/Honolulu', hawaii: 'Pacific/Honolulu', maui: 'Pacific/Honolulu',
  anchorage: 'America/Anchorage',
  // Mexico
  'mexico city': 'America/Mexico_City', guadalajara: 'America/Mexico_City',
  monterrey: 'America/Mexico_City', cancun: 'America/Cancun',
  // Central America
  'san jose cr': 'America/Costa_Rica', 'panama city': 'America/Panama',
  // Caribbean
  nassau: 'America/Nassau', kingston: 'America/Jamaica',
  'punta cana': 'America/Santo_Domingo', 'santo domingo': 'America/Santo_Domingo',
  'san juan': 'America/Puerto_Rico', havana: 'America/Havana',
  // South America
  'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo',
  'rio de janeiro': 'America/Sao_Paulo', rio: 'America/Sao_Paulo',
  brasilia: 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  santiago: 'America/Santiago', bogota: 'America/Bogota',
  lima: 'America/Lima', quito: 'America/Guayaquil',
  caracas: 'America/Caracas',
  // UK & Ireland
  london: 'Europe/London', edinburgh: 'Europe/London',
  manchester: 'Europe/London', birmingham: 'Europe/London',
  glasgow: 'Europe/London', bristol: 'Europe/London',
  belfast: 'Europe/London', dublin: 'Europe/Dublin',
  // Western Europe
  paris: 'Europe/Paris', nice: 'Europe/Paris', lyon: 'Europe/Paris',
  marseille: 'Europe/Paris', strasbourg: 'Europe/Paris',
  amsterdam: 'Europe/Amsterdam',
  frankfurt: 'Europe/Berlin', berlin: 'Europe/Berlin',
  munich: 'Europe/Berlin', hamburg: 'Europe/Berlin',
  cologne: 'Europe/Berlin', düsseldorf: 'Europe/Berlin',
  dusseldorf: 'Europe/Berlin', stuttgart: 'Europe/Berlin',
  nuremberg: 'Europe/Berlin',
  zurich: 'Europe/Zurich', zürich: 'Europe/Zurich',
  geneva: 'Europe/Zurich', bern: 'Europe/Zurich', basel: 'Europe/Zurich',
  vienna: 'Europe/Vienna', salzburg: 'Europe/Vienna', innsbruck: 'Europe/Vienna',
  rome: 'Europe/Rome', milan: 'Europe/Rome', venice: 'Europe/Rome',
  florence: 'Europe/Rome', naples: 'Europe/Rome',
  barcelona: 'Europe/Madrid', madrid: 'Europe/Madrid',
  seville: 'Europe/Madrid', valencia: 'Europe/Madrid', malaga: 'Europe/Madrid',
  'palma de mallorca': 'Europe/Madrid', ibiza: 'Europe/Madrid',
  lisbon: 'Europe/Lisbon', porto: 'Europe/Lisbon',
  brussels: 'Europe/Brussels',
  // Nordics
  copenhagen: 'Europe/Copenhagen', aarhus: 'Europe/Copenhagen',
  stockholm: 'Europe/Stockholm', gothenburg: 'Europe/Stockholm',
  helsinki: 'Europe/Helsinki', oslo: 'Europe/Oslo', bergen: 'Europe/Oslo',
  reykjavik: 'Atlantic/Reykjavik',
  // Eastern Europe
  warsaw: 'Europe/Warsaw', krakow: 'Europe/Warsaw',
  prague: 'Europe/Prague', budapest: 'Europe/Budapest',
  bucharest: 'Europe/Bucharest', sofia: 'Europe/Sofia',
  zagreb: 'Europe/Zagreb', ljubljana: 'Europe/Ljubljana',
  athens: 'Europe/Athens', thessaloniki: 'Europe/Athens',
  // Turkey
  istanbul: 'Europe/Istanbul', ankara: 'Europe/Istanbul', antalya: 'Europe/Istanbul',
  // Russia
  moscow: 'Europe/Moscow', 'st petersburg': 'Europe/Moscow',
  'saint petersburg': 'Europe/Moscow',
  // Middle East
  dubai: 'Asia/Dubai', 'abu dhabi': 'Asia/Dubai', sharjah: 'Asia/Dubai',
  doha: 'Asia/Qatar', kuwait: 'Asia/Kuwait', 'kuwait city': 'Asia/Kuwait',
  riyadh: 'Asia/Riyadh', jeddah: 'Asia/Riyadh', mecca: 'Asia/Riyadh',
  'tel aviv': 'Asia/Jerusalem', jerusalem: 'Asia/Jerusalem', haifa: 'Asia/Jerusalem',
  amman: 'Asia/Amman', beirut: 'Asia/Beirut', cairo: 'Africa/Cairo',
  // South Asia
  'new delhi': 'Asia/Kolkata', delhi: 'Asia/Kolkata',
  mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', bengaluru: 'Asia/Kolkata',
  chennai: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', hyderabad: 'Asia/Kolkata',
  pune: 'Asia/Kolkata', ahmedabad: 'Asia/Kolkata',
  colombo: 'Asia/Colombo', dhaka: 'Asia/Dhaka', kathmandu: 'Asia/Kathmandu',
  karachi: 'Asia/Karachi', lahore: 'Asia/Karachi', islamabad: 'Asia/Karachi',
  // Southeast Asia
  bangkok: 'Asia/Bangkok', 'chiang mai': 'Asia/Bangkok', pattaya: 'Asia/Bangkok',
  phuket: 'Asia/Bangkok', 'koh samui': 'Asia/Bangkok',
  'ho chi minh': 'Asia/Ho_Chi_Minh', 'ho chi minh city': 'Asia/Ho_Chi_Minh',
  hanoi: 'Asia/Bangkok', 'da nang': 'Asia/Bangkok', hoi: 'Asia/Bangkok',
  singapore: 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur', penang: 'Asia/Kuala_Lumpur',
  jakarta: 'Asia/Jakarta', bali: 'Asia/Makassar', ubud: 'Asia/Makassar',
  denpasar: 'Asia/Makassar', surabaya: 'Asia/Jakarta', medan: 'Asia/Jakarta',
  manila: 'Asia/Manila', cebu: 'Asia/Manila',
  yangon: 'Asia/Rangoon', 'phnom penh': 'Asia/Phnom_Penh', vientiane: 'Asia/Vientiane',
  // East Asia
  tokyo: 'Asia/Tokyo', osaka: 'Asia/Tokyo', kyoto: 'Asia/Tokyo',
  hiroshima: 'Asia/Tokyo', sapporo: 'Asia/Tokyo', fukuoka: 'Asia/Tokyo',
  nara: 'Asia/Tokyo', nagoya: 'Asia/Tokyo',
  seoul: 'Asia/Seoul', busan: 'Asia/Seoul',
  beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai',
  guangzhou: 'Asia/Shanghai', shenzhen: 'Asia/Shanghai', chengdu: 'Asia/Shanghai',
  'xi an': 'Asia/Shanghai', xian: 'Asia/Shanghai', hangzhou: 'Asia/Shanghai',
  nanjing: 'Asia/Shanghai', wuhan: 'Asia/Shanghai', chongqing: 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong', macau: 'Asia/Macau',
  taipei: 'Asia/Taipei',
  // Central Asia
  almaty: 'Asia/Almaty', tashkent: 'Asia/Tashkent',
  baku: 'Asia/Baku', yerevan: 'Asia/Yerevan', tbilisi: 'Asia/Tbilisi',
  // Australia & NZ
  sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane', adelaide: 'Australia/Adelaide',
  perth: 'Australia/Perth', darwin: 'Australia/Darwin', canberra: 'Australia/Sydney',
  'gold coast': 'Australia/Brisbane', cairns: 'Australia/Brisbane',
  auckland: 'Pacific/Auckland', wellington: 'Pacific/Auckland',
  christchurch: 'Pacific/Auckland',
  // Pacific
  fiji: 'Pacific/Fiji', suva: 'Pacific/Fiji',
  papeete: 'Pacific/Tahiti', tahiti: 'Pacific/Tahiti',
  // Africa
  johannesburg: 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  durban: 'Africa/Johannesburg',
  nairobi: 'Africa/Nairobi', mombasa: 'Africa/Nairobi',
  'addis ababa': 'Africa/Addis_Ababa',
  casablanca: 'Africa/Casablanca', marrakech: 'Africa/Casablanca',
  lagos: 'Africa/Lagos', abuja: 'Africa/Lagos',
  accra: 'Africa/Accra', dakar: 'Africa/Dakar',
  tunis: 'Africa/Tunis', algiers: 'Africa/Algiers',
  'dar es salaam': 'Africa/Dar_es_Salaam',
  kampala: 'Africa/Kampala', kigali: 'Africa/Kigali',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractIata(s: string): string | null {
  return s.trim().match(/\(([A-Z]{3,4})\)\s*$/)?.[1] ?? null;
}

/** Resolve a city name or airport string (e.g. "London (LHR)") to an IANA timezone. */
export function resolveTimezone(cityOrAirport: string): string | null {
  if (!cityOrAirport) return null;

  // Try embedded IATA code first (e.g. "London (LHR)")
  const iata = extractIata(cityOrAirport);
  if (iata && IATA_TIMEZONES[iata]) return IATA_TIMEZONES[iata];

  // Try bare IATA code (e.g. "LHR" typed alone)
  const upper = cityOrAirport.trim().toUpperCase();
  if (/^[A-Z]{3,4}$/.test(upper) && IATA_TIMEZONES[upper]) return IATA_TIMEZONES[upper];

  // Normalise: strip airport code suffix, lowercase
  const lower = cityOrAirport.replace(/\([A-Z]{3,4}\)\s*$/, '').trim().toLowerCase();

  if (CITY_TIMEZONES[lower]) return CITY_TIMEZONES[lower];

  // Partial/substring match as fallback
  for (const [key, tz] of Object.entries(CITY_TIMEZONES)) {
    if (lower.startsWith(key) || key.startsWith(lower)) return tz;
  }

  return null;
}

/**
 * Convert a UTC ISO string to a local YYYY-MM-DD date in the given IANA timezone.
 */
export function utcToLocalDate(utcISO: string, ianaTimezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ianaTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(utcISO));
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return utcISO.slice(0, 10);
  }
}

/**
 * Convert a UTC ISO string to a local HH:MM time string in the given IANA timezone.
 */
export function utcToLocalTime(utcISO: string, ianaTimezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ianaTimezone,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(utcISO));
    const h = (parts.find(p => p.type === 'hour')?.value ?? '00').padStart(2, '0');
    const m = (parts.find(p => p.type === 'minute')?.value ?? '00').padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return utcISO.slice(11, 16);
  }
}

/**
 * Convert a local date + time in a known IANA timezone to a UTC ISO string.
 *
 * Uses the "double-shift" technique:
 *   1. Treat the input as UTC to get a reference Date object.
 *   2. Format that Date in the target timezone to find the local representation.
 *   3. The difference between step 1 (as UTC) and step 2 gives the offset.
 *   4. Subtract the offset from step 1 to get the true UTC instant.
 */
export function localToUtcISO(dateStr: string, timeStr: string, ianaTimezone: string): string {
  try {
    const guess = new Date(`${dateStr}T${timeStr}:00Z`);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ianaTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(guess);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
    // Some ICU/Node versions return hour=24 for midnight (24:00) instead of 0.
    // Date.UTC(..., 24, ...) overflows to the next day, making localAsUTC 24h too
    // large and the final result 24h too early.  Clamp to 0 — the date part is
    // already correct so no day adjustment is needed.
    const rawHour = get('hour');
    const hour = rawHour === 24 ? 0 : rawHour;
    const localAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'));
    return new Date(2 * guess.getTime() - localAsUTC).toISOString();
  } catch {
    return `${dateStr}T${timeStr}:00.000Z`;
  }
}
