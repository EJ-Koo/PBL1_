import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearch, rememberSearch, parseSearchHistory, recentSearchLabel } from '../src/lib/search-history.ts';

test('keyword then date and date then keyword retain one identical AND query', () => {
  const keywordFirst = rememberSearch(rememberSearch([], { keyword: '시험', dateKey: null }),
    { keyword: '시험', dateKey: '2026-11-12' });
  const dateFirst = rememberSearch(rememberSearch([], { keyword: '', dateKey: '2026-11-12' }),
    { keyword: '시험', dateKey: '2026-11-12' });
  assert.deepEqual(keywordFirst[0], dateFirst[0]);
  assert.equal(recentSearchLabel(keywordFirst[0]), '시험 & 2026.11.12');
  const repeat = rememberSearch(keywordFirst, { keyword: '  시험  ', dateKey: '2026-11-12' });
  assert.equal(repeat.filter(query => query.dateKey === '2026-11-12' && query.keyword === '시험').length, 1);
});
test('JSON roundtrip restores both filters, including date-only and keyword-only records', () => {
  let history = [];
  for (const query of [{ keyword: '시험', dateKey: null }, { keyword: '', dateKey: '2026-11-12' },
    { keyword: '시험', dateKey: '2026-11-12' }]) history = rememberSearch(history, query);
  const restored = parseSearchHistory(JSON.parse(JSON.stringify(history)));
  assert.deepEqual(restored, history);
  assert.deepEqual({ keyword: restored[0].keyword, dateKey: restored[0].dateKey }, { keyword: '시험', dateKey: '2026-11-12' });
  assert.equal(restored[2].dateKey, null);
  assert.equal(restored[1].keyword, '');
});
test('same keyword on different dates is not collapsed into one record', () => {
  const history = rememberSearch(rememberSearch([], { keyword: '시험', dateKey: '2026-11-11' }),
    { keyword: '시험', dateKey: '2026-11-12' });
  assert.equal(history.length, 2);
  assert.notEqual(history[0].id, history[1].id);
});
test('old string history migrates, duplicates normalize, invalid data is ignored', () => {
  const history = parseSearchHistory(['old', ' old ', null, 123, { keyword: 'day', dateKey: '2026-02-30' },
    { keyword: '', dateKey: '2026-11-12' }, { keyword: '', dateKey: null }]);
  assert.equal(history.length, 2);
  assert.equal(history[0].keyword, 'old');
  assert.equal(history[0].dateKey, null);
  assert.equal(recentSearchLabel(history[1]), '2026.11.12');
  assert.deepEqual(parseSearchHistory({ bad: true }), []);
});
test('history stays limited to ten and empty search/reset creates no record', () => {
  let history = [];
  for (let index = 0; index < 12; index++) history = rememberSearch(history, { keyword: `word-${index}`, dateKey: null });
  assert.equal(history.length, 10);
  assert.equal(history[0].keyword, 'word-11');
  assert.equal(history[9].keyword, 'word-2');
  assert.equal(rememberSearch(history, { keyword: '  ', dateKey: null }), history);
  assert.equal(normalizeSearch({ keyword: '', dateKey: null }), null);
});
