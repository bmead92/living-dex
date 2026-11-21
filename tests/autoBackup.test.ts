import './sim/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupsToPrune } from '../src/lib/backup';
import { resetDatabases } from './stubs/expo-sqlite';
import { launchApp } from './sim/harness';

beforeEach(() => resetDatabases());

describe('auto backup', () => {
  it('keeps the newest daily files and ignores anything else', () => {
    const files = ['2026-11-12', '2026-11-19', '2026-11-15', '2026-11-18', '2026-11-13', '2026-11-17', '2026-11-16', '2026-11-14']
      .map((d, i) => ({ id: String(i), name: `living-dex-backup-${d}.json` }))
      .concat([{ id: 'x', name: 'living-dex-backup-2026-11-01 (1).json' }, { id: 'y', name: 'notes.txt' }]);
    expect(backupsToPrune(files, 7).map((f) => f.name)).toEqual([
      'living-dex-backup-2026-11-12.json',
      'living-dex-backup-2026-11-01 (1).json',
    ]);
    expect(backupsToPrune(files.slice(0, 3), 7)).toEqual([]);
  });

  it('collection changes are announced', async () => {
    const app = await launchApp();
    let n = 0;
    app.db.onCollectionChange(() => n++);
    const src = await app.db.createSource({ kind: 'pack', name: 'p', cost_cents: 100, packs: 1 });
    await app.db.updateSource(src, { name: 'q' });
    await app.db.deleteSource(src);
    expect(n).toBe(3);
    await app.db.recordSnapshot('2026-11-19', 1, null, 1);
    expect(n).toBe(3);
  });
});

describe('after the rename', () => {
  it('old Holo Collector daily files are pruned with the new ones', () => {
    const files = ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'].map((d) => ({
      name: `holo-collector-backup-${d}.json`,
    }));
    files.push({ name: 'living-dex-backup-2026-11-20.json' }, { name: 'living-dex-backup-2026-11-21.json' });
    expect(backupsToPrune(files, 7).map((f) => f.name)).toEqual(['holo-collector-backup-2026-11-14.json']);
  });

  it('old Holo Collector backups still restore', async () => {
    const { parseBackup } = await import('../src/lib/backup');
    expect(() => parseBackup(JSON.stringify({ format: 'holo-collector-backup', version: 2, cards: [] }))).not.toThrow();
  });
});
