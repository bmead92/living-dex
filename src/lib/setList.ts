import { allSets, type CatalogSet } from './catalog';
import { productsForSet, type MatchInput, type SealedProduct, type Suggestion } from './sealed';

export interface SetEntry {
  code: string;
  name: string;
  released: string;
  icon: string | null;
  serie: string;
}

const NO_BOOSTERS = /promo|trainer kit|mcdonald|deck|jumbo|energ|futsal|celebration classic|classic collection|kalos starter/i;

export function toEntry(s: CatalogSet): SetEntry {
  return { code: s.id.toUpperCase(), name: s.name, released: s.released, icon: null, serie: s.serie };
}

export function buildSetList(sets: CatalogSet[] = allSets()): SetEntry[] {
  return sets
    .filter((s) => !NO_BOOSTERS.test(s.name) && !NO_BOOSTERS.test(s.serie))
    .map(toEntry)
    .sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name));
}

export const fold = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

export function searchSets(list: SetEntry[], query: string): SetEntry[] {
  const q = fold(query).trim();
  if (!q) return list;
  const qWords = q.split(/\s+/);
  const scored: { s: SetEntry; rank: number }[] = [];
  list.forEach((s, i) => {
    const name = fold(s.name);
    const nameWords = [...name.split(/\s+/), ...fold(s.serie).split(/\s+/)].filter(Boolean);
    let rank: number;
    if (s.code.toLowerCase() === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (qWords.every((w) => nameWords.some((n) => n.startsWith(w)) || s.released.startsWith(w))) rank = 2;
    else return;
    scored.push({ s, rank: rank * 1e6 + i });
  });
  return scored.sort((a, b) => a.rank - b.rank).map((x) => x.s);
}

export function usualProducts(set: Pick<SetEntry, 'code' | 'name' | 'released'>): SealedProduct[] {
  const kinds = ['Booster Pack', 'Booster Box'];
  if (set.released >= '2011-08-01') kinds.push('Elite Trainer Box');
  if (set.released >= '2019-02-01') kinds.push('Booster Bundle');
  return kinds.map((k) => ({
    product_id: '',
    set_code: set.code,
    name: `${set.name} ${k}`,
    low_price: null,
    price_market: null,
    url: null,
  }));
}

export function productsFor(set: SetEntry, _catalog: SealedProduct[], want: MatchInput['want'] = 'any'): Suggestion[] {
  return productsForSet(usualProducts(set), set.code, want);
}

export function withCardSetsFirst(list: SetEntry[], setCodes: string[]): { fromCards: SetEntry[]; rest: SetEntry[] } {
  const want = setCodes.map((c) => c.toUpperCase());
  const fromCards = want.map((c) => list.find((s) => s.code === c)).filter((s): s is SetEntry => !!s);
  const picked = new Set(fromCards.map((s) => s.code));
  return { fromCards, rest: list.filter((s) => !picked.has(s.code)) };
}
