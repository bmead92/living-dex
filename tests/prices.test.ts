import { describe, expect, it } from 'vitest';
import { finishesOf, pricesOf } from '../src/lib/cards';
import { cachedPrice, formatMoney, parsePrices, priceFrom, serializePrices, sourceCents, toCents } from '../src/lib/prices';

const base1Charizard = {
  pricing: {
    tcgplayer: {
      unit: 'USD',
      '1st-edition-holofoil': { lowPrice: 9000, marketPrice: 12000.5 },
      'unlimited-holofoil': { lowPrice: 524.14, marketPrice: 1001.05 },
    },
    cardmarket: { trend: 441.68, 'trend-holo': 123.63 },
  },
};

const modern = {
  pricing: {
    tcgplayer: {
      normal: { lowPrice: 0.05, marketPrice: 0.12 },
      'reverse-holofoil': { lowPrice: 0.2, marketPrice: 0.35 },
    },
    cardmarket: { trend: 0.1, 'trend-holo': 0.3 },
  },
};

describe('prices', () => {
  it('converts to cents', () => {
    expect(toCents('1.23')).toBe(123);
    expect(toCents(19.99)).toBe(1999);
    for (const bad of [null, '', 'abc', '-1']) expect(toCents(bad)).toBeNull();
  });

  it('finishes come from the variants', () => {
    expect(finishesOf({ holo: true, firstEdition: true })).toEqual(['holo', 'first']);
    expect(finishesOf({ normal: true, reverse: true })).toEqual(['normal', 'reverse']);
    expect(finishesOf(undefined)).toEqual(['normal']);
  });

  it('old holo: unlimited and 1st Edition priced separately; no Cardmarket price for 1st Edition', () => {
    const p = pricesOf(base1Charizard, ['holo', 'first']);
    expect(p.holo).toEqual({ usd: 100105, usdLow: 52414, eur: 44168 });
    expect(p.first).toEqual({ usd: 1200050, usdLow: 900000, eur: null });
  });

  it('Shadowless: Unlimited price as a floor (Cardmarket lumps it with 1st Edition)', () => {
    const machoke = {
      pricing: { tcgplayer: { normal: { lowPrice: 0.15, marketPrice: 1.03 } }, cardmarket: { trend: 1.42 } },
      variants_detailed: [
        { type: 'normal', subtype: 'shadowless', stamp: ['1st-edition'], pricing: { cardmarket: { trend: 27.25 } } },
        { type: 'normal', subtype: 'shadowless', pricing: { tcgplayer: null, cardmarket: { trend: 27.25 } } },
      ],
    };
    const f = finishesOf({ normal: true, firstEdition: true }, machoke.variants_detailed);
    expect(f).toEqual(['normal', 'first', 'shadowless']);
    const p = pricesOf(machoke, f);
    expect(p.normal?.usd).toBe(103);
    expect(p.shadowless).toEqual({ usd: 103, usdLow: 15, eur: null, unlimited: true });
    machoke.variants_detailed[1].pricing.tcgplayer = { normal: { lowPrice: 50, marketPrice: 120 } } as never;
    expect(pricesOf(machoke, f).shadowless).toEqual({ usd: 12000, usdLow: 5000, eur: null });
  });

  it('modern: normal and reverse holo', () => {
    const p = pricesOf(modern, ['normal', 'reverse']);
    expect(p.normal).toEqual({ usd: 12, usdLow: 5, eur: 10 });
    expect(p.reverse).toEqual({ usd: 35, usdLow: 20, eur: 30 });
  });

  it('no TCGplayer price: Cardmarket converted to dollars', () => {
    expect(pricesOf({ pricing: { cardmarket: { trend: 24.41 } } }, ['normal']).normal).toEqual({
      usd: 2685,
      usdLow: null,
      eur: 2441,
      fromEur: true,
    });
  });

  it('missing prices are null, not zero', () => {
    expect(pricesOf({}, ['normal']).normal).toEqual({ usd: null, usdLow: null, eur: null });
  });

  it('reads a saved card price from the chosen source', () => {
    const ser = serializePrices(pricesOf(modern, ['normal', 'reverse']))!;
    const card = { finish: 'reverse' as const, price_cents: 35, other_prices: ser };
    expect(priceFrom(card, 'tcgplayer')).toBe(35);
    expect(priceFrom(card, 'cardmarket')).toBe(30);
    expect(cachedPrice(card, 'cardmarket')).toBe(30);
    expect(sourceCents(parsePrices(ser), 'cardmarket', 'holo')).toBeNull();
    expect(parsePrices('{oops')).toBeNull();
  });

  it('formats money', () => {
    expect(formatMoney(1234)).toBe('$12.34');
    expect(formatMoney(5, 'EUR')).toBe('€0.05');
    expect(formatMoney(null, 'EUR')).toBe('—');
    expect(formatMoney(2878765)).toBe('$28,787.65');
  });
});

describe('headline price', () => {
  it('market for near mint, lowest listing for played cards', async () => {
    const { headlinePrice, quoteFor } = await import('../src/lib/prices');
    const card = { prices: { holo: { usd: 100105, usdLow: 52414, eur: null } }, tcgplayer_url: null };
    expect(headlinePrice(quoteFor(card, 'holo'))).toBe(100105);
    expect(headlinePrice(quoteFor(card, 'holo', 'HP'))).toBe(52414);
    expect(headlinePrice(quoteFor({ prices: { holo: { usd: 900, usdLow: null, eur: null } }, tcgplayer_url: null }, 'holo', 'LP'))).toBe(900);
  });
});
