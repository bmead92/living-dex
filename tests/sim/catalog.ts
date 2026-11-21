import type { Card } from '../../src/lib/cards';
import { between, seeded, type Rng } from './rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export interface SimCard extends Card {
  rarity: Rarity;
  boosterFun: boolean;
  basic: boolean;
}

export interface SimSet {
  code: string;
  name: string;
  cards: SimCard[];
  byRarity(r: Rarity, opts?: { boosterFun?: boolean }): SimCard[];
  basics: SimCard[];
  byNumber(n: string): SimCard | undefined;
}

const ADJ = ['Ember', 'Gloom', 'Verdant', 'Tidal', 'Iron', 'Hollow', 'Radiant', 'Feral', 'Ashen', 'Storm', 'Silent', 'Gilded'];
const NOUN = ['Sentinel', 'Drake', 'Oracle', 'Rogue', 'Colossus', 'Wisp', 'Warden', 'Shaman', 'Hydra', 'Knight', 'Specter', 'Golem'];
const SPELL = ['Rebuke', 'Surge', 'Pact', 'Reckoning', 'Bloom', 'Insight', 'Ambush', 'Cascade'];
const BASICS = ['Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy', 'Psychic Energy'];

const PRICE: Record<Rarity, [number, number]> = {
  common: [3, 25],
  uncommon: [8, 60],
  rare: [20, 1500],
  mythic: [100, 6000],
};


function makeCard(
  set: { code: string; name: string },
  n: number,
  name: string,
  rarity: Rarity,
  rng: Rng,
  extra: Partial<SimCard> = {},
): SimCard {
  const [lo, hi] = PRICE[rarity];
  const base = Math.max(lo, Math.round(lo + (hi - lo) * rng() ** 3));
  const fun = extra.boosterFun ? between(rng, 15, 30) / 10 : 1;
  const normal = Math.round(base * fun);
  const reverse = Math.round(normal * (between(rng, 12, 30) / 10));
  const id = `sim-${set.code.toLowerCase()}-${n}`;
  return {
    id,
    name,
    lang: 'en',
    set: set.code.toLowerCase(),
    set_name: set.name,
    set_code: set.code,
    collector_number: String(n),
    official: 260,
    released_at: '2026-10-03',
    finishes: ['normal', 'reverse'],
    image: `https://img.test/${id}`,
    category: extra.basic ? 'Energy' : rarity === 'common' ? 'Trainer' : 'Pokemon',
    types: [],
    stage: null,
    trainer_type: null,
    hp: null,
    illustrator: null,
    tcgplayer_url: `https://tcg.test/${id}`,
    rarity,
    prices: {
      normal: { usd: normal, usdLow: Math.round(normal * 0.9), eur: Math.round(normal * 0.9) },
      reverse: { usd: reverse, usdLow: Math.round(reverse * 0.9), eur: Math.round(reverse * 0.9) },
    },
    boosterFun: false,
    basic: false,
    ...extra,
  };
}

export function makeSet(code = 'SIM', name = 'Simulated Expansion', seed = 1): SimSet {
  const rng = seeded(seed);
  const set = { code, name };
  const cards: SimCard[] = [];
  let n = 0;
  const names = new Set<string>();
  const freshName = (spell: boolean) => {
    for (;;) {
      const a = ADJ[Math.floor(rng() * ADJ.length)];
      const b = spell ? SPELL[Math.floor(rng() * SPELL.length)] : NOUN[Math.floor(rng() * NOUN.length)];
      const nm = rng() < 0.4 ? `${a} ${b}` : `${a} ${b} of ${ADJ[Math.floor(rng() * ADJ.length)]}`;
      if (!names.has(nm)) {
        names.add(nm);
        return nm;
      }
    }
  };
  const counts: [Rarity, number][] = [
    ['common', 100],
    ['uncommon', 80],
    ['rare', 60],
    ['mythic', 20],
  ];
  for (const [r, count] of counts)
    for (let i = 0; i < count; i++) cards.push(makeCard(set, ++n, freshName(r === 'common'), r, rng));
  for (let i = 0; i < 10; i++) cards.push(makeCard(set, ++n, BASICS[i % 5], 'common', rng, { basic: true }));
  const funFrom = cards.filter((c) => !c.basic && c.rarity !== 'common' && rng() < 0.5);
  for (const c of funFrom) cards.push(makeCard(set, ++n, c.name, c.rarity, rng, { boosterFun: true }));

  return {
    code,
    name,
    cards,
    byRarity: (r, opts = {}) => cards.filter((c) => c.rarity === r && !c.basic && c.boosterFun === !!opts.boosterFun),
    basics: cards.filter((c) => c.basic),
    byNumber: (num) => cards.find((c) => c.collector_number === num),
  };
}
