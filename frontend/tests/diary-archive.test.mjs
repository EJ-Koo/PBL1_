import test from 'node:test';
import assert from 'node:assert/strict';
import { groupArchive } from '../src/lib/diary-archive.ts';
test('archive groups local half-year boundaries and orders newest first without mutating input', () => {
  const entries = Object.freeze([
    Object.freeze({ id: 'june', createdAt: new Date(2025, 5, 30, 23, 59).getTime() }),
    Object.freeze({ id: 'july', createdAt: new Date(2025, 6, 1).getTime() }),
    Object.freeze({ id: 'jan', createdAt: new Date(2026, 0, 1).getTime() }),
    Object.freeze({ id: 'dec', createdAt: new Date(2025, 11, 31).getTime() }),
  ]);
  const groups = groupArchive(entries);
  assert.deepEqual(groups.map(g => g.id), ['2026-1', '2025-2', '2025-1']);
  assert.deepEqual(groups[1].entries.map(e => e.id), ['dec', 'july']);
  assert.equal(entries[0].id, 'june');
});
test('archive handles empty and invalid dates without fabricated periods', () => {
  assert.deepEqual(groupArchive([]), []);
  assert.deepEqual(groupArchive([{ id: 'invalid', createdAt: NaN }]), []);
});
