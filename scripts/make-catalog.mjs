import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.tcgdex.net/v2/en';
const HEADERS = { 'User-Agent': 'LivingDex-catalog/1.0', Accept: 'application/json' };
const cacheDir = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const file = cacheDir && path.join(cacheDir, url.replace(/[^a-z0-9.]+/gi, '_') + '.json');
  if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) {
      const body = await res.json();
      if (file) fs.writeFileSync(file, JSON.stringify(body));
      await sleep(100);
      return body;
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`failed ${url}`);
}

if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
const list = await get(`${BASE}/sets`);
const sets = [];
const cards = {};
for (const s of list) {
  const d = await get(`${BASE}/sets/${s.id}`);
  if (d.serie?.id === 'tcgp' || !d.cards?.length) continue;
  sets.push({
    id: d.id,
    name: d.name,
    code: d.abbreviation?.official ?? null,
    official: d.cardCount?.official ?? d.cards.length,
    released: d.releaseDate ?? '',
    serie: d.serie?.name ?? '',
    serieId: d.serie?.id ?? '',
    symbol: d.symbol ?? null,
  });
  cards[d.id] = d.cards.map((c) => [c.localId, c.name]);
}
sets.sort((a, b) => b.released.localeCompare(a.released) || a.name.localeCompare(b.name));
const out = { builtAt: new Date().toISOString().slice(0, 10), sets, cards };
fs.writeFileSync(new URL('../src/data/catalog.json', import.meta.url), JSON.stringify(out));
console.log(`${sets.length} sets, ${Object.values(cards).reduce((n, c) => n + c.length, 0)} cards`);
