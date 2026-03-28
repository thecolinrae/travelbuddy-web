/**
 * Currency exchange rate service.
 *
 * Primary source: Frankfurter API (https://frankfurter.app)
 *   — free, no API key, powered by the European Central Bank.
 *
 * Fallback: hardcoded approximate rates (early 2025) when the API is
 *   unavailable. Claude is told which scenario applies so it can note
 *   uncertainty appropriately.
 */

const FRANKFURTER_API = 'https://api.frankfurter.app';

// Approximate rates: 1 <currency> = X USD (early 2025 estimates)
const APPROX_TO_USD: Record<string, number> = {
  USD: 1.00,  EUR: 1.08,  GBP: 1.27,  CAD: 0.73,  AUD: 0.64,
  NZD: 0.60,  CHF: 1.12,  JPY: 0.0067, CNY: 0.14, HKD: 0.13,
  SGD: 0.74,  INR: 0.012, MXN: 0.052, BRL: 0.19,  ZAR: 0.054,
  SEK: 0.093, NOK: 0.092, DKK: 0.145, THB: 0.028, KRW: 0.00073,
  AED: 0.27,  TRY: 0.031,
};

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

export const COMMON_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar',           symbol: '$'   },
  { code: 'EUR', name: 'Euro',                symbol: '€'   },
  { code: 'GBP', name: 'British Pound',       symbol: '£'   },
  { code: 'CAD', name: 'Canadian Dollar',     symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$'  },
  { code: 'NZD', name: 'New Zealand Dollar',  symbol: 'NZ$' },
  { code: 'CHF', name: 'Swiss Franc',         symbol: 'CHF' },
  { code: 'JPY', name: 'Japanese Yen',        symbol: '¥'   },
  { code: 'CNY', name: 'Chinese Yuan',        symbol: '¥'   },
  { code: 'HKD', name: 'Hong Kong Dollar',    symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar',    symbol: 'S$'  },
  { code: 'INR', name: 'Indian Rupee',        symbol: '₹'   },
  { code: 'MXN', name: 'Mexican Peso',        symbol: 'MX$' },
  { code: 'BRL', name: 'Brazilian Real',      symbol: 'R$'  },
  { code: 'ZAR', name: 'South African Rand',  symbol: 'R'   },
  { code: 'SEK', name: 'Swedish Krona',       symbol: 'kr'  },
  { code: 'NOK', name: 'Norwegian Krone',     symbol: 'kr'  },
  { code: 'DKK', name: 'Danish Krone',        symbol: 'kr'  },
  { code: 'THB', name: 'Thai Baht',           symbol: '฿'   },
  { code: 'KRW', name: 'South Korean Won',    symbol: '₩'   },
  { code: 'AED', name: 'UAE Dirham',          symbol: 'AED' },
  { code: 'TRY', name: 'Turkish Lira',        symbol: '₺'   },
];

export interface RateResult {
  /** 1 preferred = rates[other] other — i.e. 1/rates[other] preferred buys 1 other */
  rates: Record<string, number>;
  date: string;
  isLive: boolean;
}

/**
 * Fetch today's rates with the preferred currency as the base.
 * Falls back to hardcoded estimates on any network or API error.
 */
export async function fetchRatesFromPreferred(preferred: string): Promise<RateResult> {
  try {
    const res = await fetch(`${FRANKFURTER_API}/latest?from=${preferred}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('non-200');
    const data = (await res.json()) as { rates: Record<string, number>; date: string };
    return { rates: { ...data.rates, [preferred]: 1 }, date: data.date, isLive: true };
  } catch {
    // Build fallback: express everything relative to preferred via USD
    const prefInUsd = APPROX_TO_USD[preferred] ?? 1;
    const rates: Record<string, number> = { [preferred]: 1 };
    for (const [code, usdRate] of Object.entries(APPROX_TO_USD)) {
      if (code !== preferred) {
        // 1 preferred = prefInUsd USD; 1 other = usdRate USD
        // → 1 preferred = prefInUsd / usdRate other
        rates[code] = prefInUsd / usdRate;
      }
    }
    return { rates, date: 'estimated', isLive: false };
  }
}

/**
 * Build a concise exchange-rate context block to inject into Claude budget prompts.
 *
 * Rates param: 1 preferred = rates[other] other
 * → to convert other→preferred: amount / rates[other]  (shown as 1 other = 1/rates[other] preferred)
 */
export function buildRateContext(preferred: string, result: RateResult): string {
  const lines = Object.entries(result.rates)
    .filter(([code]) => code !== preferred && APPROX_TO_USD[code] !== undefined)
    .map(([code, rate]) => `  1 ${code} = ${(1 / rate).toFixed(4)} ${preferred}`)
    .join('\n');

  const source = result.isLive
    ? `live rates from the European Central Bank, date: ${result.date}`
    : `estimated rates (ECB API unavailable) — note uncertainty where applicable`;

  return `\n---\nPREFERRED CURRENCY: ${preferred}\nEXCHANGE RATES (${source}):\n${lines}\n\nConvert every cost to ${preferred}. Where the original currency differs from ${preferred}, show both the original amount and the ${preferred} equivalent. Use the rates above; do not guess rates not listed.`;
}
