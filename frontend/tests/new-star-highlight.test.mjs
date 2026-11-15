import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_STAR_HIGHLIGHT_MS, newStarFocus, newStarGlow } from '../src/lib/new-star-highlight.ts';

test('new stars, including ones behind the camera, are centered in front with safe viewing distance', () => {
  const center = [2, -3, 4];
  for (const position of [[2, -3, 4], [-10, 8, -12], [5, 20, 0], [2, -20, 4], [80, -60, 100]]) {
    const focus = newStarFocus(position, center);
    const [x, y, z] = position.map((value, index) => value - center[index]);
    // Three's default Euler XYZ applies the Y rotation before X for this vector.
    const rotatedX = Math.cos(focus.rotationY) * x + Math.sin(focus.rotationY) * z;
    const zAfterY = -Math.sin(focus.rotationY) * x + Math.cos(focus.rotationY) * z;
    const rotatedY = Math.cos(focus.rotationX) * y - Math.sin(focus.rotationX) * zAfterY;
    const rotatedZ = Math.sin(focus.rotationX) * y + Math.cos(focus.rotationX) * zAfterY;
    assert.ok(Math.abs(rotatedX) < 1e-8);
    assert.ok(Math.abs(rotatedY) < 1e-8);
    assert.ok(Math.abs(focus.distance - rotatedZ - 3.5) < 1e-8);
    assert.deepEqual(center, [2, -3, 4]);
  }
});

test('halo pulses slowly, fades out, and expires instead of restarting on old entries', () => {
  assert.equal(newStarGlow(0, false).opacity, 0);
  assert.ok(newStarGlow(800, false).opacity > newStarGlow(1600, false).opacity);
  assert.ok(newStarGlow(NEW_STAR_HIGHLIGHT_MS - 100, false).opacity < 0.05);
  assert.equal(newStarGlow(NEW_STAR_HIGHLIGHT_MS, false).opacity, 0);
  assert.equal(newStarGlow(NEW_STAR_HIGHLIGHT_MS + 5000, false).opacity, 0);
});

test('reduced motion keeps a steady halo without pulsing', () => {
  assert.deepEqual(newStarGlow(800, true), newStarGlow(1600, true));
  assert.equal(newStarGlow(800, true).scale, 1.04);
});
