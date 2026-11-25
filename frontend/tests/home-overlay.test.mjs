import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceHomeOverlay } from '../src/lib/home-overlay.ts';

test('opening menu, quest or shop dismisses a selected diary', () => {
  for (const panel of ['menu','quest','shop']) {
    assert.deepEqual(reduceHomeOverlay({kind:'diary',id:'one'}, {type:'open',panel}), {kind:panel});
  }
});
test('every pair of panels replaces the previous panel; diary selection also replaces panels', () => {
  for (const previous of ['menu','quest','shop']) {
    for (const panel of ['menu','quest','shop']) assert.deepEqual(reduceHomeOverlay({kind:previous},{type:'open',panel}), {kind:panel});
    assert.deepEqual(reduceHomeOverlay({kind:previous},{type:'select-diary',id:'two'}),{kind:'diary',id:'two'});
  }
});
test('menu toggles, and late close callbacks do not dismiss a newer panel', () => {
  assert.equal(reduceHomeOverlay({kind:'menu'},{type:'toggle-menu'}),null);
  assert.deepEqual(reduceHomeOverlay({kind:'diary',id:'one'},{type:'toggle-menu'}),{kind:'menu'});
  assert.deepEqual(reduceHomeOverlay({kind:'quest'},{type:'close',panel:'menu'}),{kind:'quest'});
  assert.deepEqual(reduceHomeOverlay({kind:'menu'},{type:'select-diary',id:null}),{kind:'menu'});
  assert.equal(reduceHomeOverlay({kind:'diary',id:'one'},{type:'reset'}),null);
});
