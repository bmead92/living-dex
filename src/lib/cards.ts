import { USER_AGENT } from './appInfo';
import { withShadowlessPrices } from './tcgcsv';
import { cardsInSet, closestName, findInSet, getSet, printingsOf, setIdOf, type CatalogCard } from './catalog';

const BASE = 'https://api.tcgdex.net/v2/en';
const ASSETS = 'https://assets.tcgdex.net/en';
const HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const MIN_GAP_MS = 60;
const PARALLEL = 6;

export type BaseFinish = 'normal' | 'holo' | 'reverse' | 'first' | 'shadowless';
export type Finish = BaseFinish | `${BaseFinish}+${string}`;
const BASE_LABEL: Record<BaseFinish, string> = {
  normal: 'Normal',
  holo: 'Holo',
  reverse: 'Reverse holo',
  first: '1st Edition',
  shadowless: 'Shadowless',
};
const BASE_SHORT: Record<BaseFinish, string> = {
  normal: '',
  holo: 'holo',
  reverse: 'reverse',
  first: '1st ed',
  shadowless: 'shadowless',
};
const TAG_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  energy: 'Energy',
  cosmos: 'Cosmos',
  'cracked-ice': 'Cracked Ice',
  rainbow: 'Rainbow',
  tinsel: 'Tinsel',
  starlight: 'Starlight',
  league: 'League',
  'set-logo': 'Set logo stamp',
  mcdonalds: "McDonald's",
  'pre-release': 'Prerelease',
  'player-rewards-program': 'Play! Pokémon stamp',
  'professor-program': 'Professor stamp',
  staff: 'Staff',
  winner: 'Winner',
  '25th-celebration': '25th stamp',
  '30th-anniversary': '30th stamp',
  wotc: 'W stamp',
};
const BASES: BaseFinish[] = ['normal', 'holo', 'reverse', 'first', 'shadowless'];

export const baseFinish = (f: string): BaseFinish => f.split('+')[0] as BaseFinish;
const tagsOf = (f: string) => f.split('+').slice(1);
const tagLabel = (t: string) =>
  TAG_LABEL[t] ?? t.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

export function isFinish(v: unknown): v is Finish {
  if (typeof v !== 'string') return false;
  return BASES.includes(baseFinish(v)) && (v === baseFinish(v) || /^[a-z]+(\+[a-z0-9-]+)+$/.test(v));
}

export function finishLabel(f: Finish, holoOnly = false): string {
  const base = baseFinish(f);
  const tags = tagsOf(f);
  if (!tags.length) {
    if (holoOnly && base === 'holo') return 'Unlimited';
    return BASE_LABEL[base];
  }
  const kind = base === 'reverse' ? 'reverse' : base === 'holo' ? 'holo' : '';
  return [tags.map(tagLabel).join(' · '), kind].filter(Boolean).join(' ');
}

export function finishShort(f: Finish): string {
  const tags = tagsOf(f);
  if (!tags.length) return BASE_SHORT[baseFinish(f)];
  return finishLabel(f).replace('reverse', 'rev');
}

export interface FinishPrice {
  usd: number | null;
  usdLow: number | null;
  eur: number | null;
  fromEur?: boolean;
  unlimited?: boolean;
  url?: string;
}

export const EUR_TO_USD = 1.1;

export interface Card {
  id: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  set_code: string | null;
  collector_number: string;
  official: number | null;
  released_at: string;
  finishes: Finish[];
  image: string | null;
  rarity: string;
  category: string;
  types: string[];
  stage: string | null;
  trainer_type: string | null;
  hp: number | null;
  illustrator: string | null;
  prices: Partial<Record<Finish, FinishPrice>>;
  tcgplayer_url: string | null;
}

type Market = Record<string, unknown> | null | undefined;

interface ApiCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  category?: string;
  rarity?: string;
  illustrator?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  trainerType?: string;
  energyType?: string;
  set: { id: string; name: string; cardCount?: { official?: number } };
  variants?: { normal?: boolean; holo?: boolean; reverse?: boolean; firstEdition?: boolean };
  variants_detailed?: DetailedVariant[];
  pricing?: { tcgplayer?: Market; cardmarket?: Market };
}

