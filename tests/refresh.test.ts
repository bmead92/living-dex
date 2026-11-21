import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawDatabase, resetDatabases, stats } from './stubs/expo-sqlite';

const N = 2_000;

beforeEach(() => resetDatabases());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function seed() {
  vi.resetModules();
  const db = await import('../src/lib/db');
  await db.listScans();
  const raw = rawDatabase()!;
  const ins = raw.prepare(
    `INSERT INTO scans (photo_uri, card_id, name, set_code, set_name, collector_number, finish, condition, lang)
     VALUES ('', ?, ?, 'sim', 'Simulated', ?, ?, 'NM', 'en')`,
  );
  raw.exec('BEGIN');
  for (let i = 0; i < N; i++) ins.run(`sim-${i % (N / 2)}`, `Card ${i}`, String(i), i % 2 ? 'reverse' : 'normal');
  raw.exec('COMMIT');
  return db;
}

describe('refresh all prices', () => {
  it('asks once per distinct card, prices each finish, writes in one transaction', async () => {
    const db = await seed();
    const scans = await db.listScans();
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = decodeURIComponent(url.split('/cards/')[1]);
        asked.push(id);
        return new Response(
          JSON.stringify({
            id,
            localId: '1',
            name: id,
            set: { id: 'sim', name: 'Simulated' },
            variants: { normal: true, reverse: true },
            pricing: {
              tcgplayer: {
                normal: { productId: 7, lowPrice: 1, marketPrice: 1.2 },
                'reverse-holofoil': { lowPrice: 4, marketPrice: 4.5 },
              },
            },
          }),
        );
      }),
    );
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { refreshPrices } = await import('../src/lib/pricing');
    const before = stats.transactions;
    const run = refreshPrices(scans);
    await vi.runAllTimersAsync();
    await run;

    expect(asked).toHaveLength(N / 2);
    expect(new Set(asked).size).toBe(N / 2);
    expect(stats.transactions - before).toBe(1);
    const raw = rawDatabase()!;
    const row = (finish: string) =>
      raw.prepare('SELECT price_cents, low_cents, market_url FROM scans WHERE finish = ? LIMIT 1').get(finish) as {
        price_cents: number;
        low_cents: number;
        market_url: string;
      };
    expect(row('normal')).toEqual({ price_cents: 120, low_cents: 100, market_url: 'https://www.tcgplayer.com/product/7' });
    expect(row('reverse').price_cents).toBe(450);

    asked.length = 0;
    raw.exec("UPDATE scans SET condition = 'LP'");
    const again = refreshPrices(await db.listScans());
    await vi.runAllTimersAsync();
    await again;
    expect(asked).toHaveLength(0);
    expect(row('normal').price_cents).toBe(100);

    const forced = refreshPrices(await db.listScans(), undefined, { force: true });
    await vi.runAllTimersAsync();
    await forced;
    expect(asked).toHaveLength(N / 2);
  });
});
