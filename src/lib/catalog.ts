import data from '../data/catalog.json';

export interface CatalogSet {
  id: string;
  name: string;
  code: string | null;
  official: number;
  released: string;
  serie: string;
  serieId: string;
  symbol: string | null;
}

export interface CatalogCard {
  id: string;
  setId: string;
  localId: string;
  name: string;
}

const sets = data.sets as CatalogSet[];
const cardsBySet = data.cards as unknown as Record<string, [string, string][]>;
const setById = new Map(sets.map((s) => [s.id, s]));

export const allSets = () => sets;
export const getSet = (id: string) => setById.get(id) ?? null;

export const cardId = (setId: string, localId: string) => `${setId}-${localId}`;

export function setIdOf(id: string): string {
  return id.slice(0, id.lastIndexOf('-'));
}

export function cardsInSet(setId: string): CatalogCard[] {
  return (cardsBySet[setId] ?? []).map(([localId, name]) => ({ id: cardId(setId, localId), setId, localId, name }));
}

const norm = (n: string) => n.replace(/^0+(?=\d)/, '').toUpperCase();

export function findInSet(setId: string, number: string): CatalogCard | null {
  const want = norm(number);
  return cardsInSet(setId).find((c) => norm(c.localId) === want) ?? null;
}

export function setsByCode(code: string): CatalogSet[] {
  const want = code.toUpperCase();
  return sets.filter((s) => s.code?.toUpperCase() === want);
}

export function setsByOfficialCount(total: number): CatalogSet[] {
  return sets.filter((s) => s.official === total);
}

let names: { key: string; name: string }[] | null = null;
let byName: Map<string, CatalogCard[]> | null = null;

function nameIndex() {
  if (!byName) {
    byName = new Map();
    for (const s of sets)
      for (const c of cardsInSet(s.id)) {
        const k = c.name.toLowerCase();
        const list = byName.get(k);
        if (list) list.push(c);
        else byName.set(k, [c]);
      }
    names = [...byName.values()].map((l) => ({ key: letters(l[0].name), name: l[0].name }));
  }
  return { byName, names: names! };
}

export function printingsOf(name: string): CatalogCard[] {
  return nameIndex().byName.get(name.toLowerCase()) ?? [];
}

export const letters = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function closestName(raw: string): string | null {
  const want = letters(raw);
  if (want.length < 3) return null;
  const { names } = nameIndex();
  let best: string | null = null;
  let bestD = Math.max(1, Math.floor(want.length / 4)) + 1;
  for (const n of names) {
    const d = distance(want, n.key, bestD - 1);
    if (d < bestD) {
      bestD = d;
      best = n.name;
      if (d === 0) break;
    }
  }
  return best;
}

const BASIC_ENERGY = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy'].map(
  (t) => `${t} Energy`,
);

export function searchNames(query: string, limit = 30): string[] {
  const q = letters(query);
  if (!q) return [];
  const { names } = nameIndex();
  const exact: string[] = [];
  const starts: string[] = [];
  const wordStarts: string[] = [];
  const contains: string[] = [];
  for (const n of names) {
    if (n.key === q) exact.push(n.name);
    else if (n.key.startsWith(q)) starts.push(n.name);
    else if (n.name.split(/[\s-]+/).some((w) => letters(w).startsWith(q))) wordStarts.push(n.name);
    else if (n.key.includes(q)) contains.push(n.name);
  }
  const byLength = (a: string, b: string) => a.length - b.length;
  const basics = q.length >= 3 && 'energy'.startsWith(q) ? BASIC_ENERGY : [];
  const ordered = [...exact, ...basics, ...starts.sort(byLength), ...wordStarts.sort(byLength), ...contains.sort(byLength)];
  return [...new Set(ordered)].slice(0, limit);
}
