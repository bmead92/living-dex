import { baseFinish } from './cards';
import { rarityInfo, rarityTier } from './rarity';
import type { Scan } from './db';

export type ColorChip =
  | 'Grass'
  | 'Fire'
  | 'Water'
  | 'Lightning'
  | 'Psychic'
  | 'Fighting'
  | 'Darkness'
  | 'Metal'
  | 'Fairy'
  | 'Dragon'
  | 'Colorless';
export type TypeChip = 'pokemon' | 'trainer' | 'energy';
export type SortKey = 'price-desc' | 'price-asc' | 'name' | 'newest' | 'release' | 'rarity';

export const COLOR_CHIPS: ColorChip[] = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Fairy',
  'Dragon',
  'Colorless',
];
export const ENERGY_COLOR: Record<ColorChip, string> = {
  Grass: '#5fae4a',
  Fire: '#e4572e',
  Water: '#3a8ee6',
  Lightning: '#f2c230',
  Psychic: '#a35dc7',
  Fighting: '#b8743a',
  Darkness: '#3d4a5c',
  Metal: '#9aa3ad',
  Fairy: '#e77fb3',
  Dragon: '#b59a3a',
  Colorless: '#d9d6cf',
};
export const TYPE_CHIPS: { key: TypeChip; label: string; short: string }[] = [
  { key: 'pokemon', label: 'Pokémon', short: 'Pokémon' },
  { key: 'trainer', label: 'Trainers', short: 'Trainers' },
  { key: 'energy', label: 'Energy', short: 'Energy' },
];
export const SORTS: { key: SortKey; label: string; short: string }[] = [
  { key: 'price-desc', label: 'Price: high → low', short: 'price ↓' },
  { key: 'price-asc', label: 'Price: low → high', short: 'price ↑' },
  { key: 'name', label: 'Name A → Z', short: 'name' },
  { key: 'newest', label: 'Recently scanned', short: 'recently scanned' },
  { key: 'release', label: 'Newest printing', short: 'newest printing' },
  { key: 'rarity', label: 'Rarity: rarest first', short: 'rarity' },
];

export interface Filters {
  query: string;
  colors: ColorChip[]; // OR: card matches if it has any selected chip
  types: TypeChip[];
  minPriceCents: number | null;
}

interface ParsedQuery {
  text: string; // leftover words → fuzzy name match
  regex: RegExp | null;
  minCents: number | null;
  maxCents: number | null;
  minExclusive: boolean;
  maxExclusive: boolean;
  types: string[];
  colorAll: string[];
  sets: string[];
  rarities: string[];
  finishes: string[];
  error: string | null;
}

const RARITY = { c: 'common', u: 'uncommon', r: 'rare' } as const;

export function parseQuery(q: string): ParsedQuery {
  const p: ParsedQuery = {
    text: '',
    regex: null,
    minCents: null,
    maxCents: null,
    minExclusive: false,
    maxExclusive: false,
    types: [],
    colorAll: [],
    sets: [],
    rarities: [],
    finishes: [],
    error: null,
  };

  let rest = q.replace(/\/(.+?)\/(?=\s|$)/, (_, body: string) => {
    try {
      p.regex = new RegExp(body, 'i');
    } catch {
      p.error = 'Invalid regular expression';
    }
    return ' ';
  });

  const words: string[] = [];
  for (const m of rest.matchAll(/(\w+):"([^"]*)"|(\S+)/g)) {
    const [whole, qKey, qVal] = m;
    const token = whole;
    const kv = qKey ? [qKey, qVal] : token.match(/^(\w+):(.+)$/)?.slice(1);
    const price = token.match(/^\$?(>=|<=|>|<)\$?(\d+(?:\.\d+)?)$/);
    if (price) {
      const cents = Math.round(parseFloat(price[2]) * 100);
      if (price[1].startsWith('>')) {
        p.minCents = cents;
        p.minExclusive = price[1] === '>';
      } else {
        p.maxCents = cents;
        p.maxExclusive = price[1] === '<';
      }
    } else if (kv) {
      const [key, val] = [kv[0].toLowerCase(), kv[1].toLowerCase()];
      if (key === 't' || key === 'type') p.types.push(val);
      else if (key === 'c' || key === 'color' || key === 'e' || key === 'energy') p.colorAll.push(val);
      else if (key === 's' || key === 'set') p.sets.push(val);
      else if (key === 'r' || key === 'rarity') p.rarities.push(RARITY[val[0] as keyof typeof RARITY] ?? val);
      else if (key === 'f' || key === 'finish') p.finishes.push(val.startsWith('1') ? 'first' : val);
      else words.push(token);
    } else {
      words.push(token);
    }
  }
  p.text = words.join(' ').trim();
  return p;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function fuzzyScore(name: string, query: string): number {
  const n = norm(name);
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let score = 0;
  for (const w of words) {
    if (n.includes(w)) {
      score += 10 + (n.startsWith(w) ? 5 : 0);
      continue;
    }
    let i = 0;
    let gaps = 0;
    for (const ch of n) {
      if (ch === w[i]) i++;
      else if (i > 0 && i < w.length) gaps++;
      if (i === w.length) break;
    }
    if (i < w.length) return 0;
    score += Math.max(1, 6 - gaps / 2);
  }
  return score;
}

