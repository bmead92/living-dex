import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardsInSet, closestName, findInSet, printingsOf, searchNames, setIdOf, setsByCode, setsByOfficialCount } from '../src/lib/catalog';
import { copyrightYear, identify } from '../src/lib/identify';
import { cleanName, energyName, parseCardText } from '../src/lib/ocr';
import { productType } from '../src/lib/sealed';
import { buildSetList } from '../src/lib/setList';

type Line = { text: string; y: number };

function textOf(lines: Line[]) {
  return {
    resultText: lines.map((l) => l.text).join('\n'),
    blocks: [
      {
        lines: lines.map((l) => ({
          lineText: l.text,
          lineFrame: { x: 10, y: l.y, width: 300, height: 12 },
          lineCornerPoints: [],
        })),
      },
    ],
  } as never;
}

function stubCards() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = decodeURIComponent(url.split('/cards/')[1]);
      const setId = setIdOf(id);
      const c = cardsInSet(setId).find((x) => x.id === id);
      if (!c) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ id, localId: c.localId, name: c.name, set: { id: setId, name: setId } }));
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('catalog', () => {
  it('finds sets by printed code and by set size', () => {
    expect(setsByCode('ssp').map((s) => s.id)).toEqual(['sv08']);
    expect(setsByOfficialCount(102).map((s) => s.id)).toContain('base1');
    expect(findInSet('sv03.5', '1')?.id).toBe('sv03.5-001');
    expect(findInSet('base1', '04')?.id).toBe('base1-4');
  });

  it('names: fuzzy match, printings, search', () => {
    expect(closestName('Charizrd')).toBe('Charizard');
    expect(closestName('umbreonWMY')).toBe(null);
    expect(printingsOf('charizard').length).toBeGreaterThan(20);
    expect(searchNames('pikach')[0]).toBe('Pikachu');
    expect(searchNames('energy').slice(0, 3)).toEqual(['Grass Energy', 'Fire Energy', 'Water Energy']);
    expect(searchNames('water energy')[0]).toBe('Water Energy');
  });

  it('pack picker lists booster sets, not promos', () => {
    const names = buildSetList().map((s) => s.name);
    expect(names).toContain('Base Set');
    expect(names.some((n) => /promo/i.test(n))).toBe(false);
  });
});

describe('reading a card', () => {
  it('Base Set Charizard: name from the top, number and set size from the bottom', () => {
    const g = parseCardText(
      textOf([
        { text: 'STAGE 2', y: 0 },
        { text: 'Evolves from Charmeleon', y: 10 },
        { text: 'Charizard 120 HP', y: 20 },
        { text: 'Energy Burn', y: 300 },
        { text: 'Mitsuhiro Arica O 4/102 *', y: 560 },
        { text: '©1995, 96, 98, 99 Nintendo, Creatures, GAMEFREAK', y: 575 },
      ]),
    );
    expect(g).toMatchObject({ name: 'Charizard', collectorNumber: '4', total: 102, setCode: null });
  });

  it('Scarlet & Violet: printed set code', () => {
    const g = parseCardText(
      textOf([
        { text: 'STAG?2', y: 0 },
        { text: 'Annihilape', y: 12 },
        { text: 'Tantrum 130', y: 300 },
        { text: 'Illus. SIE NANAHARA', y: 540 },
        { text: 'H SSP EN 100/191', y: 555 },
        { text: '©2024 Pokémon / Nintendo / Creatures / GAME FREAK', y: 575 },
      ]),
    );
    expect(g).toMatchObject({ name: 'Annihilape', collectorNumber: '100', total: 191, setCode: 'SSP' });
  });

  it('S and B misread as 5 and 8 in old numbers', () => {
    expect(parseCardText(textOf([{ text: 'Onix', y: 0 }, { text: 'S8/102', y: 560 }]))).toMatchObject({ collectorNumber: '58', total: 102 });
  });

  it('subset numbers keep their prefix', () => {
    const g = parseCardText(textOf([{ text: 'Giratina VSTAR', y: 0 }, { text: 'GG69/GG70', y: 560 }]));
    expect(g).toMatchObject({ collectorNumber: 'GG69', total: 70 });
  });

  it('basic Energy with a half-read name', () => {
    expect(energyName('R Energy', 'R Energy')).toBe('Water Energy');
    expect(energyName('Energy', 'ENERGY Water')).toBe('Water Energy');
    expect(energyName('ire Energy', '')).toBe('Fire Energy');
    expect(energyName('Energy', '')).toBeNull();
    expect(energyName('Bill', 'Water')).toBeNull();
  });

  it('"r Energy" on an old card is Water Energy, not R Energy', () => {
    const g = parseCardText(textOf([{ text: 'r Energy', y: 0 }, { text: '102/102', y: 560 }]));
    expect(g.name).toBe('Water Energy');
  });

  it('the Pokédex line is not the name', () => {
    expect(cleanName("Cocoon Pokémon. Length 2' 0 , Weight 22 lbs.")).toBeNull();
  });

  it('skips stage, HP and evolves lines when picking the name', () => {
    expect(cleanName('Evolves from Charmeleon')).toBeNull();
    expect(cleanName('BASIC')).toBeNull();
    expect(cleanName('Bibarel LV.26')).toBe('Bibarel');
  });
});

