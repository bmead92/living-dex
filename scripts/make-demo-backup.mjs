// Demo collection for the emulator and screenshots: a childhood binder of Wizards-era cards (owned for years,
// played with) plus modern packs, an Elite Trainer Box and a booster bundle opened this year, a few singles
// bought, one sale, and daily value history. Real cards and prices from TCGdex.
//
// Usage: node scripts/make-demo-backup.mjs <out.json> [cache-dir]
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.tcgdex.net/v2/en';
const HEADERS = { 'User-Agent': 'LivingDex-demo/1.0', Accept: 'application/json' };
const [out, cacheDir] = process.argv.slice(2);
if (!out) throw new Error('usage: make-demo-backup.mjs <out.json> [cache-dir]');
if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const file = cacheDir && path.join(cacheDir, url.replace(/[^a-z0-9.]+/gi, '_') + '.json');
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const body = await res.json();
      if (file) fs.writeFileSync(file, JSON.stringify(body));
      await sleep(80);
      return body;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`failed ${url}`);
}

let seed = 42;
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (list) => list[Math.floor(rng() * list.length)];

const byRarity = async (set, rarity) => get(`${BASE}/cards?set.id=eq:${set}&rarity=eq:${encodeURIComponent(rarity)}`);
const details = new Map();
async function card(id) {
  if (!details.has(id)) details.set(id, await get(`${BASE}/cards/${encodeURIComponent(id)}`));
  return details.get(id);
}

const cents = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 100) : null);
const TCG_KEYS = {
  normal: ['normal', 'unlimited'],
  holo: ['holofoil', 'unlimited-holofoil'],
  reverse: ['reverse-holofoil'],
  first: ['1st-edition-holofoil', '1st-edition'],
};
function finishes(v) {
  const f = [];
  if (v?.normal) f.push('normal');
  if (v?.holo) f.push('holo');
  if (v?.reverse) f.push('reverse');
  if (v?.firstEdition) f.push('first');
  return f.length ? f : ['normal'];
}
function prices(c) {
  const tcg = c.pricing?.tcgplayer;
  const cm = c.pricing?.cardmarket;
  const fs_ = finishes(c.variants);
  const holoOnly = fs_.includes('holo') && !fs_.includes('normal');
  const outP = {};
  for (const f of fs_) {
    const keys = f === 'first' && !holoOnly ? ['1st-edition', '1st-edition-holofoil'] : TCG_KEYS[f];
    const e = keys.map((k) => tcg?.[k]).find((x) => x && typeof x === 'object');
    const eur = f === 'first' ? null : f === 'normal' || (f === 'holo' && holoOnly) ? cents(cm?.trend) : cents(cm?.['trend-holo']);
    outP[f] = { usd: cents(e?.marketPrice) ?? cents(e?.midPrice), usdLow: cents(e?.lowPrice), eur };
  }
  return outP;
}
const tcgUrl = (c) => {
  for (const v of Object.values(c.pricing?.tcgplayer ?? {})) if (v && typeof v === 'object' && v.productId) return `https://www.tcgplayer.com/product/${v.productId}`;
  return null;
};

const catalog = JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const setInfo = new Map(catalog.sets.map((s) => [s.id, s]));

const rows = new Map();
const sources = [];
const sales = [];

async function add(id, { finish, condition = 'NM', at, source = null, qty = 1 }) {
  const c = await card(id);
  const fsList = finishes(c.variants);
  const f = fsList.includes(finish) ? finish : fsList.includes('normal') ? 'normal' : fsList[0];
  const p = prices(c);
  const key = `${id}|${f}|${condition}`;
  const unit = condition === 'NM' ? (p[f]?.usd ?? p[f]?.usdLow ?? null) : (p[f]?.usdLow ?? p[f]?.usd ?? null);
  let row = rows.get(key);
  if (!row) {
    const meta = c.category === 'Pokemon' ? c.stage : c.trainerType;
    row = {
      card_id: id,
      name: c.name,
      set_code: c.set.id,
      set_name: c.set.name,
      collector_number: c.localId,
      image_uri: c.image ? `${c.image}/high.webp` : null,
      finish: f,
      condition,
      quantity: 0,
      price_cents: unit,
      market_cents: p[f]?.usd ?? null,
      low_cents: p[f]?.usdLow ?? null,
      market_url: tcgUrl(c),
      price_updated_at: new Date().toISOString(),
      other_prices: JSON.stringify(p),
      type_line: [c.category === 'Pokemon' ? 'Pokémon' : c.category, meta].filter(Boolean).join(' · '),
      color_identity: (c.types ?? []).join(','),
      rarity: c.rarity ?? null,
      released_at: setInfo.get(c.set.id)?.released ?? null,
      layout: null,
      lang: 'en',
      created_at: at,
      from: [],
    };
    rows.set(key, row);
  }
  row.quantity += qty;
  row.from.push({ source, quantity: qty, price_cents: unit, added_at: at });
}

const day = (s) => new Date(`${s}T15:00:00Z`).toISOString();

