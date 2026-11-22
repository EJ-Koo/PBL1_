import test from 'node:test';
import assert from 'node:assert/strict';

import { visibleShopItems } from '../src/lib/shop-catalog.ts';
import { cursorEffect, equippedCursor, starterItem, withEquipment } from '../src/lib/cursor-items.ts';

test('server-owned and equipped milky way cards stay hidden, including after sale ends', () => {
  const comet = { id: 'comet', effect: { type: 'comet' }, quantity: 1, equipped: false, on_sale: true };
  const milkyWay = { id: 'milky_way', effect: { type: 'milky_way' }, quantity: 1, equipped: true, on_sale: true };
  assert.deepEqual(visibleShopItems([milkyWay, comet]), [comet]);
  assert.deepEqual(visibleShopItems([{ ...milkyWay, on_sale: false }, comet]), [comet]);
});

test('the cancelled effect is hidden even if an administrator used a different item ID', () => {
  assert.deepEqual(visibleShopItems([{ id: 'galaxy-custom', effect: { type: 'milky_way' } }]), []);
  assert.deepEqual(visibleShopItems([{ id: 'milky_way', effect: null }]), []);
});

test('normal shop records and their ownership remain unchanged and input data is not mutated', () => {
  const items = Object.freeze([
    Object.freeze({ id: 'comet', effect: { type: 'comet' }, quantity: 1, equipped: true }),
    Object.freeze({ id: 'blue', effect: { type: 'background' }, quantity: 1, equipped: true }),
    Object.freeze({ id: 'ocean', effect: { type: 'planet_effect' }, quantity: 2, equipped: false }),
    Object.freeze({ id: 'unknown-item', effect: null }),
  ]);
  const result = visibleShopItems(items);
  assert.deepEqual(result, items);
  result.forEach((item, index) => assert.equal(item, items[index]));
});

test('the shared visible items also exclude the cancelled effect from active effects', () => {
  const items = [
    { id: 'milky_way', effect: { type: 'milky_way' }, quantity: 1, equipped: true },
    { id: 'comet', effect: { type: 'comet' }, quantity: 1, equipped: true },
  ];
  const active = visibleShopItems(items).filter((item) => item.equipped && item.quantity > 0).map((item) => item.effect);
  assert.deepEqual(active, [{ type: 'comet' }]);
});

test('only one owned cursor renders, and removing it leaves the cursor slot empty', () => {
  const starter = starterItem(true);
  const violet = { ...starter, id: 'violet', equipped: false, effect: { type: 'cursor', style: 'diamond', color: '#ba70ff' } };
  const music = { ...starter, id: 'music', slot: 'music' };
  assert.equal(equippedCursor([starter]).itemId, starter.id);
  assert.equal(equippedCursor([{ ...violet, quantity: 0, equipped: true }]), null);
  const items = withEquipment([starter, violet, music], violet.id, true);
  assert.deepEqual(items.map(i => i.equipped), [false, true, true]);
  assert.deepEqual(equippedCursor(items), { ...violet.effect, color: '#BA70FF', itemId: violet.id });
  assert.equal(equippedCursor(withEquipment(items, violet.id, false)), null);
  assert.equal(equippedCursor(withEquipment(items, starter.id, true)).itemId, starter.id);
  assert.equal(starter.equipped, true);
});

test('cursor records accept supported shapes and hex colors only', () => {
  assert.equal(cursorEffect({ type: 'cursor' }).color, '#FFFFFF');
  assert.equal(cursorEffect({ type: 'cursor', style: 'dots' }).style, 'dots');
  for (const effect of [null, {}, { type: 'cursor', style: 'unknown' }, { type: 'cursor', color: 'red' }]) {
    assert.equal(cursorEffect(effect), null);
  }
});

test('the astronaut uses the same ownership and single-cursor equipment rules as particle cursors', () => {
  const starter = starterItem(true);
  const astronaut = { ...starter, id: 'cursor_astronaut_blue', name: '우주비행사(blue)', equipped: false,
    effect: { type: 'cursor', style: 'astronaut_blue', color: '#48dfff' } };
  assert.deepEqual(cursorEffect(astronaut.effect), { type: 'cursor', style: 'astronaut_blue', color: '#48DFFF' });
  assert.equal(equippedCursor([{ ...astronaut, quantity: 0, equipped: true }]), null);
  const applied = withEquipment([starter, astronaut], astronaut.id, true);
  assert.equal(applied[0].equipped, false);
  assert.equal(equippedCursor(applied).itemId, astronaut.id);
  assert.equal(equippedCursor(withEquipment(applied, astronaut.id, false)), null);
  assert.equal(equippedCursor(withEquipment(applied, starter.id, true)).itemId, starter.id);
});
