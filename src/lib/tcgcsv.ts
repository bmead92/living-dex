import { USER_AGENT } from './appInfo';
import type { Card, FinishPrice } from './cards';

const GROUP = 'https://tcgcsv.com/tcgplayer/3/1663';
const TTL_MS = 6 * 60 * 60 * 1000;

type Row = Record<string, { usd: number | null; usdLow: number | null }>;
interface Table {
  rows: Map<number, Row>;
  product: Map<number, number>;
}

let cached: { at: number; table: Promise<Table> } | null = null;

const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);

async function getJson(url: string): Promise<{ results: Record<string, unknown>[] }> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TCGCSV ${res.status}`);
  return res.json();
}

export function parseShadowless(products: Record<string, unknown>[], prices: Record<string, unknown>[]): Table {
  const numberOf = new Map<number, number>();
  for (const p of products) {
    const ext = (p.extendedData as { name: string; value: string }[] | undefined) ?? [];
    const n = parseInt(ext.find((e) => e.name === 'Number')?.value ?? '', 10);
    if (Number.isFinite(n)) numberOf.set(p.productId as number, n);
  }
  const rows = new Map<number, Row>();
  const product = new Map<number, number>();
  for (const x of prices) {
    const n = numberOf.get(x.productId as number);
    if (n == null) continue;
    const row = rows.get(n) ?? {};
    row[String(x.subTypeName)] = { usd: cents(x.marketPrice), usdLow: cents(x.lowPrice) };
    rows.set(n, row);
    product.set(n, x.productId as number);
  }
  return { rows, product };
}

function table(now = Date.now()): Promise<Table> {
  if (!cached || now - cached.at > TTL_MS) {
    const t = Promise.all([getJson(`${GROUP}/products`), getJson(`${GROUP}/prices`)]).then(([a, b]) =>
      parseShadowless(a.results, b.results),
    );
    cached = { at: now, table: t };
    t.catch(() => {
      if (cached?.table === t) cached = null;
    });
  }
  return cached.table;
}

function pick(row: Row, keys: string[]): FinishPrice | null {
  for (const k of keys) {
    const e = row[k];
    if (e?.usd != null) return { usd: e.usd, usdLow: e.usdLow, eur: null };
  }
  return null;
}

export function applyShadowless(card: Card, t: Table): Card {
  const n = parseInt(card.collector_number, 10);
  const row = t.rows.get(n);
  if (!row) return card;
  const prices = { ...card.prices };
  const sl = card.finishes.includes('shadowless') ? pick(row, ['Unlimited Holofoil', 'Unlimited', 'Normal']) : null;
  const first = card.finishes.includes('first') ? pick(row, ['1st Edition Holofoil', '1st Edition']) : null;
  const url = `https://www.tcgplayer.com/product/${t.product.get(n)}`;
  if (sl) prices.shadowless = { ...sl, url };
  if (first) prices.first = { ...first, url };
  return { ...card, prices };
}

export async function withShadowlessPrices(card: Card): Promise<Card> {
  if (card.set !== 'base1') return card;
  try {
    return applyShadowless(card, await table());
  } catch {
    return card;
  }
}
