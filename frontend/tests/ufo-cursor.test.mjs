import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/ufo-cursor.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup() {
  const frames = new Map();
  let time = 0;
  let frameId = 0;
  class Target {
    events = new Map();
    addEventListener(name, handler, { signal } = {}) {
      const handlers = this.events.get(name) ?? new Set();
      handlers.add(handler);
      this.events.set(name, handlers);
      signal?.addEventListener('abort', () => handlers.delete(handler), { once: true });
    }
    dispatch(name, event = {}) {
      for (const handler of this.events.get(name) ?? []) handler(event);
    }
  }
  class Element {
    style = {};
    dataset = {};
    children = [];
    setAttribute() {}
    appendChild(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
  }
  const document = Object.assign(new Target(), {
    body: new Element(), hidden: false, createElement: () => new Element(),
  });
  const window = Object.assign(new Target(), {
    innerWidth: 800, innerHeight: 600,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const exports = {};
  vm.runInNewContext(code, { exports, document, window, AbortController, performance: { now: () => time } });
  const cleanup = exports.startUfoCursor(Object.fromEntries(['idle', 'swim', 'beam'].map(pose => [pose, {
    uri: `${pose}.png`, width: 1200, height: 1200, left: 0, top: 0,
  }])));
  const layer = document.body.children[0];
  const tick = now => {
    time = now;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(time));
  };
  const pointer = (name, x, y, extra = {}) => window.dispatch(name, {
    pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...extra,
  });
  return { window, document, layer, frames, tick, pointer, cleanup };
}

test('uses the three supplied poses; only horizontal movement starts swimming', () => {
  const { layer, pointer, tick, frames, cleanup } = setup();
  assert.equal(layer.children.length, 3);
  pointer('pointermove', 100, 100);
  tick(0);
  assert.equal(layer.dataset.pose, 'idle');
  assert.equal(frames.size, 0);
  pointer('pointermove', 130, 100);
  tick(10);
  assert.equal(layer.dataset.pose, 'swim');
  assert.equal(layer.dataset.direction, 'right');
  pointer('pointermove', 130, 160);
  tick(200);
  assert.equal(layer.dataset.pose, 'idle');
  assert.equal(frames.size, 0);
  cleanup();
});

test('mirrors swimming for left movement and batches pointer updates into one frame', () => {
  const { layer, pointer, tick, frames, cleanup } = setup();
  pointer('pointermove', 100, 100);
  tick(0);
  pointer('pointermove', 90, 100);
  pointer('pointermove', 80, 100);
  assert.equal(frames.size, 1);
  tick(16);
  assert.equal(layer.dataset.direction, 'left');
  assert.match(layer.style.transform, /scaleX\(-1\)/);
  pointer('pointermove', 140, 100);
  tick(32);
  assert.equal(layer.dataset.direction, 'right');
  assert.doesNotMatch(layer.style.transform, /scaleX/);
  cleanup();
});

test('click beam takes priority over swimming, stays visible after a quick click, and returns to idle', () => {
  const { layer, pointer, tick, cleanup } = setup();
  pointer('pointerdown', 100, 100);
  tick(0);
  assert.equal(layer.dataset.pose, 'beam');
  pointer('pointermove', 150, 100);
  pointer('pointerup', 150, 100);
  tick(100);
  assert.equal(layer.dataset.pose, 'beam');
  assert.equal(layer.children.find(image => image.dataset.ufoPose === 'beam').style.visibility, 'visible');
  tick(450);
  assert.equal(layer.dataset.pose, 'idle');
  cleanup();
});

test('holding a click retains the beam without a continuous animation loop', () => {
  const { layer, pointer, tick, frames, cleanup } = setup();
  pointer('pointerdown', 100, 100);
  tick(0);
  assert.equal(frames.size, 0);
  tick(1000);
  assert.equal(layer.dataset.pose, 'beam');
  pointer('pointerup', 100, 100);
  tick(1016);
  assert.equal(layer.dataset.pose, 'idle');
  cleanup();
});

test('clamps the full beam canvas to viewport edges and never captures interaction', () => {
  const { layer, pointer, tick, cleanup } = setup();
  pointer('pointermove', 799, 599);
  tick(0);
  assert.equal(layer.style.transform, 'translate3d(736px,536px,0)');
  assert.equal(layer.style.pointerEvents, 'none');
  assert(layer.children.every(image => image.style.pointerEvents === 'none'));
  cleanup();
});

test('hides for touch, pointer exit, lost focus, and hidden tabs; cleanup removes listeners and frames', () => {
  const { layer, pointer, tick, window, document, frames, cleanup } = setup();
  const show = () => { pointer('pointermove', 100, 100); tick(0); assert.equal(layer.style.display, 'block'); };
  show();
  pointer('pointermove', 100, 100, { pointerType: 'touch' });
  assert.equal(layer.style.display, 'none');
  show();
  window.dispatch('pointerout', { relatedTarget: {} });
  assert.equal(layer.style.display, 'block');
  window.dispatch('pointerout', { relatedTarget: null });
  assert.equal(layer.style.display, 'none');
  show();
  window.dispatch('blur');
  assert.equal(layer.style.display, 'none');
  show();
  document.hidden = true;
  document.dispatch('visibilitychange');
  assert.equal(layer.style.display, 'none');
  pointer('pointermove', 120, 100);
  cleanup();
  assert.equal(document.body.children.length, 0);
  assert.equal(frames.size, 0);
  assert([...window.events.values(), ...document.events.values()].every(handlers => handlers.size === 0));
});