describe('identifying', () => {
  it('number + set size + name → the exact card', async () => {
    stubCards();
    const r = await identify({ name: 'Charizard', setCode: null, total: 102, collectorNumber: '4', foil: false, rawText: 'Charizard' });
    expect(r).toMatchObject({ method: 'set+number', card: { id: 'base1-4' } });
  });

  it('printed set code wins', async () => {
    stubCards();
    const r = await identify({ name: 'Annihilape', setCode: 'SSP', total: 191, collectorNumber: '100', foil: false, rawText: 'Annihilape' });
    expect(r.card?.id).toBe('sv08-100');
  });

  it('same name and number in two sets → asks to check the set', async () => {
    stubCards();
    const r = await identify({ name: 'Fire Energy', setCode: null, total: 132, collectorNumber: '128', foil: false, rawText: 'Fire Energy' });
    expect(r.method).toBe('name+set');
    expect(['gym1-128', 'gym2-128']).toContain(r.card?.id);
  });

  it('Base Set Energy: the "ENERGY" header is not a name; 102/102 decides', async () => {
    stubCards();
    const g = parseCardText(textOf([{ text: 'ENERGY', y: 0 }, { text: 'GAMEFREAK OI9 Wiars 102/102', y: 560 }]));
    expect(g).toMatchObject({ name: null, collectorNumber: '102', total: 102 });
    expect((await identify(g)).card?.id).toBe('base1-102');
    const misread = await identify({ name: 'R Energy', setCode: null, total: 102, collectorNumber: '102', foil: false, rawText: 'ENERGY 102/102' });
    expect(misread).toMatchObject({ method: 'set+number', card: { id: 'base1-102' } });
  });

  it('misread number: falls back to the name, flagged to pick the printing', async () => {
    stubCards();
    const r = await identify({ name: 'Umbreon VMAX', setCode: null, total: 203, collectorNumber: '15', foil: false, rawText: 'Umbreon VMAX E +15/203' });
    expect(r.card?.name).toBe('Umbreon VMAX');
    expect(r.method).toBe('name');
  });

  it('no number read: the copyright year picks the era', async () => {
    stubCards();
    const raw = 'Potion Trainer Remove up to 2 damage counters ©1995, 96, 98 Nintendo, Creatures, GAMEFREAK ©1999 Wizards';
    const r = await identify({ name: 'Potion', setCode: null, total: null, collectorNumber: null, foil: false, rawText: raw });
    expect(r).toMatchObject({ method: 'name', card: { id: 'base1-94' } });
    const modern = await identify({ name: 'Potion', setCode: null, total: null, collectorNumber: null, foil: false, rawText: 'Potion ©2023 Pokémon' });
    expect(modern.card?.id).not.toBe('base1-94');
  });

  it('number without the set size: era and a partly read size pick the printing', async () => {
    stubCards();
    const r = await identify({ name: 'Gyarados', setCode: null, total: 10, collectorNumber: '6', foil: false, rawText: 'Gyarados ©1999 Wizards' });
    expect(r.card?.id).toBe('base1-6');
  });

  it('a word ending in -en is not a set code', () => {
    const g = parseCardText(textOf([{ text: 'Weedle', y: 0 }, { text: 'It often hides in grass', y: 520 }, { text: '69/102', y: 560 }]));
    expect(g.setCode).toBeNull();
    expect(g).toMatchObject({ collectorNumber: '69', total: 102 });
  });

  it('bottom unreadable: old-card wording picks the original printing over modern reprints', async () => {
    stubCards();
    const read = (name: string, rawText: string) =>
      identify({ name, setCode: null, total: null, collectorNumber: null, foil: false, rawText });
    expect((await read('Mewtwo', 'Basic Pokemon Mewtwo 60 HP Genetic Pokémon. Length: 6 7 Weight 269 lbs. Psychic Barrier')).card?.id).toBe('base1-10');
    expect((await read('Switch', 'Switch TRAINER Switch 1 of your Benched Pokémon with your Active Pokémon.')).card?.id).toBe('base1-95');
    expect((await read('Gengar', 'STAGE 2 Evolves from Haunter Gengar Pokémon Power: Curse')).card?.id).toBe('base3-5');
    expect((await read('Vaporeon', 'Vaporeon Bubble Jet Pokémon. Length: 3 3, Weight: 64 lbs. Quick Attack')).card?.id).toBe('base2-12');
  });

  it('reads copyright years', () => {
    expect(copyrightYear('©1995, 96, 98, 99 Nintendo, Creatures, GAMEFREAK. ©1999 Wizards.')).toBe(1999);
    expect(copyrightYear('©1995, 96, 98 Nintendo')).toBe(1998);
    expect(copyrightYear('@2024 Pokémon / Nintendo')).toBe(2024);
    expect(copyrightYear('Potion')).toBeNull();
  });

  it('nothing readable → no match', async () => {
    stubCards();
    const r = await identify({ name: null, setCode: null, total: null, collectorNumber: null, foil: false, rawText: '' });
    expect(r).toMatchObject({ card: null, method: 'none' });
  });
});