function typeMatches(typeLine: string, chip: TypeChip): boolean {
  return norm(typeLine).startsWith(chip);
}

function colorMatches(identity: string, chip: ColorChip): boolean {
  return identity.split(',').includes(chip);
}

export function applyFilters(
  scans: Scan[],
  f: Filters,
  sort: SortKey,
  priceOf: (s: Scan) => number | null = (s) => s.price_cents,
): { items: Scan[]; error: string | null } {
  const q = parseQuery(f.query);
  const scored: { s: Scan; score: number }[] = [];

  for (const s of scans) {
    const price = priceOf(s) ?? 0;
    const type = s.type_line ?? '';
    const identity = s.color_identity ?? '';

    if (f.minPriceCents != null && price < f.minPriceCents) continue;
    if (f.types.length && !f.types.some((t) => typeMatches(type, t))) continue;
    if (f.colors.length && !f.colors.some((c) => colorMatches(identity, c))) continue;

    if (q.minCents != null && (q.minExclusive ? price <= q.minCents : price < q.minCents)) continue;
    if (q.maxCents != null && (q.maxExclusive ? price >= q.maxCents : price > q.maxCents)) continue;
    if (q.regex && !q.regex.test(s.name)) continue;
    if (q.types.some((t) => !type.toLowerCase().includes(t))) continue;
    if (q.colorAll.some((c) => !identity.toLowerCase().includes(c))) continue;
    if (q.sets.length && !q.sets.includes(s.set_code.toLowerCase())) continue;
    if (
      q.rarities.length &&
      !q.rarities.some((r) => (s.rarity ?? '').toLowerCase().includes(r) || rarityInfo(s.rarity)?.label.toLowerCase() === r)
    )
      continue;
    if (q.finishes.length && !q.finishes.includes(s.finish) && !q.finishes.includes(baseFinish(s.finish))) continue;

    const score = q.text ? fuzzyScore(s.name, q.text) : 1;
    if (score === 0) continue;
    scored.push({ s, score });
  }

  const byPrice = (a: Scan, b: Scan) => (priceOf(a) ?? -1) - (priceOf(b) ?? -1);
  const cmp: Record<SortKey, (a: Scan, b: Scan) => number> = {
    'price-desc': (a, b) => byPrice(b, a) || a.name.localeCompare(b.name),
    'price-asc': (a, b) => byPrice(a, b) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    release: (a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? '') || a.name.localeCompare(b.name),
    rarity: (a, b) => rarityTier(b.rarity) - rarityTier(a.rarity) || byPrice(b, a) || a.name.localeCompare(b.name),
  };
  scored.sort((a, b) => cmp[sort](a.s, b.s));
  return { items: scored.map((x) => x.s), error: q.error };
}

export const hasActiveFilters = (f: Filters) =>
  f.query.trim() !== '' || f.colors.length > 0 || f.types.length > 0 || f.minPriceCents != null;
