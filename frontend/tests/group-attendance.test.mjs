import test from 'node:test';
import assert from 'node:assert/strict';
import { getMemberStars } from '../src/lib/group-attendance.ts';

const group = { diary_ids: ['a', 'b', 'c', 'yesterday'], members: [
  { user_id: 'me', nickname: '나' }, { user_id: 'other', nickname: '친구' },
] };
const entry = (id, authorId, hour, color = '#a39bff', day = 12) => ({
  id, authorId, color, createdAt: new Date(2026, 10, day, hour).getTime(),
});
test('uses the latest shared diary emotion, excludes private and previous-day diaries', () => {
  const entries = [entry('b', 'me', 14, '#ff5252'), entry('a', 'me', 10),
    entry('private', 'me', 17, '#000000'), entry('yesterday', 'other', 18, '#123456', 11)];
  const stars = getMemberStars(group, entries, '2026-11-12');
  assert.equal(stars[0].color, '#ff5252');
  assert.equal(stars[0].completed, true);
  assert.equal(stars[1].completed, false);
  assert.equal(stars[1].color, '#ffffff');
  assert.equal(entries[0].id, 'b');
});
test('unavailable member data stays unknown rather than being reported as unwritten', () => {
  const stars = getMemberStars(group, [entry('a', 'me', 10)], '2026-11-12');
  assert.equal(stars[1].known, false);
  assert.equal(stars[1].color, '#ffffff');
});
test('resets at the next local date and counts a member only once', () => {
  const entries = [entry('a', 'me', 10), entry('b', 'me', 14)];
  assert.equal(getMemberStars(group, entries, '2026-11-12').filter(s => s.completed).length, 1);
  assert.equal(getMemberStars(group, entries, '2026-11-13').filter(s => s.completed).length, 0);
});
test('does not cap the membership at six or invent empty members', () => {
  const members = Array.from({ length: 9 }, (_, i) => ({ user_id: String(i), nickname: null }));
  assert.equal(getMemberStars({ diary_ids: [], members }, [], '2026-11-12').length, 9);
  assert.deepEqual(getMemberStars({ diary_ids: [], members: [] }, [], '2026-11-12'), []);
});
