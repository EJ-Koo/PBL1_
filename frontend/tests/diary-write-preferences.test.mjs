import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiaryWritePreferences, availableDiaryGroups, diaryWritePreferencesKey } from '../src/lib/diary-write-preferences.ts';
test('missing or damaged preferences start private with the other topic and opt out', () => {
  for (const raw of [null, '{', 'null', '{}']) assert.deepEqual(parseDiaryWritePreferences(raw), { enabled: false, topic: 'other', groupIds: [] });
});
test('saved choices validate topic and group IDs and stay isolated by account', () => {
  assert.notEqual(diaryWritePreferencesKey('one'), diaryWritePreferencesKey('two'));
  assert.deepEqual(parseDiaryWritePreferences(JSON.stringify({ enabled: true, topic: 'travel', groupIds: ['a','a',null,7,''] })), { enabled: true, topic: 'travel', groupIds: ['a'] });
  assert.equal(parseDiaryWritePreferences('{"enabled":"true","topic":"invalid"}').enabled, false);
  assert.equal(parseDiaryWritePreferences('{"topic":"invalid"}').topic, 'other');
});
test('previous sharing selections exclude groups the user has left without adding new groups', () => {
  assert.deepEqual(availableDiaryGroups(['old','kept','kept'], ['kept','new']), ['kept']);
  assert.deepEqual(availableDiaryGroups([], ['new']), []);
});