const cents = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);

function tcgEntry(tcg: Market, keys: string[]): Record<string, unknown> | null {
  for (const k of keys) {
    const e = tcg?.[k];
    if (e && typeof e === 'object') return e as Record<string, unknown>;
  }
  return null;
}

const TCG_KEYS: Record<BaseFinish, string[]> = {
  normal: ['normal', 'unlimited'],
  holo: ['holofoil', 'unlimited-holofoil'],
  reverse: ['reverse-holofoil'],
  first: ['1st-edition-holofoil', '1st-edition'],
  shadowless: [],
};

interface DetailedVariant {
  type?: string;
  subtype?: string;
  foil?: string;
  stamp?: string[];
  size?: string;
  pricing?: { tcgplayer?: Market; cardmarket?: Market } | null;
}

const VARIANT_BASE: Record<string, BaseFinish> = { normal: 'normal', holo: 'holo', reverse: 'reverse' };
const TCG_ANY = ['holofoil', 'reverse-holofoil', 'normal', 'unlimited-holofoil', 'unlimited', '1st-edition-holofoil', '1st-edition'];

function productIds(m: Market): number[] {
  return Object.values(m ?? {}).flatMap((v) => {
    const id = v && typeof v === 'object' ? (v as Record<string, unknown>).productId : null;
    return typeof id === 'number' ? [id] : [];
  });
}

function variantPrice(v: DetailedVariant, base: BaseFinish): FinishPrice | null {
  const e = tcgEntry(v.pricing?.tcgplayer, TCG_ANY);
  const usd = cents(e?.marketPrice) ?? cents(e?.midPrice);
  const cm = v.pricing?.cardmarket;
  const eur = base === 'normal' ? cents(cm?.trend) : (cents(cm?.['trend-holo']) ?? cents(cm?.trend));
  if (usd == null && eur == null) return null;
  return usd == null ? { usd: Math.round(eur! * EUR_TO_USD), usdLow: null, eur, fromEur: true } : { usd, usdLow: cents(e?.lowPrice), eur };
}

export function specialVariants(raw: Pick<ApiCard, 'pricing' | 'variants_detailed'>): Map<Finish, FinishPrice> {
  const out = new Map<Finish, FinishPrice>();
  const tcgIds = new Set(productIds(raw.pricing?.tcgplayer));
  const cmId = (raw.pricing?.cardmarket as Record<string, unknown> | undefined)?.idProduct;
  for (const v of raw.variants_detailed ?? []) {
    const base = VARIANT_BASE[v.type ?? ''];
    const stamps = (v.stamp ?? []).filter((x) => x !== '1st-edition');
    if (!base || v.subtype || (v.size && v.size !== 'standard') || (!v.foil && !stamps.length)) continue;
    if ((v.stamp ?? []).includes('1st-edition')) continue;
    const ownTcg = productIds(v.pricing?.tcgplayer).some((id) => !tcgIds.has(id));
    const vcm = (v.pricing?.cardmarket as Record<string, unknown> | undefined)?.idProduct;
    const ownCm = vcm != null && vcm !== cmId;
    if (!ownTcg && !ownCm) continue;
    const price = variantPrice(v, base);
    if (!price) continue;
    const key = [base, ...(v.foil ? [v.foil] : []), ...stamps].join('+') as Finish;
    if (!out.has(key)) out.set(key, price);
  }
  return out;
}

const shadowlessOf = (detailed: DetailedVariant[] | undefined) =>
  detailed?.find((d) => d.subtype === 'shadowless' && !d.stamp?.length);

export function finishesOf(v: ApiCard['variants'], detailed?: DetailedVariant[], pricing?: ApiCard['pricing']): Finish[] {
  const out: Finish[] = [];
  if (v?.normal) out.push('normal');
  if (v?.holo) out.push('holo');
  if (v?.reverse) out.push('reverse');
  if (v?.firstEdition) out.push('first');
  if (shadowlessOf(detailed)) out.push('shadowless');
  if (!out.length) out.push('normal');
  return [...out, ...specialVariants({ variants_detailed: detailed, pricing }).keys()];
}

