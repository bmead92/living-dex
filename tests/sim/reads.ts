import type { CardGuess } from '../../src/lib/ocr';
import type { Pull } from './packs';
import type { Rng } from './rng';

export interface ReadNoise {
  typo: number;
  missLine: number;
}

export const TYPICAL_NOISE: ReadNoise = { typo: 0.15, missLine: 0.25 };
export const CLEAN: ReadNoise = { typo: 0, missLine: 0 };

const SWAPS: Record<string, string> = { l: '1', o: '0', i: 'l', e: 'c', n: 'm', S: '5', a: 'o' };

function garble(name: string, rng: Rng): string {
  const idx = [...name].map((ch, i) => (SWAPS[ch] ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return name;
  const i = idx[Math.floor(rng() * idx.length)];
  return name.slice(0, i) + SWAPS[name[i]] + name.slice(i + 1);
}

export function frameRead({ card }: Pull, rng: Rng, noise: ReadNoise = TYPICAL_NOISE): CardGuess {
  const name = rng() < noise.typo ? garble(card.name, rng) : card.name;
  const line = rng() >= noise.missLine;
  const set = card.set.toUpperCase();
  const lineText = line ? `${set} EN ${card.collector_number}/${card.official}` : '';
  return {
    name,
    setCode: line ? set : null,
    total: line ? card.official : null,
    collectorNumber: line ? card.collector_number : null,
    foil: false,
    rawText: [name, card.category, 'Some attack text.', lineText].filter(Boolean).join('\n'),
  };
}

export function frameReads(pull: Pull, rng: Rng, noise: ReadNoise = TYPICAL_NOISE): CardGuess[] {
  const n = 2 + Math.floor(rng() * 3);
  return Array.from({ length: n }, () => frameRead(pull, rng, noise));
}
