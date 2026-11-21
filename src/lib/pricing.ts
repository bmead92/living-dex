import { deleteScan, getSetting, sellScan, setSetting, updatePricesBulk, type PriceUpdate, type Scan } from './db';
import { deletePhoto } from './photos';
import { formatMoney, headlinePrice, parsePrices, quoteFor, serializePrices } from './prices';
import { cardsByIds } from './cards';

export async function removeScan(scan: Pick<Scan, 'id' | 'photo_uri'>) {
  await deleteScan(scan.id);
  if (scan.photo_uri) deletePhoto(scan.photo_uri);
}

export async function sellCard(scan: Pick<Scan, 'id' | 'photo_uri'>, copies: number, soldCents: number) {
  const result = await sellScan(scan.id, copies, soldCents);
  if (result === 'sold-all' && scan.photo_uri) deletePhoto(scan.photo_uri);
  return result;
}
export const PRICE_RULES = 3;
const FRESH_MS = 6 * 60 * 60 * 1000;

export async function refreshPrices(
  scans: Scan[],
  onProgress?: (done: number, total: number) => void,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  if (scans.length === 0) return;
  const all = force || (await getSetting<number>('priceRules')) !== PRICE_RULES;
  const now = Date.now();
  const fresh = (s: Scan) =>
    !all && !!s.price_updated_at && !!s.other_prices && now - Date.parse(s.price_updated_at) < FRESH_MS;
  const ids = [...new Set(scans.filter((s) => !fresh(s)).map((s) => s.card_id))];
  const cards = ids.length ? await cardsByIds(ids, (done) => onProgress?.(done, ids.length)) : [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const updates: PriceUpdate[] = scans.flatMap((s) => {
    const fetched = byId.get(s.card_id);
    const c = fetched ?? (fresh(s) ? { prices: parsePrices(s.other_prices) ?? {}, tcgplayer_url: s.market_url } : null);
    if (!c) return [];
    const q = quoteFor(c, s.finish, s.condition);
    return [
      {
        id: s.id,
        market: { price_cents: headlinePrice(q), market_cents: q.marketCents, low_cents: q.lowCents, market_url: q.url },
        fetched: !!fetched,
        ...(fetched ? { other_prices: serializePrices(fetched.prices) ?? '{}' } : {}),
      },
    ];
  });
  await updatePricesBulk(updates);
  if (all && cards.length) await setSetting('priceRules', PRICE_RULES);
}

export const cardCount = (n: number) => `${n.toLocaleString()} card${n === 1 ? '' : 's'}`;

export const formatCents = (cents: number | null | undefined) => formatMoney(cents, 'USD');
