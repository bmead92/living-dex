import { describe, expect, it } from 'vitest';
import { check, initialAutoState, isCompleteRead, lockCollectorId, mergeReads, observe, type AutoState, type Box } from '../src/lib/autoScan';
import type { CardGuess } from '../src/lib/ocr';

type Ev = [ms: number, key: string | null, id: string | null, box?: Box];
const B: Box = { x: 50, y: 40, h: 30 };

function run(events: Ev[], until: number, mergedIdAtCapture: string | null = null): number[] {
  let s: AutoState = initialAutoState();
  const caps: number[] = [];
  let ei = 0;
  for (let t = 0; t <= until; t += 50) {
    while (ei < events.length && events[ei][0] <= t) {
      const [et, k, id, box] = events[ei++];
      s = observe(s, k, et, k ? (box ?? B) : null, id);
    }
    const r = check(s, t);
    s = r.state;
    if (r.capture) {
      caps.push(t);
      s = lockCollectorId(s, mergedIdAtCapture);
    }
  }
  return caps;
}

describe('nameless cards', () => {
  it('a Base Set Energy with only its number readable still gets a key', async () => {
    const { cardKey } = await import('../src/lib/autoScan');
    expect(cardKey({ name: null, setCode: null, total: 102, collectorNumber: '102', foil: false, rawText: 'ENERGY 102/102' })).toBe('#/102#102');
    expect(cardKey({ name: null, setCode: null, total: null, collectorNumber: null, foil: false, rawText: 'ENERGY' })).toBeNull();
  });
});

describe('auto capture trigger', () => {
  it('captures after two steady agreeing reads', () => {
    expect(run([[0, 'charizard', 'BS#4'], [250, 'charizard', 'BS#4']], 2000)).toEqual([400]);
  });

  it('a single unchanged read captures after STEADY_MS', () => {
    expect(run([[0, 'charizard', 'BS#4']], 2000)).toEqual([600]);
  });

  it('no card number read yet: waits longer for one', () => {
    expect(run([[0, 'charizard', null], [250, 'charizard', null]], 2000)).toEqual([1500]);
    expect(run([[0, 'charizard', null], [250, 'charizard', null], [700, 'charizard', '/102#4'], [800, 'charizard', '/102#4']], 2000)).toEqual([700]);
  });

  it('does not capture a card that is still sliding', () => {
    const moving: Ev[] = [0, 150, 300, 450, 600, 750].map((t, i) => [t, 'solring', null, { x: 50, y: 40 + i * 40, h: 30 }]);
    expect(run(moving, 800)).toEqual([]);
  });

  it("collector line peeking out under the next card doesn't re-capture", () => {
    const ev: Ev[] = [
      [0, 'sidequestplayblitzball', 'FIN#158'],
      [250, 'sidequestplayblitzball', 'FIN#158'],
      [1500, 'ght', 'FIN#158'],
      [1750, 'ght', 'FIN#158'],
      [3000, 'yourgra', 'FIN#158'],
    ];
    expect(run(ev, 5000)).toEqual([400]);
  });

  it('takes the lock id from the merged read', () => {
    const ev: Ev[] = [[0, 'sidequestplayblitzball', 'FIN#158'], [250, 'sidequestplayblitzball', null], [1500, 'ght', 'FIN#158'], [1750, 'ght', 'FIN#158']];
    expect(run(ev, 3000, 'FIN#158')).toEqual([400]);
  });

  it('a new card captures straight away; the same card again once it has left', () => {
    expect(run([[0, 'sidequestplayblitzball', 'FIN#158'], [250, 'sidequestplayblitzball', 'FIN#158'], [1500, 'aerithlastancient', 'FIC#76'], [1750, 'aerithlastancient', 'FIC#76']], 3000)).toEqual([400, 1900]);
    expect(run([[0, 'solring', 'CMR#472'], [250, 'solring', 'CMR#472'], [1000, null, null], [2000, 'solring', 'CMR#472'], [2250, 'solring', 'CMR#472']], 4000)).toEqual([400, 2400]);
  });
});

const read = (p: Partial<CardGuess>): CardGuess => ({ name: null, setCode: null, collectorNumber: null, foil: false, rawText: '', ...p });

describe('merging frame reads', () => {
  it('votes per field and needs two agreeing collector lines to skip the photo', () => {
    const m = mergeReads([
      read({ name: 'Sol Ring' }),
      read({ name: 'Sol Ring', setCode: 'CMR', collectorNumber: '472' }),
      read({ name: 'So1 Ring', setCode: 'CMR', collectorNumber: '472' }),
    ]);
    expect(m).toMatchObject({ name: 'Sol Ring', setCode: 'CMR', collectorNumber: '472', numberVotes: 2 });
    expect(isCompleteRead(m)).toBe(true);
    expect(isCompleteRead(mergeReads([read({ name: 'Sol Ring', setCode: 'CMR', collectorNumber: '472' })]))).toBe(false);
  });
});