export function pricesOf(
  raw: Pick<ApiCard, 'pricing' | 'variants_detailed'>,
  finishes: Finish[],
): Partial<Record<Finish, FinishPrice>> {
  const tcg = raw.pricing?.tcgplayer;
  const cm = raw.pricing?.cardmarket;
  const holoOnly = finishes.includes('holo') && !finishes.includes('normal');
  const out: Partial<Record<Finish, FinishPrice>> = {};
  const special = specialVariants(raw);
  for (const f of finishes) {
    if (special.has(f)) {
      out[f] = special.get(f);
      continue;
    }
    if (f.includes('+')) continue;
    if (f === 'shadowless') {
      const sl = shadowlessOf(raw.variants_detailed)?.pricing?.tcgplayer;
      const own = sl ? tcgEntry(sl, ['normal', 'holofoil', 'unlimited', 'unlimited-holofoil']) : null;
      const e = own ?? tcgEntry(tcg, holoOnly ? TCG_KEYS.holo : TCG_KEYS.normal);
      const usd = cents(e?.marketPrice) ?? cents(e?.midPrice);
      out[f] = { usd, usdLow: cents(e?.lowPrice), eur: null, ...(own || usd == null ? {} : { unlimited: true }) };
      continue;
    }
    const keys = f === 'first' && !holoOnly ? ['1st-edition', '1st-edition-holofoil'] : TCG_KEYS[f as BaseFinish];
    const e = tcgEntry(tcg, keys);
    const eur =
      f === 'first' ? null : f === 'normal' || (f === 'holo' && holoOnly) ? cents(cm?.trend) : cents(cm?.['trend-holo']);
    const usd = cents(e?.marketPrice) ?? cents(e?.midPrice);
    out[f] =
      usd == null && eur != null
        ? { usd: Math.round(eur * EUR_TO_USD), usdLow: null, eur, fromEur: true }
        : { usd, usdLow: cents(e?.lowPrice), eur };
  }
  return out;
}

function tcgUrl(raw: ApiCard): string | null {
  const tcg = raw.pricing?.tcgplayer;
  for (const v of Object.values(tcg ?? {})) {
    const id = v && typeof v === 'object' ? (v as Record<string, unknown>).productId : null;
    if (typeof id === 'number') return `https://www.tcgplayer.com/product/${id}`;
  }
  return null;
}

export function fromApi(raw: ApiCard): Card {
  const set = getSet(raw.set.id);
  const finishes = finishesOf(raw.variants, raw.variants_detailed, raw.pricing);
  return {
    id: raw.id,
    name: raw.name,
    lang: 'en',
    set: raw.set.id,
    set_name: raw.set.name,
    set_code: set?.code ?? null,
    collector_number: raw.localId,
    official: set?.official ?? raw.set.cardCount?.official ?? null,
    released_at: set?.released ?? '',
    finishes,
    image: raw.image ?? null,
    rarity: raw.rarity ?? '',
    category: raw.category ?? '',
    types: raw.types ?? [],
    stage: raw.stage ?? null,
    trainer_type: raw.trainerType ?? null,
    hp: raw.hp ?? null,
    illustrator: raw.illustrator ?? null,
    prices: pricesOf(raw, finishes),
    tcgplayer_url: tcgUrl(raw),
  };
}

export function liteCard(c: CatalogCard): Card {
  const set = getSet(c.setId);
  return {
    id: c.id,
    name: c.name,
    lang: 'en',
    set: c.setId,
    set_name: set?.name ?? c.setId,
    set_code: set?.code ?? null,
    collector_number: c.localId,
    official: set?.official ?? null,
    released_at: set?.released ?? '',
    finishes: ['normal'],
    image: set ? `${ASSETS}/${set.serieId}/${c.setId}/${c.localId}` : null,
    rarity: '',
    category: '',
    types: [],
    stage: null,
    trainer_type: null,
    hp: null,
    illustrator: null,
    prices: {},
    tcgplayer_url: null,
  };
}

let lastRequestAt = 0;
let gate: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const slot = gate.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  gate = slot.catch(() => {});
  return slot;
}

async function request(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, { headers: HEADERS });
    if ((res.status !== 429 && res.status < 500) || attempt === 3) return res;
    const retryAfter = Number(res.headers.get('Retry-After')) || 0;
    await new Promise((r) => setTimeout(r, Math.max(retryAfter * 1000, 1000 * 2 ** attempt)));
  }
}

