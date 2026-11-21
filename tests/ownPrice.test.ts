import './sim/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBackup, parseBackup, planRestore } from '../src/lib/backup';
import { launchApp } from './sim/harness';
import { resetDatabases } from './stubs/expo-sqlite';

const card = (id: string, price: number, condition: 'NM' | 'LP' = 'NM') => ({
  photo_uri: '',
  card_id: id,
  name: `Card ${id}`,
  set_code: 'base1',
  set_name: 'Base Set',
  collector_number: '1',
  image_uri: null,
  finish: 'normal' as const,
  condition,
  price_cents: price,
  market_cents: price,
  market_url: null,
  price_updated_at: null,
  type_line: 'Pokémon · Basic',
  color_identity: 'Fire',
  rarity: 'Common',
  released_at: '1999-01-09',
  layout: null,
});

beforeEach(() => resetDatabases());
afterEach(() => vi.unstubAllGlobals());

function stubPrice(usd: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = decodeURIComponent(url.split('/cards/')[1]);
      return new Response(
        JSON.stringify({
          id,
          localId: '1',
          name: id,
          set: { id: 'base1', name: 'Base Set' },
          variants: { normal: true },
          pricing: { tcgplayer: { normal: { lowPrice: usd / 2, marketPrice: usd } } },
        }),
      );
    }),
  );
}

describe('your own price', () => {
  it('is kept when prices refresh, and the market price still updates beside it', async () => {
    const app = await launchApp();
    const id = await app.db.insertScan(card('a', 2725));
    await app.db.setOwnPrice(id, 8000);
    stubPrice(300);
    const { refreshPrices } = await import('../src/lib/pricing');
    await refreshPrices(await app.db.listScans());
    expect(await app.db.getScan(id)).toMatchObject({ price_cents: 8000, market_cents: 30000, price_locked: 1 });

    await app.db.setOwnPrice(id, null);
    await refreshPrices(await app.db.listScans());
    expect(await app.db.getScan(id)).toMatchObject({ price_cents: 30000, price_locked: 0 });
  });

  it('adding another copy keeps it', async () => {
    const app = await launchApp();
    const id = await app.db.insertScan(card('a', 2725));
    await app.db.setOwnPrice(id, 8000);
    await app.db.insertScan(card('a', 2725));
    expect(await app.db.getScan(id)).toMatchObject({ price_cents: 8000, quantity: 2 });
  });

  it('survives a backup and restore', async () => {
    const app = await launchApp();
    const id = await app.db.insertScan(card('a', 2725));
    await app.db.setOwnPrice(id, 8000);
    const text = JSON.stringify(buildBackup(await app.db.listScans(), null, '1'));
    resetDatabases();
    const fresh = await launchApp();
    const parsed = parseBackup(text);
    await fresh.db.applyRestore(planRestore([], parsed.backup.cards, 'replace'));
    const [row] = await fresh.db.listScans();
    expect(row).toMatchObject({ price_cents: 8000, price_locked: 1 });
  });
});

describe('condition for many cards', () => {
  it('sets every card shown, merging copies that become identical', async () => {
    const app = await launchApp();
    const nm = await app.db.insertScan({ ...card('a', 100), quantity: 2 });
    await app.db.insertScan({ ...card('a', 100, 'LP'), quantity: 1 });
    await app.db.insertScan(card('b', 50));
    await app.db.setConditions((await app.db.listScans()).filter((s) => s.condition === 'NM').map((s) => s.id), 'LP');
    const rows = await app.db.listScans();
    expect(rows.every((r) => r.condition === 'LP')).toBe(true);
    expect(rows.find((r) => r.card_id === 'a')?.quantity).toBe(3);
    expect(rows).toHaveLength(2);
    void nm;
  });
});
