import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetFromThumb, scrollbarMetrics } from '../src/lib/scrollbar.ts';

test('dragging either end or the middle of a horizontal scrollbar reaches the matching content', () => {
  const metrics = scrollbarMetrics({ viewport: 200, content: 1000, track: 200, offset: 400 });
  assert.equal(metrics.thumbSize, 40);
  assert.equal(metrics.thumbOffset, 80);
  assert.equal(offsetFromThumb(0, metrics), 0);
  assert.equal(offsetFromThumb(80, metrics), 400);
  assert.equal(offsetFromThumb(160, metrics), 800);
  assert.equal(offsetFromThumb(-50, metrics), 0);
  assert.equal(offsetFromThumb(1000, metrics), 800);
});

test('a vertical track can be shorter than its viewport without losing the bottom of the list', () => {
  const metrics = scrollbarMetrics({ viewport: 400, content: 1600, track: 360, offset: 1200 });
  assert.equal(metrics.thumbSize, 90);
  assert.equal(metrics.thumbOffset + metrics.thumbSize, 360);
  assert.equal(offsetFromThumb(metrics.thumbOffset, metrics), 1200);
});

test('short and empty lists show a full thumb and cannot scroll', () => {
  for (const content of [0, 100, 200]) {
    const metrics = scrollbarMetrics({ viewport: 200, content, track: 200, offset: 500 });
    assert.equal(metrics.scrollable, false);
    assert.equal(metrics.offset, 0);
    assert.equal(metrics.thumbSize, 200);
    assert.equal(offsetFromThumb(100, metrics), 0);
  }
});

test('resizing or removing items clamps the offset and keeps the thumb inside the track', () => {
  const metrics = scrollbarMetrics({ viewport: 200, content: 300, track: 200, offset: 600 });
  assert.equal(metrics.offset, 100);
  assert(Math.abs(metrics.thumbOffset + metrics.thumbSize - 200) < 0.001);
  const unmeasured = scrollbarMetrics({ viewport: 0, content: 1000, track: 0, offset: 0 });
  assert.equal(unmeasured.scrollable, false);
  assert.equal(offsetFromThumb(100, unmeasured), 0);
});
