import './sim/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CatalogSet } from '../src/lib/catalog';
import { setCodesByCount, suggestProducts } from '../src/lib/sealed';
import { buildSetList, productsFor, searchSets, toEntry, usualProducts } from '../src/lib/setList';
import { summarizeSources } from '../src/lib/sources';
import { resetDatabases } from './stubs/expo-sqlite';
import { ALT, SIM } from './sim/fixture';
import { launchApp, review, scanPulls, settle, type App } from './sim/harness';
import { openBox, openPack, packValue, type Pull } from './sim/packs';
import { seeded } from './sim/rng';

const SETS: CatalogSet[] = [SIM, ALT].map((s, i) => ({
  id: s.code.toLowerCase(),
  name: s.name,
  code: s.code,
  official: 260,
  released: `2026-0${i + 1}-01`,
  serie: 'Simulated',
  serieId: 'sim',
  symbol: null,
}));
const LIST = buildSetList(SETS);

function pick(query: string, product: string, want: 'pack' | 'box' | 'any' = 'any') {
  const [set] = searchSets(LIST, query);
  const p = productsFor(set, [], want).find((x) => x.product.name.endsWith(product));
  if (!p) throw new Error(`no ${product} in ${set.name}`);
  return p;
}

beforeEach(() => resetDatabases());

const loadOpening = () => import('../src/lib/opening');

async function scanAndReview(app: App, pulls: Pull[], rng: () => number) {
  scanPulls(app, pulls, rng);
  await settle(app);
  await review(app, pulls);
  await settle(app);
}

const setCodesOf = (app: App) => setCodesByCount(app.stack.getStackItems().flatMap((i) => (i.card ? [i.card.set] : [])));

describe('picking the product before opening', () => {
  it('a booster pack: set picked → product picked → saved, then the price paid gives the gain', async () => {
    const rng = seeded(200);
    const app = await launchApp();
    const opening = await loadOpening();

    const top = pick('simulated', 'Booster Pack');
    expect(top.product.name).toBe('Simulated Expansion Booster Pack');
    opening.setOpening({ product: top.product, type: top.type });

    const pack = openPack(SIM, rng, 'play');
    await scanAndReview(app, pack, rng);
    const source = opening.sourceFromProduct(opening.getOpening()!, app.stack.getStackItems().length);
    expect(source).toMatchObject({ kind: 'pack', name: 'Simulated Expansion Booster Pack', cost_cents: null, set_code: 'SIM' });
    await app.stack.saveStack({ kind: 'new', source: { ...source, cost_cents: 449 } });

    const [src] = await app.db.listSources();
    const rows = await app.db.listSourceCards(src.id);
    const [s] = summarizeSources([src], rows.map((r) => ({ source_id: r.source_id, copies: r.copies, priceCents: r.price_cents })));
    expect(s.valueCents).toBe(packValue(pack));
    expect(s.gainCents).toBe(packValue(pack) - 449);
  });

  it('nothing picked: suggestions from the cards, booster pack first; boxes are box, ETB, bundle', async () => {
    const rng = seeded(202);
    const app = await launchApp();
    await scanAndReview(app, openPack(SIM, rng, 'play'), rng);
    const catalog = SETS.flatMap((s) => usualProducts(toEntry(s)));
    expect(suggestProducts(catalog, { setCodes: setCodesOf(app), want: 'pack' }).map((x) => x.product.name)).toEqual([
      'Simulated Expansion Booster Pack',
    ]);
    expect(suggestProducts(catalog, { setCodes: setCodesOf(app), want: 'box' }).map((x) => x.product.name)).toEqual([
      'Simulated Expansion Booster Box',
      'Simulated Expansion Elite Trainer Box',
      'Simulated Expansion Booster Bundle',
    ]);
  });

  it('old sets have no Elite Trainer Box or bundle', () => {
    const base = usualProducts({ code: 'BASE1', name: 'Base Set', released: '1999-01-09' }).map((p) => p.name);
    expect(base).toEqual(['Base Set Booster Pack', 'Base Set Booster Box']);
  });
});

describe('a booster box opened over several sittings', () => {
  it('36 packs; later sittings continue it', async () => {
    const rng = seeded(204);
    const box = openBox(SIM, rng, 'play', 36);
    let app = await launchApp();
    let opening = await loadOpening();
    const top = pick('SIM', 'Booster Box', 'box');
    opening.setOpening({ product: top.product, type: top.type });

    app = await launchApp();
    opening = await loadOpening();
    expect((await opening.loadOpening())?.product.name).toBe('Simulated Expansion Booster Box');

    await scanAndReview(app, box.slice(0, 4).flat(), rng);
    const src = opening.sourceFromProduct(opening.getOpening()!, app.stack.getStackItems().length);
    expect(src).toMatchObject({ kind: 'box', packs: 36 });
    await app.stack.saveStack({ kind: 'new', source: { ...src, packs_opened: 4, cost_cents: 14999 } });
    opening.setOpening(null);

    const [created] = await app.db.listSources();
    for (const sitting of [box.slice(4, 20), box.slice(20)]) {
      app = await launchApp();
      await scanAndReview(app, sitting.flat(), rng);
      await app.stack.saveStack({ kind: 'existing', sourceId: created.id, packsOpened: sitting.length });
    }
    const [done] = await app.db.listSources();
    expect(done.packs_opened).toBe(36);
    const rows = await app.db.listSourceCards(done.id);
    expect(rows.reduce((n, r) => n + r.copies, 0)).toBe(box.flat().length);
  });
});
