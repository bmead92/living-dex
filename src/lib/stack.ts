import { useSyncExternalStore } from 'react';
import type { Photo } from 'react-native-vision-camera';
import { processSavedCapture, savePhoto, type GuideFrame, type SavedCapture } from './capture';
import { createSource, getSource, insertScan, loadStackItems, updateSource, writeStackItems } from './db';
import { headlinePrice, quoteFor, serializePrices, type HeadlineSource } from './prices';
import { logFailure, logMatch, logRead } from './diag';
import { defaultFinish, identify, nameAppearsIn, type MatchMethod } from './identify';
import { getSet, printingsOf } from './catalog';
import type { Condition } from './condition';
import { normalizeName, sameCard } from './autoScan';
import type { CardGuess } from './ocr';
import { deletePhoto } from './photos';
import { cardById, cardImage, cardMeta, type Finish, type Card } from './cards';
import type { NewSource } from './sources';

export type StackStatus = 'queued' | 'reading' | 'identifying' | 'pricing' | 'done' | 'failed';

export interface StackItem {
  id: string;
  number: number; // 1-based shot order
  addedAt: number; // ms timestamp, for "Repeat?" hints in review
  status: StackStatus;
  photoUri: string | null;
  guess: CardGuess | null;
  card: Card | null;
  method: MatchMethod;
  finish: Finish;
  condition: Condition;
  include: boolean;
  doubtful?: boolean;
  error?: string;
}

let items: StackItem[] = [];
let shotCounter = 0;
const listeners = new Set<() => void>();

function emit() {
  items = [...items]; // new identity so useSyncExternalStore re-renders
  listeners.forEach((l) => l());
  scheduleFlush();
}

let persisted = new Map<string, StackItem>();
let restored: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushChain: Promise<void> = Promise.resolve();
const FLUSH_DELAY_MS = 300;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushStack();
  }, FLUSH_DELAY_MS);
}

export function flushStack(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushChain = flushChain
    .then(async () => {
      await restoreStack(); // never overwrite a saved Stack that hasn't been loaded yet
      const snapshot = new Map(items.map((it) => [it.id, it]));
      const upserts = items.filter((it) => persisted.get(it.id) !== it);
      const deletes = [...persisted.keys()].filter((id) => !snapshot.has(id));
      if (upserts.length === 0 && deletes.length === 0) return;
      await writeStackItems(
        upserts.map((it) => ({ id: it.id, data: JSON.stringify(it) })),
        deletes,
      );
      persisted = snapshot;
    })
    .catch((e) => console.warn('[stack] could not save the unsaved Stack', e));
  return flushChain;
}

const INTERRUPTED = 'The app closed before this card was read. Scan it again.';

export function restoreStack(): Promise<void> {
  restored ??= (async () => {
    let saved: StackItem[] = [];
    try {
      saved = (await loadStackItems()).map((d) => JSON.parse(d) as StackItem);
    } catch (e) {
      console.warn('[stack] could not load the unsaved Stack', e);
      return;
    }
    if (saved.length === 0) return;
    saved.sort((a, b) => a.number - b.number);
    persisted = new Map(saved.map((it) => [it.id, it]));
    const resume: StackItem[] = [];
    const revived = saved.map((it): StackItem => {
      if (it.status === 'queued' || it.status === 'reading') return { ...it, status: 'failed', error: INTERRUPTED };
      if ((it.status === 'identifying' || it.status === 'pricing') && it.guess) {
        const r = { ...it, status: 'identifying' as const };
        resume.push(r);
        return r;
      }
      return it;
    });
    shotCounter = Math.max(shotCounter, ...revived.map((it) => it.number));
    const fresh = items.filter((it) => !persisted.has(it.id)).map((it) => ({ ...it, number: ++shotCounter }));
    items = [...revived, ...fresh];
    emit();
    for (const it of resume)
      identifyAndPrice(it.id, it.guess!, null).catch((e) => {
        logFailure('restore', e);
        updateItem(it.id, { status: 'failed', error: String(e) });
      });
  })();
  return restored;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStack(): StackItem[] {
  return useSyncExternalStore(subscribe, () => items);
}

export const getStackItems = (): readonly StackItem[] => items;

export function updateItem(id: string, patch: Partial<StackItem>) {
  const i = items.findIndex((it) => it.id === id);
  if (i < 0) return;
  items[i] = { ...items[i], ...patch };
  emit();
}

export function removeItem(id: string) {
  const it = items.find((x) => x.id === id);
  if (it?.photoUri) deletePhoto(it.photoUri);
  const waiting = ready.get(id);
  if (waiting) deletePhoto(waiting.capture.path);
  ready.delete(id);
  items = items.filter((x) => x.id !== id);
  emit();
}

export function clearStack() {
  for (const it of items) if (it.photoUri) deletePhoto(it.photoUri);
  for (const { capture } of ready.values()) deletePhoto(capture.path);
  ready.clear();
  items = [];
  shotCounter = 0;
  emit();
}

export const isBusy = (it: StackItem) => it.status !== 'done' && it.status !== 'failed';

const ready = new Map<string, { capture: SavedCapture; guide: GuideFrame | null; hint: CardGuess | null }>();
const MAX_WORKERS = 2; // OCR/decoding run natively, so two at a time drains the queue ~2x faster
let activeWorkers = 0;

export function enqueue(photo: Photo, guide: GuideFrame | null = null, hint: CardGuess | null = null) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  items.push({
    id,
    number: ++shotCounter,
    addedAt: Date.now(),
    status: 'queued',
    photoUri: null,
    guess: null,
    card: null,
    method: 'none',
    finish: 'normal',
    condition: 'NM',
    include: true,
  });
  emit();

  savePhoto(photo)
    .then((capture) => {
      if (!items.some((it) => it.id === id)) return deletePhoto(capture.path); // removed meanwhile
      ready.set(id, { capture, guide, hint });
      pump();
    })
    .catch((e) => updateItem(id, { status: 'failed', error: String(e) }));
}

