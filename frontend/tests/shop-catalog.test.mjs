import test from 'node:test';
import assert from 'node:assert/strict';

import { visibleShopItems } from '../src/lib/shop-catalog.ts';

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
