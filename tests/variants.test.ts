import './sim/mocks';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finishLabel, finishShort, fromApi, isFinish } from '../src/lib/cards';

const load = (id: string) => JSON.parse(readFileSync(new URL(`./fixtures/tcgdex-${id}.json`, import.meta.url), 'utf8'));

describe('special versions', () => {
  it('Prismatic Evolutions: Poké Ball and Master Ball reverse holos with their own prices', () => {
    const c = fromApi(load('sv08.5-001'));
    expect(c.finishes).toEqual(['normal', 'reverse', 'reverse+pokeball', 'reverse+masterball']);
    expect(c.prices['reverse+masterball']!.usd).toBeGreaterThan(c.prices['reverse+pokeball']!.usd!);
    expect(c.prices['reverse+pokeball']!.usd).toBeGreaterThan(c.prices.reverse!.usd!);
    expect(finishLabel('reverse+masterball')).toBe('Master Ball reverse');
    expect(finishShort('reverse+pokeball')).toBe('Poké Ball rev');
  });

  it('151: Cosmos reverse and set-logo stamp, priced from Cardmarket', () => {
    const c = fromApi(load('sv03.5-001'));
    expect(c.finishes).toEqual(['normal', 'reverse', 'normal+set-logo', 'reverse+cosmos']);
    expect(c.prices['reverse+cosmos']).toMatchObject({ eur: 879, fromEur: true });
    expect(finishLabel('normal+set-logo')).toBe('Set logo stamp');
    expect(finishLabel('reverse+cosmos')).toBe('Cosmos reverse');
  });

  it('Ascended Heroes: Poké Ball and Energy reverse holos', () => {
    expect(fromApi(load('me02.5-001')).finishes).toEqual(['normal', 'reverse', 'reverse+pokeball', 'reverse+energy']);
  });

  it('Base Set Charizard gets no extra versions (Shadowless is its own finish)', () => {
    expect(fromApi(load('base1-4')).finishes).toEqual(['holo', 'first', 'shadowless']);
  });

  it('finish keys survive backups', () => {
    expect(isFinish('reverse+masterball')).toBe(true);
    expect(isFinish('normal+set-logo+staff')).toBe(true);
    expect(isFinish('holo')).toBe(true);
    expect(isFinish('foil')).toBe(false);
    expect(isFinish('holo+')).toBe(false);
  });
});

describe('Base Set Shadowless prices from TCGCSV', () => {
  const raw = load('base1-4');
  const csv = JSON.parse(readFileSync(new URL('./fixtures/tcgcsv-base-shadowless.json', import.meta.url), 'utf8'));

  it('Shadowless and 1st Edition use their own TCGplayer product', async () => {
    const { applyShadowless, parseShadowless } = await import('../src/lib/tcgcsv');
    const t = parseShadowless(csv.products, csv.prices);
    const hitmonchan = applyShadowless({ ...fromApi(raw), collector_number: '7' }, t);
    expect(hitmonchan.prices.shadowless).toEqual({ usd: 10374, usdLow: 3000, eur: null, url: 'https://www.tcgplayer.com/product/107002' });
    expect(hitmonchan.prices.first?.usd).toBe(22500);
    const charizard = applyShadowless(fromApi(raw), t);
    expect(charizard.prices.shadowless?.usd).toBe(217224);
    expect(charizard.prices.first?.usd).toBeNull();
  });
});