function pump() {
  while (activeWorkers < MAX_WORKERS) {
    const next = items.find((it) => it.status === 'queued' && ready.has(it.id));
    if (!next) return;
    const job = ready.get(next.id)!;
    ready.delete(next.id);
    updateItem(next.id, { status: 'reading' }); // claim it synchronously so it isn't picked twice
    activeWorkers++;
    processItem(next.id, job.capture, job.guide, job.hint).finally(() => {
      activeWorkers--;
      pump();
    });
  }
}

function nameMatches(card: Card, g: CardGuess | null): boolean {
  if (!g) return false;
  if (nameAppearsIn(card.name, g.rawText)) return true;
  const read = normalizeName(g.name);
  if (!read) return false;
  return [card.name].some((face) => {
    const f = normalizeName(face);
    return !!f && (sameCard(read, f) || (read.length >= 5 && (f.includes(read) || read.includes(f))));
  });
}

const REPEAT_WINDOW_MS = 30_000;

export function isLikelyRepeat(it: StackItem, all: StackItem[]): boolean {
  if (!it.card) return false;
  return all.some(
    (o) =>
      o.number < it.number &&
      o.include &&
      o.card?.id === it.card!.id &&
      o.finish === it.finish &&
      it.addedAt - o.addedAt < REPEAT_WINDOW_MS,
  );
}

const readScore = (g: CardGuess | null) => (g ? (g.name ? 1 : 0) + (g.setCode || g.total ? 1 : 0) + (g.collectorNumber ? 1 : 0) : -1);

export function enqueueRead(guess: CardGuess) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  items.push({
    id,
    number: ++shotCounter,
    addedAt: Date.now(),
    status: 'identifying',
    photoUri: null,
    guess,
    card: null,
    method: 'none',
    finish: 'normal',
    condition: 'NM',
    include: true,
  });
  emit();
  logRead('auto', guess);
  identifyAndPrice(id, guess, null).catch((e) => {
    logFailure('auto', e);
    updateItem(id, { status: 'failed', error: String(e) });
  });
}

async function processItem(id: string, capture: SavedCapture, guide: GuideFrame | null, hint: CardGuess | null) {
  try {
    const { photoUri, guess } = await processSavedCapture(capture, guide);
    if (!items.some((it) => it.id === id)) return deletePhoto(photoUri); // removed while reading
    logRead('stack', guess);
    updateItem(id, { photoUri, guess, status: 'identifying' });
    await identifyAndPrice(id, guess, hint);
  } catch (e) {
    logFailure('stack', e);
    updateItem(id, { status: 'failed', error: String(e) });
  }
}

async function identifyAndPrice(id: string, guess: CardGuess, hint: CardGuess | null) {
  const [first, second] = hint && readScore(hint) >= readScore(guess) ? [hint, guess] : [guess, hint];
  let result = await identify(first);
  if (!result.card && second) {
    const retry = await identify(second);
    if (retry.card) result = retry;
  }
  if (hint) console.info('[auto] used', first === hint ? 'frame read' : 'photo read', result.card ? 'ok' : 'no match');
  if (result.card && result.method === 'name') {
    const nearby = await nearSessionEra(result.card.name, id);
    if (nearby) result = { ...result, card: nearby };
  }
  logMatch('stack', result);
  const { card, method, foil } = result;
  if (!card) return updateItem(id, { status: 'done', method: 'none' });
  const doubtful = !nameMatches(card, guess) && !nameMatches(card, hint);
  const raw = `${guess.rawText} ${hint?.rawText ?? ''}`;
  updateItem(id, { card, method, finish: defaultFinish(card, foil, raw), status: 'done', doubtful });
}

