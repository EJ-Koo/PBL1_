import test from 'node:test';
import assert from 'node:assert/strict';
import { getBottomNavLayout, getResponsiveLayout } from '../src/lib/responsive-layout.ts';

test('the smaller panels keep the reference proportions and stay centered at 774px', () => {
  const { items, scale, offset } = getBottomNavLayout(774);
  assert.equal(scale, 0.7 * 0.85);
  assert.deepEqual(items.map(({ id, x, width }) => [id, x, width]), [
    ['diary', 181 + offset, 95], ['home', 290 + offset, 196], ['group', 500 + offset, 95],
  ]);
});

test('touch targets cover the artwork without overlapping across viewport sizes and safe areas', () => {
  for (const [width, height, side, bottom] of [
    [280, 653, 0, 0], [320, 568, 0, 0], [393, 852, 0, 34], [600, 960, 0, 0],
    [844, 390, 47, 21], [1024, 768, 0, 20], [1280, 720, 0, 0], [1920, 1080, 0, 0],
  ]) {
    const layout = getResponsiveLayout(width, height, { left: side, right: side, top: 0, bottom });
    const { items, scale, artworkTop, hitTop, hitHeight } = layout.navLayout;
    assert.equal(layout.navLeft, side);
    assert.equal(layout.navWidth, width - 2 * side);
    assert.equal(layout.navBottom, bottom);
    assert(hitHeight >= 44 && hitTop >= 0 && hitTop + hitHeight <= layout.navHeight);
    assert(hitTop <= artworkTop + 45.5 * scale && hitTop + hitHeight >= artworkTop + 87.5 * scale);
    let previousRight = 0;
    for (const item of items) {
      const right = item.hitLeft + item.hitWidth;
      assert(item.hitWidth >= 44 && item.hitLeft >= previousRight && right <= layout.navWidth);
      assert(item.hitLeft <= item.x * scale + 0.001);
      assert(right >= (item.x + item.width) * scale - 0.001);
      previousRight = right;
    }
  }
});


test('native 20% larger artwork stays centered with non-overlapping touch targets', () => {
  for (const width of [280,320,393,430,600,844,1024]) {
    const web = getBottomNavLayout(width);
    const app = getBottomNavLayout(width,1.2);
    assert.ok(Math.abs(app.scale / web.scale - 1.2) < 1e-10);
    assert.equal(app.height,Math.max(44,120*app.scale));
    assert.ok(app.hitTop >= 0 && app.hitTop+app.hitHeight <= app.height);
    let end = 0;
    for (const item of app.items) {
      assert.ok(item.hitWidth >= 44 && item.hitLeft >= end && item.hitLeft+item.hitWidth <= width);
      assert.ok(item.hitLeft <= item.x * app.scale+0.001);
      assert.ok(item.hitLeft+item.hitWidth >= (item.x+item.width)*app.scale-0.001);
      end = item.hitLeft+item.hitWidth;
    }
    const home=app.items.find(item=>item.id==='home');
    assert.ok(Math.abs((home.x+home.width/2)*app.scale-width/2)<=app.scale+0.001);
  }
});