// Childhood binder, added the week the app was installed. Played-with condition.
const BINDER_AT = day('2025-12-06');
const vintage = [
  ['base1', ['Common', 'Uncommon'], 26],
  ['base2', ['Common', 'Uncommon'], 14],
  ['base3', ['Common', 'Uncommon'], 12],
  ['base5', ['Common', 'Uncommon'], 10],
  ['gym1', ['Common', 'Uncommon'], 6],
];
for (const [set, rarities, n] of vintage) {
  const pool = (await Promise.all(rarities.map((r) => byRarity(set, r)))).flat();
  for (let i = 0; i < n; i++) await add(pick(pool).id, { finish: 'normal', condition: pick(['LP', 'LP', 'MP', 'MP', 'HP']), at: BINDER_AT });
}
for (const id of ['base1-2', 'base1-15', 'base2-10', 'base3-5', 'base5-8', 'base1-58', 'base1-58', 'base1-58', 'base2-60', 'base1-44'])
  await add(id, { finish: 'holo', condition: pick(['LP', 'MP']), at: BINDER_AT });
await add('base1-4', { finish: 'holo', condition: 'HP', at: BINDER_AT });

const SV_SLOTS = [
  ['Rare', 0.68],
  ['Double rare', 0.16],
  ['Illustration rare', 0.08],
  ['Ultra Rare', 0.05],
  ['Special illustration rare', 0.02],
  ['Hyper rare', 0.01],
];
async function svPack(set) {
  const common = await byRarity(set, 'Common');
  const uncommon = await byRarity(set, 'Uncommon');
  const rare = await byRarity(set, 'Rare');
  const pulls = [];
  for (let i = 0; i < 4; i++) pulls.push([pick(common).id, 'normal']);
  for (let i = 0; i < 3; i++) pulls.push([pick(uncommon).id, 'normal']);
  for (let i = 0; i < 2; i++) pulls.push([pick([...common, ...uncommon, ...rare]).id, 'reverse']);
  let x = rng();
  let slot = 'Rare';
  for (const [r, p] of SV_SLOTS) {
    if (x < p) {
      slot = r;
      break;
    }
    x -= p;
  }
  const pool = (await byRarity(set, slot)).length ? await byRarity(set, slot) : rare;
  pulls.push([pick(pool).id, 'holo']);
  return pulls;
}

async function openProduct({ kind, name, set, packs, cost, at }) {
  const ref = sources.length + 1;
  sources.push({ ref, kind, name, cost_cents: cost, packs, packs_opened: packs, set_code: set.toUpperCase(), product_id: null, finished: 0, created_at: at });
  for (let p = 0; p < packs; p++) for (const [id, finish] of await svPack(set)) await add(id, { finish, at, source: ref });
}

await openProduct({ kind: 'box', name: 'Surging Sparks Elite Trainer Box', set: 'sv08', packs: 9, cost: 4999, at: day('2026-02-14') });
await openProduct({ kind: 'box', name: '151 Booster Bundle', set: 'sv03.5', packs: 6, cost: 3199, at: day('2026-05-02') });
for (const at of ['2026-07-11T15:00:00Z', '2026-07-11T15:20:00Z', '2026-09-20T15:00:00Z'])
  await openProduct({ kind: 'pack', name: 'Prismatic Evolutions Booster Pack', set: 'sv08.5', packs: 1, cost: 999, at: new Date(at).toISOString() });
await openProduct({ kind: 'pack', name: 'Destined Rivals Booster Pack', set: 'sv10', packs: 1, cost: 549, at: day('2026-10-25') });

for (const [id, finish, d] of [
  ['sv03.5-025', 'normal', '2026-03-01'],
  ['swsh12.5-160', 'holo', '2026-04-18'],
  ['sv08.5-161', 'holo', '2026-08-09'],
])
  await add(id, { finish, at: day(d) });

const sold = [...rows.values()].filter((r) => r.from.some((f) => f.source)).sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0))[0];
if (sold) {
  const taken = sold.from.shift();
  sold.quantity -= 1;
  if (sold.quantity === 0) rows.delete([...rows.entries()].find(([, v]) => v === sold)[0]);
  const { from: _f, quantity: _q, ...cardFields } = sold;
  sales.push({ sold_at: day('2026-11-02'), quantity: 1, sold_cents: Math.round((sold.price_cents ?? 0) * 1.05), card: cardFields, from: [{ ...taken, quantity: 1 }] });
}

const cards = [...rows.values()].filter((r) => r.quantity > 0);
const snapshots = [];
const start = new Date('2025-12-06T00:00:00Z');
const end = new Date();
for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
  const iso = d.toISOString();
  let value = 0;
  let copies = 0;
  const t = (d - start) / (end - start);
  for (const c of cards)
    for (const f of c.from)
      if (f.added_at <= iso) {
        const drift = 0.82 + 0.18 * t + 0.03 * Math.sin(t * 19 + c.collector_number.length);
        value += Math.round((c.price_cents ?? 0) * drift) * f.quantity;
        copies += f.quantity;
      }
  if (copies > 0) snapshots.push({ day: iso.slice(0, 10), value_cents: value, tcg_cents: value, copies });
}

const backup = {
  format: 'living-dex-backup',
  version: 2,
  exportedAt: new Date().toISOString(),
  appVersion: 'demo',
  prefs: null,
  cards,
  sources,
  snapshots,
  sales,
};
fs.writeFileSync(out, JSON.stringify(backup));
const total = cards.reduce((n, c) => n + (c.price_cents ?? 0) * c.quantity, 0);
console.log(`${cards.reduce((n, c) => n + c.quantity, 0)} cards (${cards.length} rows), $${(total / 100).toFixed(2)}, ${sources.length} products, ${sales.length} sale, ${snapshots.length} days`);