describe('sealed products', () => {
  it('knows the Pokémon product types', () => {
    expect(productType('Base Set Booster Pack')).toBe('booster-pack');
    expect(productType('Surging Sparks Booster Box')).toBe('booster-box');
    expect(productType('Surging Sparks Elite Trainer Box')).toBe('etb');
    expect(productType('Surging Sparks Booster Bundle')).toBe('booster-bundle');
    expect(productType('Surging Sparks Booster Box Case')).toBe('other');
  });
});

describe('rarity tiers', () => {
  it('short names and tiers collectors use', async () => {
    const { rarityInfo, rarityTier } = await import('../src/lib/rarity');
    expect(rarityInfo('Special illustration rare')).toMatchObject({ label: 'SIR', tier: 6 });
    expect(rarityInfo('Illustration rare')).toMatchObject({ label: 'IR', tier: 5 });
    expect(rarityInfo('Double rare')).toMatchObject({ label: 'RR', tier: 4 });
    expect(rarityInfo('Rare Holo')).toMatchObject({ label: 'Holo', tier: 3 });
    expect(rarityInfo('None')).toBeNull();
    expect(rarityTier('Hyper rare')).toBeGreaterThan(rarityTier('Ultra Rare'));
    expect(rarityTier('Ultra Rare')).toBeGreaterThan(rarityTier('Rare'));
  });
});
