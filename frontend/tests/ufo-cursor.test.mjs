import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/ufo-cursor.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const layerCode = ts.transpileModule(readFileSync(new URL('../public/cursor-layer.js', import.meta.url), 'utf8'), {
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
  class Element extends Target {
    style = {};
    dataset = {};
    children = [];
    parentElement = null;
    complete = true;
    naturalWidth = 1200;
    get parentNode() { return this.parentElement; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    setAttribute() {}
    appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    closest() {
      for (let node = this; node; node = node.parentElement) if (node instanceof Dialog && node.open) return node;
      return null;
    }
  }
  class Dialog extends Element { open = false; }
  const observers = [];
  class MutationObserver {
    active = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const document = Object.assign(new Target(), {
    body: new Element(), hidden: false, createElement: () => new Element(),
  });
  document.activeElement = document.body;
  const descendants = (root = document.body) => root.children.flatMap(child => [child, ...descendants(child)]);
  document.querySelector = () => descendants().find(node => node instanceof Dialog && node.open) ?? null;
  const window = Object.assign(new Target(), {
    innerWidth: 800, innerHeight: 600,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const exports = {};
  const globals = { document, window, AbortController, MutationObserver, HTMLDialogElement: Dialog, performance: { now: () => time } };
  const layerExports = {};
  vm.runInNewContext(layerCode, { ...globals, exports: layerExports });
  vm.runInNewContext(code, { ...globals, exports, require: name => {
    assert.equal(name, '../../public/cursor-layer.js');
    return layerExports;
  } });
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
  return { window, document, layer, frames, tick, pointer, cleanup, Dialog, observers };
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
  pointer('pointerout', -1, 100, { relatedTarget: null });
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

test('stays visible above a native dialog and returns to the page when the dialog closes or is removed', () => {
  const { document, layer, pointer, tick, cleanup, Dialog, observers } = setup();
  pointer('pointermove', 200, 200);
  tick(0);
  const dialog = new Dialog();
  document.body.appendChild(dialog);
  dialog.open = true;
  document.activeElement = dialog;
  document.dispatch('focusin');
  assert.equal(layer.parentElement, dialog, 'UFO must be in the modal top layer');
  assert.equal(layer.style.display, 'block');
  dialog.open = false;
  document.activeElement = document.body;
  document.dispatch('close', { target: dialog });
  assert.equal(layer.parentElement, document.body);
  dialog.open = true;
  document.activeElement = dialog;
  document.dispatch('focusin');
  dialog.remove();
  document.activeElement = document.body;
  for (const observer of observers) if (observer.active) observer.callback();
  assert.equal(layer.parentElement, document.body, 'Removing a dialog must not orphan the UFO');
  cleanup();
  assert(observers.every(observer => !observer.active));
});

test('internal null-relatedTarget transitions and pointer cancellation do not erase a stationary UFO', () => {
  const { layer, pointer, tick, cleanup } = setup();
  pointer('pointermove', 200, 200);
  tick(0);
  pointer('pointerout', 200, 200, { relatedTarget: null });
  assert.equal(layer.style.display, 'block', 'Changing an element under the pointer is not a viewport exit');
  pointer('pointerdown', 200, 200);
  tick(16);
  pointer('pointercancel', 200, 200);
  tick(32);
  assert.equal(layer.style.display, 'block');
  assert.equal(layer.dataset.pose, 'idle');
  pointer('pointerout', 801, 200, { relatedTarget: null });
  assert.equal(layer.style.display, 'none', 'An actual viewport exit still hides the UFO');
  cleanup();
});

test('focus and visibility restore a known pointer without requiring extra movement', () => {
  const { window, document, layer, pointer, tick, cleanup } = setup();
  pointer('pointermove', 200, 200);
  tick(0);
  window.dispatch('blur');
  assert.equal(layer.style.display, 'none');
  window.dispatch('focus');
  tick(16);
  assert.equal(layer.style.display, 'block');
  document.hidden = true;
  document.dispatch('visibilitychange');
  assert.equal(layer.style.display, 'none');
  document.hidden = false;
  document.dispatch('visibilitychange');
  tick(32);
  assert.equal(layer.style.display, 'block');
  pointer('pointerout', -1, 200, { relatedTarget: null });
  window.dispatch('focus');
  tick(48);
  assert.equal(layer.style.display, 'none', 'Never restore a pointer known to have left the page');
  cleanup();
});

test('a slow or broken state image keeps the loaded UFO visible until its replacement is ready', () => {
  const { layer, pointer, tick, cleanup } = setup();
  const image = pose => layer.children.find(node => node.dataset.ufoPose === pose);
  image('swim').complete = false;
  image('swim').naturalWidth = 0;
  image('beam').complete = false;
  image('beam').naturalWidth = 0;
  pointer('pointermove', 200, 200);
  tick(0);
  pointer('pointermove', 220, 200);
  tick(16);
  assert.equal(image('idle').style.visibility, 'visible', 'Swimming must not hide the only loaded image');
  pointer('pointerdown', 220, 200);
  tick(32);
  assert.equal(image('idle').style.visibility, 'visible');
  image('beam').complete = true;
  image('beam').naturalWidth = 1200;
  image('beam').dispatch('load');
  tick(48);
  assert.equal(image('beam').style.visibility, 'visible', 'A loaded held-click beam appears without another pointer event');
  pointer('pointerup', 220, 200);
  tick(500);
  image('swim').complete = true; // Failed images may be complete but have no natural width.
  pointer('pointermove', 240, 200);
  tick(516);
  assert.equal(image('idle').style.visibility, 'visible');
  cleanup();
});

test('reattaches a removed layer on the next pointer event and cleans up all observers', () => {
  const { document, layer, pointer, tick, cleanup, observers } = setup();
  layer.remove();
  pointer('pointermove', 200, 200);
  tick(0);
  assert.equal(layer.parentElement, document.body);
  assert.equal(layer.style.display, 'block');
  cleanup();
  assert.equal(document.body.children.length, 0);
  assert(observers.every(observer => !observer.active));
  assert(layer.children.every(image => [...image.events.values()].every(handlers => handlers.size === 0)));
});
