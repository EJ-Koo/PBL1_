import test from 'node:test';
import assert from 'node:assert/strict';
import { getStarPopupLayout } from '../src/lib/star-popup-layout.ts';

const viewport = { width: 393, height: 852, topInset: 138, bottomInset: 100 };
const anchor = { id: 'diary', x: 196, y: 490, radius: 24, visible: true };

test('diary sits above the star with the tail tip aligned to its screen position', () => {
  const layout = getStarPopupLayout(anchor, viewport);
  assert.ok(layout.above);
  assert.equal(layout.left + layout.tailX, anchor.x);
  assert.equal(layout.top + layout.bodyHeight + layout.tailHeight, anchor.y - anchor.radius - 16);
  assert.ok(layout.top >= viewport.topInset);
});

test('stars near either horizontal edge keep the card in view and the tail on the star', () => {
  for (const x of [4, 20, 375, 390]) {
    const layout = getStarPopupLayout({ ...anchor, x }, viewport);
    assert.ok(layout.left >= 16);
    assert.ok(layout.left + layout.width <= viewport.width - 16);
    assert.equal(layout.left + layout.tailX, x);
    assert.ok(layout.tailBaseX - 26 >= 0);
    assert.ok(layout.tailBaseX + 26 <= layout.width);
  }
});

test('a star near the top opens below, without covering the header or bottom navigation', () => {
  const star = { ...anchor, y: 170 };
  const layout = getStarPopupLayout(star, viewport);
  assert.equal(layout.above, false);
  assert.equal(layout.top, star.y + star.radius + 16);
  assert.ok(layout.top >= viewport.topInset);
  assert.ok(layout.top + layout.bodyHeight + layout.tailHeight <= viewport.height - viewport.bottomInset);
});

test('desktop cards keep a readable width, and small phones keep scrollable body space', () => {
  const desktop = getStarPopupLayout({ ...anchor, x: 720 }, { ...viewport, width: 1440 });
  assert.equal(desktop.width, 440);
  const phone = getStarPopupLayout({ ...anchor, x: 160, y: 310, radius: 15 },
    { width: 320, height: 568, topInset: 100, bottomInset: 60 });
  assert.equal(phone.width, 288);
  assert.ok(phone.above);
  assert.ok(phone.bodyHeight >= 120);
  assert.ok(phone.top >= 100);
  assert.ok(phone.top + phone.bodyHeight + phone.tailHeight <= 508);
});

test('a highly enlarged star still opens a readable diary', () => {
  const layout = getStarPopupLayout({ ...anchor, y: 426, radius: 400 }, viewport);
  assert.ok(layout);
  assert.ok(layout.bodyHeight >= 164);
  assert.ok(layout.top >= viewport.topInset);
});

test('stars behind screen chrome keep the diary body clear of the header and navigation', () => {
  for (const y of [10, 840]) {
    const layout = getStarPopupLayout({ ...anchor, y }, viewport);
    const bodyTop = layout.top + (layout.above ? 0 : layout.tailHeight);
    assert.ok(bodyTop >= viewport.topInset);
    assert.ok(bodyTop + layout.bodyHeight <= viewport.height - viewport.bottomInset);
  }
});

test('group diaries use a compact card with space for the overlapping profile', () => {
  const layout = getStarPopupLayout(anchor, viewport, 'group');
  assert.ok(layout.width < 260);
  assert.ok(layout.bodyHeight >= 120 && layout.bodyHeight <= 150);
  assert.equal(layout.tailHeight, 20);
  assert.equal(layout.left + layout.tailX, anchor.x);
  assert.ok(layout.left - 32 >= 16);
});

test('group cards keep the profile and body visible at either edge and above expanded chat', () => {
  for (const width of [320, 393, 1440]) {
    const screen = { width, height: 852, topInset: 138, bottomInset: 340 };
    for (const x of [4, width / 2, width - 4]) {
      for (const y of [150, 350, 780]) {
        const layout = getStarPopupLayout({ ...anchor, x, y }, screen, 'group');
        assert.ok(layout);
        const bodyTop = layout.top + (layout.above ? 0 : layout.tailHeight);
        assert.ok(layout.left - 32 >= 16);
        assert.ok(layout.left + layout.width <= width - 16);
        assert.ok(bodyTop >= screen.topInset);
        assert.ok(bodyTop + layout.bodyHeight <= screen.height - screen.bottomInset);
        assert.equal(layout.left + layout.tailX, x);
      }
    }
  }
});
