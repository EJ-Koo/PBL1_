import test from 'node:test';
import assert from 'node:assert/strict';
import { getNativeUi } from '../src/lib/native-layout.ts';
import { advanceNativeGesture } from '../src/lib/native-universe-gesture.ts';

test('native panels fit phone safe areas, small screens and tablets', () => {
  for (const [width, height, top, bottom] of [[320,568,24,24], [393,852,40,24], [430,932,48,34], [768,1024,24,24], [393,400,24,24]]) {
    const ui = getNativeUi(width,height,top,bottom);
    assert.ok(ui.sheetWidth <= width - 24);
    assert.ok(ui.sheetHeight < height - top - bottom);
    assert.ok(ui.previewHeight < ui.sheetHeight / 2);
    assert.ok(ui.questHeight < height - top - bottom);
    assert.ok(ui.contentWidth <= width - 32);
  }
});
const point = (identifier,pageX,pageY=0) => ({identifier,pageX,pageY});
test('pinching apart zooms in and does not rotate or open a diary', () => {
  const step = advanceNativeGesture({points:[point(0,0),point(1,100)],travel:0}, [point(0,0),point(1,150)]);
  assert.equal(step.zoom,2/3); assert.equal(step.dx,0); assert.equal(step.dy,0); assert.equal(step.suppressTap,true);
});
test('small tap jitter remains a tap; cumulative drag suppresses selection', () => {
  let frame = {points:[point(0,0)],travel:0};
  let step = advanceNativeGesture(frame,[point(0,3)]);
  assert.equal(step.suppressTap,false);
  step = advanceNativeGesture(step.frame,[point(0,8)]);
  assert.equal(step.suppressTap,true);
  step = advanceNativeGesture(step.frame,[]);
  assert.equal(step.suppressTap,true);
});
test('lifting a pinch finger never jumps the camera', () => {
  const step = advanceNativeGesture({points:[point(0,0),point(1,100)],travel:0},[point(1,100)]);
  assert.equal(step.dx,0); assert.equal(step.zoom,1); assert.equal(step.suppressTap,true);
});