export async function cardById(id: string): Promise<Card | null> {
  const res = await request(`${BASE}/cards/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Card lookup failed (${res.status})`);
  return withShadowlessPrices(fromApi((await res.json()) as ApiCard));
}

export async function cardsByIds(ids: string[], onProgress?: (done: number) => void): Promise<Card[]> {
  const unique = [...new Set(ids)];
  const out: Card[] = [];
  let next = 0;
  let done = 0;
  let failure: unknown = null;
  const worker = async () => {
    while (next < unique.length && !failure) {
      const id = unique[next++];
      try {
        const c = await cardById(id);
        if (c) out.push(c);
      } catch (e) {
        failure = e;
      }
      onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, unique.length) }, worker));
  if (failure && out.length === 0) throw failure;
  return out;
}

export async function cardBySetAndNumber(setId: string, number: string): Promise<Card | null> {
  const hit = findInSet(setId, number);
  return hit ? cardById(hit.id) : null;
}

export async function cardByFuzzyName(name: string): Promise<Card | null> {
  const best = closestName(name);
  const first = best ? printingsOf(best)[0] : null;
  return first ? cardById(first.id) : null;
}

const numeric = (n: string) => {
  const m = n.match(/\d+/);
  return m ? Number(m[0]) : Number.NaN;
};

export async function cardByNameInSet(name: string, setId: string, approxNumber?: string | null): Promise<Card | null> {
  const want = name.toLowerCase();
  const prints = cardsInSet(setId).filter((c) => c.name.toLowerCase() === want);
  if (prints.length === 0) return null;
  const target = approxNumber ? numeric(approxNumber) : Number.NaN;
  const best = Number.isNaN(target)
    ? prints[0]
    : prints.reduce((a, b) => (Math.abs(numeric(b.localId) - target) < Math.abs(numeric(a.localId) - target) ? b : a));
  return cardById(best.id);
}

export async function allPrintings(card: Pick<Card, 'name'>): Promise<Card[]> {
  return printingsOf(card.name).map(liteCard);
}

export function cardImage(card: Pick<Card, 'image'>, size: 'small' | 'normal' | 'large' = 'normal'): string | null {
  return card.image ? `${card.image}/${size === 'small' ? 'low' : 'high'}.webp` : null;
}

export function faceImages(card: Card, size: 'small' | 'normal' | 'large' = 'normal'): { name: string; uri: string }[] {
  const uri = cardImage(card, size);
  return uri ? [{ name: card.name, uri }] : [];
}

export const frontName = (name: string) => name;

export function cardNumber(c: { collector_number: string; set_code?: string | null }, official?: number | null) {
  return official && /^\d+$/.test(c.collector_number) ? `${c.collector_number}/${official}` : c.collector_number;
}

export function officialOf(setId: string): number | null {
  return getSet(setId)?.official ?? null;
}

export { setIdOf };

export interface CardMeta {
  type_line: string | null;
  color_identity: string;
  rarity: string | null;
  released_at: string | null;
  layout: string | null;
  lang: string | null;
}

export function cardMeta(c: Card): CardMeta {
  const sub = c.category === 'Pokemon' ? c.stage : c.trainer_type;
  const category = c.category === 'Pokemon' ? 'Pokémon' : c.category;
  return {
    type_line: [category, sub].filter(Boolean).join(' · ') || null,
    color_identity: c.types.join(','),
    rarity: c.rarity || null,
    released_at: c.released_at || null,
    layout: null,
    lang: 'en',
  };
}

export function shortPrinting(setId: string, number: string): string {
  const set = getSet(setId);
  return `${set?.code ?? setId.toUpperCase()} ${cardNumber({ collector_number: number }, set?.official)}`;
}

export function finishLabels(finishes: Finish[]): Partial<Record<Finish, string>> {
  const editions = finishes.includes('holo') && !finishes.includes('normal') && finishes.some((f) => f === 'first' || f === 'shadowless');
  return Object.fromEntries(finishes.map((f) => [f, finishLabel(f, editions)]));
}
