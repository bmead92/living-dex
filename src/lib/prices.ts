import type { Finish, FinishPrice } from './cards';
import type { Condition } from './condition';

export type FinishPrices = Partial<Record<Finish, FinishPrice>>;
export type PriceSource = 'tcgplayer' | 'cardmarket';
export type HeadlineSource = 'tcgplayer';

export const PRICE_SOURCES: { key: PriceSource; label: string; currency: 'USD' | 'EUR' }[] = [
  { key: 'tcgplayer', label: 'TCGplayer', currency: 'USD' },
  { key: 'cardmarket', label: 'Cardmarket', currency: 'EUR' },
];
export const HEADLINE_SOURCES: HeadlineSource[] = ['tcgplayer'];

export interface Priced {
  finish: Finish;
  price_cents: number | null;
  other_prices: string | null;
}

export function toCents(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function serializePrices(p: FinishPrices | null | undefined): string | null {
  return p ? JSON.stringify(p) : null;
}

export function parsePrices(json: string | null | undefined): FinishPrices | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as FinishPrices) : null;
  } catch {
    return null;
  }
}

export function sourceCents(p: FinishPrices | null, source: PriceSource, finish: Finish): number | null {
  const f = p?.[finish];
  if (!f) return null;
  return source === 'tcgplayer' ? f.usd : f.eur;
}

export function priceFrom(card: Priced, source: PriceSource): number | null {
  if (source === 'tcgplayer') return card.price_cents;
  return sourceCents(parsePrices(card.other_prices), source, card.finish);
}

const cache = new WeakMap<object, Partial<Record<PriceSource, number | null>>>();

export function cachedPrice(card: Priced, source: PriceSource): number | null {
  let entry = cache.get(card);
  if (!entry) cache.set(card, (entry = {}));
  if (!(source in entry)) entry[source] = priceFrom(card, source);
  return entry[source] ?? null;
}

export function formatMoney(cents: number | null | undefined, currency: 'USD' | 'EUR' = 'USD'): string {
  if (cents == null) return '—';
  const amount = groupThousands((cents / 100).toFixed(2));
  return currency === 'EUR' ? `€${amount}` : `$${amount}`;
}

export function groupThousands(amount: string): string {
  const [whole, frac] = amount.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, ',');
  return `${sign}${grouped}${frac == null ? '' : `.${frac}`}`;
}

export interface PriceQuote {
  condition: Condition;
  marketCents: number | null;
  lowCents: number | null;
  eurCents: number | null;
  url: string | null;
}

export function quoteFor(
  card: { prices: FinishPrices; tcgplayer_url: string | null },
  finish: Finish,
  condition: Condition = 'NM',
): PriceQuote {
  const p = card.prices[finish];
  return {
    condition,
    marketCents: p?.usd ?? null,
    lowCents: p?.usdLow ?? null,
    eurCents: p?.eur ?? null,
    url: p?.url ?? card.tcgplayer_url,
  };
}

export const headlinePrice = (q: PriceQuote) =>
  q.condition === 'NM' ? (q.marketCents ?? q.lowCents) : (q.lowCents ?? q.marketCents);
