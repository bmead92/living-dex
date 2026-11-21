import { cardsInSet, closestName, getSet, letters, printingsOf, setsByCode, setsByOfficialCount, type CatalogCard } from './catalog';
import { cardById, type Card, type Finish } from './cards';
import type { CardGuess } from './ocr';

export type MatchMethod = 'set+number' | 'name+set' | 'name' | 'none';

export interface Identification {
  card: Card | null;
  method: MatchMethod;
  foil: boolean;
}

export function defaultFinish(card: Pick<Card, 'finishes'>, holo = false, _rawText = ''): Finish {
  if (holo && card.finishes.includes('holo')) return 'holo';
  if (card.finishes.includes('normal')) return 'normal';
  return card.finishes.includes('holo') ? 'holo' : card.finishes[0];
}

export function nameAppearsIn(cardName: string, rawText: string): boolean {
  const haystack = letters(rawText);
  const name = letters(cardName);
  return name.length >= 4 && haystack.includes(name);
}

const sameNumber = (a: string, b: string) =>
  a.replace(/^([A-Z]*)0+(?=\d)/i, '$1').toUpperCase() === b.replace(/^([A-Z]*)0+(?=\d)/i, '$1').toUpperCase();

function nameScore(c: CatalogCard, guess: CardGuess): number {
  if (guess.name && letters(c.name) === letters(guess.name)) return 3;
  if (nameAppearsIn(c.name, guess.rawText)) return 2;
  const base = letters(c.name.split(' ')[0]);
  return base.length >= 4 && letters(guess.rawText).includes(base) ? 1 : 0;
}

export function copyrightYear(rawText: string): number | null {
  const years = [...rawText.matchAll(/(?:©|\(c\)|@)\s*((?:19|20)\d\d)\b/gi)].map((m) => Number(m[1]));
  const shortYears = [...rawText.matchAll(/(?:19|20)\d\d(?:\s*,\s*\d\d)+/g)].flatMap((m) => {
    const [first, ...rest] = m[0].split(/\s*,\s*/);
    const century = first.slice(0, 2);
    return [Number(first), ...rest.map((r) => Number(`${Number(r) < Number(first.slice(2)) ? Number(century) + 1 : century}${r}`))];
  });
  const all = [...years, ...shortYears].filter((y) => y >= 1995 && y <= new Date().getFullYear() + 1);
  return all.length ? Math.max(...all) : null;
}

function fromEra(prints: CatalogCard[], year: number | null): CatalogCard | undefined {
  if (!year) return undefined;
  const inEra = prints
    .map((p) => ({ p, released: getSet(p.setId)?.released ?? '' }))
    .filter(({ released }) => {
      const y = Number(released.slice(0, 4));
      return y >= year && y <= year + 1;
    })
    .sort((a, b) => a.released.localeCompare(b.released));
  return inEra[0]?.p;
}

const POKEMON_POWER = /pok[eé]mon power/i;
const TRAINER_HEADER = /\bTRAINER\b/;
const OLD_LAYOUT = /length\s*:.{0,40}weight/i;

export function styleCutoff(rawText: string): string | null {
  if (POKEMON_POWER.test(rawText) || TRAINER_HEADER.test(rawText)) return '2003-01-01';
  if (OLD_LAYOUT.test(rawText)) return '2011-01-01';
  return null;
}

function fromStyle(prints: CatalogCard[], rawText: string): CatalogCard | undefined {
  const cutoff = styleCutoff(rawText);
  if (!cutoff) return undefined;
  return prints
    .map((p) => ({ p, released: getSet(p.setId)?.released ?? '' }))
    .filter(({ released }) => released && released < cutoff)
    .sort((a, b) => a.released.localeCompare(b.released))[0]?.p;
}

function bestOf(prints: CatalogCard[], year: number | null, total: number | null | undefined): CatalogCard | undefined {
  const score = (p: CatalogCard) => {
    const set = getSet(p.setId);
    const y = Number(set?.released.slice(0, 4));
    const official = String(set?.official ?? '');
    const t = total ? String(total) : '';
    return (year && y >= year && y <= year + 1 ? 2 : 0) + (t && official && (official.startsWith(t) || t.startsWith(official)) ? 1 : 0);
  };
  return [...prints].sort((a, b) => score(b) - score(a))[0];
}

export function candidates(guess: CardGuess): CatalogCard[] {
  if (!guess.collectorNumber) return [];
  const byCode = guess.setCode ? setsByCode(guess.setCode) : [];
  const bySize = guess.total ? setsByOfficialCount(guess.total) : [];
  const sets = byCode.length ? byCode : bySize;
  return sets.flatMap((s) => cardsInSet(s.id).filter((c) => sameNumber(c.localId, guess.collectorNumber!)));
}

export async function identify(guess: CardGuess): Promise<Identification> {
  const foil = guess.foil;
  const found = candidates(guess);
  if (found.length > 0) {
    const scored = found.map((c) => ({ c, score: nameScore(c, guess) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    const tied = scored.filter((x) => x.score === best.score).length;
    const energyRead = !guess.name || /energy$/i.test(guess.name);
    const onlyEnergy = found.filter((c) => /energy$/i.test(c.name));
    if (best.score === 0 && energyRead && onlyEnergy.length === 1) {
      const card = await cardById(onlyEnergy[0].id);
      if (card) return { card, method: 'set+number', foil };
    }
    if (best.score > 0 || (found.length === 1 && !guess.name)) {
      const card = await cardById(best.c.id);
      if (card) return { card, method: tied === 1 ? 'set+number' : 'name+set', foil };
    }
  }

  const name = guess.name ? closestName(guess.name) : null;
  if (name) {
    const prints = printingsOf(name);
    const inNumber = guess.collectorNumber ? prints.filter((p) => sameNumber(p.localId, guess.collectorNumber!)) : [];
    const year = copyrightYear(guess.rawText);
    const pick = bestOf(inNumber, year, guess.total) ?? fromEra(prints, year) ?? fromStyle(prints, guess.rawText) ?? prints[0];
    const card = pick ? await cardById(pick.id) : null;
    if (card) return { card, method: inNumber.length === 1 ? 'name+set' : 'name', foil };
  }

  if (found.length === 1) {
    const card = await cardById(found[0].id);
    if (card) return { card, method: 'name+set', foil };
  }
  return { card: null, method: 'none', foil };
}
