import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVE_QUARTERS, groupArchive } from '../src/lib/diary-archive.ts';
test('archive groups all quarter boundaries in local time, newest first without mutation', () => {
  const dates = [[2025, 2, 31], [2025, 3, 1], [2025, 5, 30], [2025, 6, 1], [2025, 8, 30], [2025, 9, 1], [2025, 11, 31], [2026, 0, 1]];
  const entries = Object.freeze(dates.map(([y, m, d], i) => Object.freeze({ id: String(i), createdAt: new Date(y, m, d, 23, 59).getTime() })));
  const groups = groupArchive(entries, new Date(2026, 0, 1).getTime()).filter(g => g.entries.length);
  assert.deepEqual(groups.map(g => g.id), ['2026-Q1', '2025-Q4', '2025-Q3', '2025-Q2', '2025-Q1']);
  assert.deepEqual(groups.map(g => g.entries.map(e => e.id)), [['7'], ['6', '5'], ['4', '3'], ['2', '1'], ['0']]);
  assert.equal(entries[0].id, '0');
  assert.deepEqual(ARCHIVE_QUARTERS.map(q => q.range), ['01.01 – 03.31', '04.01 – 06.30', '07.01 – 09.30', '10.01 – 12.31']);
});
test('archive shows four current-year cards even without valid records', () => {
  const now = new Date(2026, 4, 1).getTime();
  const groups = groupArchive([], now);
  assert.deepEqual(groups.map(g => g.id), ['2026-Q4', '2026-Q3', '2026-Q2', '2026-Q1']);
  assert.deepEqual(groups.map(g => g.locked), [true, true, false, false]);
  assert.deepEqual(groupArchive([{ id: 'invalid', createdAt: NaN }], now), groups);
});
test('each future quarter unlocks exactly at its first local midnight, including new year', () => {
  for (const [year, month] of [[2026, 3], [2026, 6], [2026, 9], [2027, 0]]) {
    const unlock = new Date(year, month, 1).getTime();
    const id = `${year}-Q${month / 3 + 1}`;
    const records = [{ id: 'future', createdAt: unlock + 60000 }];
    const before = groupArchive(records, unlock - 1).find(g => g.id === id);
    assert.equal(before.locked, true);
    assert.equal(before.entries.length, 0);
    const after = groupArchive(records, unlock).find(g => g.id === id);
    assert.equal(after.locked, false);
    assert.equal(after.entries.length, 1);
  }
});
test('past quarters stay open and November opens all four quarters of the current year', () => {
  const groups = groupArchive([{ id: 'past', createdAt: new Date(2025, 0, 1).getTime() }], new Date(2026, 10, 16).getTime());
  assert.ok(groups.every(g => !g.locked));
});
test('selected year shows exactly its four quarters and excludes other years', () => {
  const now = new Date(2026, 4, 1).getTime();
  const entries = [{ id: 'old', createdAt: new Date(2024, 1, 1).getTime() }, { id: 'new', createdAt: now }];
  const past = groupArchive(entries, now, 2024);
  assert.deepEqual(past.map(g => g.id), ['2024-Q4', '2024-Q3', '2024-Q2', '2024-Q1']);
  assert.deepEqual(past.flatMap(g => g.entries.map(e => e.id)), ['old']);
  assert.ok(past.every(g => !g.locked));
  const emptyYear = groupArchive(entries, now, 2023);
  assert.equal(emptyYear.length, 4);
  assert.ok(emptyYear.every(g => g.entries.length === 0 && !g.locked));
  const current = groupArchive(entries, now, 2026);
  assert.deepEqual(current.map(g => g.locked), [true, true, false, false]);
});
