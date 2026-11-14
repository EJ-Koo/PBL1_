import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const storage = new Map([['settings:fontScale', '1.2'], ['settings:rotateSensitivity', '0.7']]);
globalThis.__settingsTestStorage = storage;
globalThis.__settingsReads = 0;
globalThis.__settingsWrites = 0;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@react-native-async-storage/async-storage') {
      return { url: 'data:text/javascript,export default {getItem:async k=>{globalThis.__settingsReads++;return globalThis.__settingsTestStorage.get(k)??null},setItem:async(k,v)=>{globalThis.__settingsWrites++;globalThis.__settingsTestStorage.set(k,v)}}', shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const settings = await import('../src/lib/settings.ts');

test('restores text and rotation independently, clamps and saves text steps, notifies mounted screens', async () => {
  await Promise.all([settings.loadSettings(), settings.loadSettings()]);
  assert.equal(globalThis.__settingsReads, 2, 'concurrent callers share one storage read per key');
  assert.equal(settings.getFontScale(), 1.2);
  assert.equal(settings.getRotateSensitivity(), 0.7);
  let notifications = 0;
  const unsubscribe = settings.subscribeFontScale(() => notifications++);
  assert.equal(settings.setFontScale(settings.getFontScale() + 0.1), 1.3);
  assert.equal(storage.get('settings:fontScale'), '1.3');
  assert.equal(settings.setFontScale(5), 1.4);
  assert.equal(settings.setFontScale(-1), 0.8);
  assert.equal(settings.setFontScale(NaN), 0.8);
  assert.equal(notifications, 3);
  const writes = globalThis.__settingsWrites;
  settings.setFontScale(0.8);
  settings.setRotateSensitivity(0.7);
  assert.equal(notifications, 3);
  assert.equal(globalThis.__settingsWrites, writes, 'unchanged settings do not trigger storage writes');
  assert.equal(settings.getRotateSensitivity(), 0.7);
  unsubscribe();
  settings.setFontScale(1);
  assert.equal(notifications, 3);
});
