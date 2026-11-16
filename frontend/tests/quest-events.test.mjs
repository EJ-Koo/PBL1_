import test from 'node:test';
import assert from 'node:assert/strict';
import { latestQuest, publishQuest, subscribeQuest } from '../src/lib/quest-events.ts';

const state = (changes = {}) => ({ quest_id: 'daily_diary', day: '2026-11-15', cycle: 0, completed: false,
  progress: 0, target: 1, reward: 5, awarded: 0, coins: 999, reset_allowed: true,
  after_reset: false, next_reset_at: '2026-11-15T15:00:00Z', ...changes });

test('a late award response cannot undo a development reset', () => {
  const reset = state({ cycle: 1, after_reset: true });
  assert.equal(latestQuest(reset, state({ completed: true, progress: 1, awarded: 5 })), reset);
});
test('completion cannot become incomplete without a newer cycle or day', () => {
  const complete = state({ completed: true, progress: 1 });
  assert.equal(latestQuest(complete, state()), complete);
  const reset = state({ cycle: 1, after_reset: true });
  assert.equal(latestQuest(complete, reset), reset);
  const tomorrow = state({ day: '2026-11-16' });
  assert.equal(latestQuest(reset, tomorrow), tomorrow);
  assert.equal(latestQuest(tomorrow, complete), tomorrow);
});
test('new settings can disable the reset button without losing completion', () => {
  const complete = state({ completed: true, progress: 1 });
  const disabled = { ...complete, reset_allowed: false };
  assert.equal(latestQuest(complete, disabled), disabled);
});
test('reward events preserve account identity and subscriptions detach', () => {
  const seen = [];
  const unsubscribe = subscribeQuest(event => seen.push(event));
  const event = { userId: 'test-user', revision: 3, quest: state({ completed: true, awarded: 5 }) };
  publishQuest(event); unsubscribe(); publishQuest(event);
  assert.deepEqual(seen, [event]);
});
