import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_QUARTERS, groupArchive } from '../src/lib/diary-archive.ts';
test('archive groups all quarter boundaries in local time, newest first without mutation', () => {
  const dates = [[2025, 2, 31], [2025, 3, 1], [2025, 5, 30], [2025, 6, 1], [2025, 8, 30], [2025, 9, 1], [2025, 11, 31], [2026, 0, 1]];
  const entries = Object.freeze(dates.map(([y, m, d], i) => Object.freeze({ id: String(i), createdAt: new Date(y, m, d, 23, 59).getTime() })));
  const groups = groupArchive(entries);
  assert.deepEqual(groups.map(g => g.id), ['2026-Q1', '2025-Q4', '2025-Q3', '2025-Q2', '2025-Q1']);
  assert.deepEqual(groups.map(g => g.entries.map(e => e.id)), [['7'], ['6', '5'], ['4', '3'], ['2', '1'], ['0']]);
  assert.equal(entries[0].id, '0');
  assert.deepEqual(ARCHIVE_QUARTERS.map(q => q.range), ['01.01 – 03.31', '04.01 – 06.30', '07.01 – 09.30', '10.01 – 12.31']);
});
test('archive handles empty and invalid dates without fabricated periods', () => {
  assert.deepEqual(groupArchive([]), []);
  assert.deepEqual(groupArchive([{ id: 'invalid', createdAt: NaN }]), []);
});