async function nearSessionEra(name: string, exceptId: string): Promise<Card | null> {
  const years = items
    .filter((it) => it.id !== exceptId && it.card && it.method !== 'name' && it.method !== 'none')
    .map((it) => Number(it.card!.released_at.slice(0, 4)))
    .filter((y) => y > 0)
    .sort((a, b) => a - b);
  if (years.length < 2) return null;
  const median = years[Math.floor(years.length / 2)];
  const pick = printingsOf(name)
    .map((p) => ({ p, y: Number(getSet(p.setId)?.released.slice(0, 4)) }))
    .filter(({ y }) => Math.abs(y - median) <= 1)
    .sort((a, b) => a.y - b.y)[0]?.p;
  return pick ? cardById(pick.id).catch(() => null) : null;
}

export function enqueueCard(card: Card) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  items.push({
    id,
    number: ++shotCounter,
    addedAt: Date.now(),
    status: 'pricing',
    photoUri: null,
    guess: null,
    card: null,
    method: 'set+number',
    finish: 'normal',
    condition: 'NM',
    include: true,
  });
  emit();
  void setItemCard(id, card, 'set+number');
}

export async function setItemCard(id: string, card: Card, method: MatchMethod = 'set+number') {
  const current = items.find((it) => it.id === id);
  const finish =
    current && card.finishes.includes(current.finish) ? current.finish : defaultFinish(card, current?.guess?.foil, current?.guess?.rawText);
  if (card.prices && Object.keys(card.prices).length > 0) {
    updateItem(id, { card, method, finish, status: 'done', include: true, doubtful: false });
    return;
  }
  updateItem(id, { card, method, finish, status: 'pricing', include: true, doubtful: false });
  try {
    const full = (await cardById(card.id)) ?? card;
    const f = full.finishes.includes(finish) ? finish : defaultFinish(full, current?.guess?.foil, current?.guess?.rawText);
    updateItem(id, { card: full, finish: f, status: 'done' });
  } catch (e) {
    updateItem(id, { status: 'done', error: String(e) });
  }
}

export function itemPrice(it: StackItem, _source: HeadlineSource = 'tcgplayer'): number | null {
  return it.card ? headlinePrice(quoteFor(it.card, it.finish, it.condition)) : null;
}

export type SaveTarget =
  | { kind: 'owned' } // already owned (singles, old collection)
  | { kind: 'new'; source: NewSource } // a pack / box opened now (packs_opened = packs in this Stack)
  | { kind: 'existing'; sourceId: number; packsOpened: number }; // more packs from a box being opened

export const savableItems = (list: readonly StackItem[]) =>
  list.filter((it) => it.include && it.card && it.status === 'done');

export async function sourceForTarget(target: SaveTarget): Promise<number | null> {
  if (target.kind === 'new') return createSource(target.source);
  if (target.kind === 'existing') {
    const src = await getSource(target.sourceId);
    if (!src) return null;
    await updateSource(src.id, { packs_opened: src.packs_opened + Math.max(0, target.packsOpened) });
    return src.id;
  }
  return null;
}

export async function saveStack(target: SaveTarget = { kind: 'owned' }, only?: ReadonlySet<string>): Promise<number> {
  const toSave = savableItems(items).filter((it) => !only || only.has(it.id));
  if (toSave.length === 0) return 0;
  const sourceId = await sourceForTarget(target);
  let saved = 0;
  try {
    for (const it of toSave) {
      const card = it.card!;
      const q = quoteFor(card, it.finish, it.condition);
      await insertScan({
        photo_uri: '',
        card_id: card.id,
        name: card.name,
        set_code: card.set,
        set_name: card.set_name,
        collector_number: card.collector_number,
        image_uri: cardImage(card, 'normal'),
        ...cardMeta(card),
        other_prices: serializePrices(card.prices),
        finish: it.finish,
        condition: it.condition,
        price_cents: headlinePrice(q),
        market_cents: q.marketCents,
        low_cents: q.lowCents,
        market_url: q.url,
        price_updated_at: new Date().toISOString(),
      }, sourceId);
      await writeStackItems([], [it.id]);
      persisted.delete(it.id);
      if (it.photoUri) deletePhoto(it.photoUri);
      items = items.filter((x) => x.id !== it.id);
      saved++;
    }
  } finally {
    emit();
  }
  return saved;
}
