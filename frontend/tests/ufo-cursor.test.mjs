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

function setup({ reducedMotion = false } = {}) {
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
  const media = Object.assign(new Target(), { matches: reducedMotion });
  const window = Object.assign(new Target(), {
    innerWidth: 800, innerHeight: 600,
    matchMedia: () => media,
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
  const images = descendants(layer).filter(node => 'ufoPose' in node.dataset);
  const advance = (ms, step = 16) => {
    const end = time + ms;
    while (time < end) tick(Math.min(time + step, end));
  };
  const position = () => layer.style.transform.match(/translate3d\(([-.\d]+)px,([-.\d]+)px,0\)/).slice(1).map(Number);
  return { window, document, layer, frames, tick, pointer, cleanup, Dialog, observers, images,
    image: pose => images.find(node => node.dataset.ufoPose === pose), advance, position, media,
    get sprite() { return layer.children.find(node => 'ufoSprite' in node.dataset); },
  };
}

test('uses the three supplied poses; only horizontal movement starts swimming', () => {
  const { layer, images, pointer, tick, advance, frames, cleanup } = setup();
  assert.equal(images.length, 3);
  pointer('pointermove', 100, 100);
  tick(0);
  assert.equal(layer.dataset.pose, 'idle');
  assert.equal(frames.size, 0);
  pointer('pointermove', 130, 100);
  tick(10);
  assert.equal(layer.dataset.pose, 'swim');
  assert.equal(layer.dataset.direction, 'right');
  advance(700);
  assert.equal(layer.dataset.pose, 'idle');
  assert.equal(frames.size, 0);
  pointer('pointermove', 130, 160);
  advance(16);
  assert.equal(layer.dataset.pose, 'idle', 'Vertical following alone does not start swimming');
  advance(700);
  assert.equal(frames.size, 0);
  cleanup();
});

test('keeps the left-facing swimming art for left movement and mirrors it for right movement', () => {
  const { layer, image, pointer, tick, frames, cleanup } = setup();
  pointer('pointermove', 100, 100);
  tick(0);
  pointer('pointermove', 120, 100);
  tick(16);
  assert.equal(layer.dataset.direction, 'right');
  assert.equal(image('swim').style.transform, 'scaleX(-1)', 'The first rightward movement must already use the mirrored art');
  pointer('pointermove', 90, 100);
  pointer('pointermove', 80, 100);
  assert.equal(frames.size, 1);
  tick(32);
  assert.equal(layer.dataset.direction, 'left');
  assert.equal(image('swim').style.transform, 'none');
  assert.doesNotMatch(layer.style.transform, /scaleX/, 'Facing changes do not alter the follow transform');
  pointer('pointermove', 140, 100);
  tick(48);
  assert.equal(layer.dataset.direction, 'right');
  assert.equal(image('swim').style.transform, 'scaleX(-1)');
  cleanup();
});

test('click beam takes priority over swimming, stays visible after a quick click, and returns to idle', () => {
  const { layer, image, pointer, tick, advance, cleanup } = setup();
  pointer('pointerdown', 100, 100);
  tick(0);
  assert.equal(layer.dataset.pose, 'beam');
  pointer('pointermove', 150, 100);
  pointer('pointerup', 150, 100);
  tick(100);
  assert.equal(layer.dataset.pose, 'beam');
  assert.equal(image('beam').style.opacity, '1');
  advance(600);
  assert.equal(layer.dataset.pose, 'idle');
  cleanup();
});

for (const firstFrame of [false, true]) {
  test(`normal pointer capture release preserves a click beam ${firstFrame ? 'after' : 'before'} its first frame`, () => {
    const env = setup();
    env.pointer('pointerdown', 200, 200, { buttons: 1 });
    if (firstFrame) env.tick(16);
    env.pointer('pointerup', 200, 200, { buttons: 0 });
    env.pointer('lostpointercapture', 200, 200, { buttons: 0 });
    env.advance(16);
    assert.equal(env.layer.dataset.pose, 'beam');
    assert.equal(env.image('beam').style.opacity, '1');
    env.advance(300);
    assert.equal(env.layer.dataset.pose, 'beam', 'Normal release must not cut the pulse short');
    env.advance(200);
    assert.equal(env.layer.dataset.pose, 'idle');
    env.cleanup();
  });
}

test('capture transfer while the primary mouse button is still held does not stop the beam', () => {
  const env = setup();
  env.pointer('pointerdown', 200, 200, { buttons: 1 });
  env.tick(0);
  env.pointer('lostpointercapture', 200, 200, { buttons: 1 });
  env.advance(1000);
  assert.equal(env.layer.dataset.pose, 'beam');
  env.pointer('pointerup', 200, 200, { buttons: 0 });
  env.advance(16);
  assert.equal(env.layer.dataset.pose, 'idle');
  env.cleanup();
});

test('a fast click survives a delayed first render and gets a full visible beam pulse', () => {
  const env = setup();
  env.pointer('pointerdown', 200, 200);
  env.pointer('pointerup', 200, 200);
  env.tick(600); // The page was busy longer than the old input-based deadline.
  assert.equal(env.layer.dataset.pose, 'beam');
  env.advance(400);
  assert.equal(env.layer.dataset.pose, 'beam');
  env.advance(32);
  assert.equal(env.layer.dataset.pose, 'idle');
  env.cleanup();
});

test('a released click waits for a slow beam image, without spinning frames while it loads', () => {
  const env = setup();
  env.image('beam').complete = false;
  env.image('beam').naturalWidth = 0;
  env.pointer('pointerdown', 200, 200);
  env.pointer('pointerup', 200, 200);
  env.tick(0);
  assert.equal(env.layer.dataset.pose, 'idle');
  assert.equal(env.frames.size, 0);
  env.advance(600);
  env.image('beam').complete = true;
  env.image('beam').naturalWidth = 1200;
  env.image('beam').dispatch('load');
  env.advance(16);
  assert.equal(env.layer.dataset.pose, 'beam');
  env.advance(400);
  assert.equal(env.layer.dataset.pose, 'beam');
  env.advance(32);
  assert.equal(env.layer.dataset.pose, 'idle');
  env.cleanup();
});

test('rapid clicks restart the visible beam duration instead of cancelling each other', () => {
  const env = setup();
  env.pointer('pointerdown', 200, 200);
  env.pointer('pointerup', 200, 200);
  env.tick(0);
  env.advance(300);
  env.pointer('pointerdown', 200, 200);
  env.pointer('pointerup', 200, 200);
  env.pointer('lostpointercapture', 200, 200, { buttons: 0 });
  env.advance(316);
  assert.equal(env.layer.dataset.pose, 'beam');
  env.advance(200);
  assert.equal(env.layer.dataset.pose, 'idle');
  env.cleanup();
});

test('a real cancellation or viewport exit discards a click queued behind image loading', () => {
  for (const event of ['pointercancel', 'pointerout']) {
    const env = setup();
    env.image('beam').complete = false;
    env.image('beam').naturalWidth = 0;
    env.pointer('pointerdown', 200, 200);
    env.pointer('pointerup', 200, 200);
    env.tick(0);
    env.pointer(event, event === 'pointerout' ? -1 : 200, 200, { relatedTarget: null });
    env.image('beam').complete = true;
    env.image('beam').naturalWidth = 1200;
    env.image('beam').dispatch('load');
    env.advance(16);
    assert.notEqual(env.layer.dataset.pose, 'beam', `${event} must discard a pending beam`);
    env.cleanup();
  }
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
  const { layer, sprite, images, position, pointer, tick, cleanup } = setup();
  pointer('pointermove', 799, 599);
  tick(0);
  assert.deepEqual(position(), [800 - Number.parseFloat(layer.style.width), 600 - Number.parseFloat(layer.style.height)]);
  assert.equal(layer.style.pointerEvents, 'none');
  assert.equal(sprite.style.pointerEvents, 'none');
  assert(images.every(image => image.style.pointerEvents === 'none'));
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
  const { image, pointer, tick, cleanup } = setup();
  image('swim').complete = false;
  image('swim').naturalWidth = 0;
  image('beam').complete = false;
  image('beam').naturalWidth = 0;
  pointer('pointermove', 200, 200);
  tick(0);
  pointer('pointermove', 220, 200);
  tick(16);
  assert.equal(image('idle').style.opacity, '1', 'Swimming must not hide the only loaded image');
  pointer('pointerdown', 220, 200);
  tick(32);
  assert.equal(image('idle').style.opacity, '1');
  image('beam').complete = true;
  image('beam').naturalWidth = 1200;
  image('beam').dispatch('load');
  tick(48);
  assert.equal(image('beam').style.opacity, '1', 'A loaded held-click beam appears without another pointer event');
  pointer('pointerup', 220, 200);
  tick(500);
  image('swim').complete = true; // Failed images may be complete but have no natural width.
  pointer('pointermove', 240, 200);
  tick(516);
  assert.equal(image('idle').style.opacity, '1');
  cleanup();
});

test('reattaches a removed layer on the next pointer event and cleans up all observers', () => {
  const { document, layer, images, pointer, tick, cleanup, observers } = setup();
  layer.remove();
  pointer('pointermove', 200, 200);
  tick(0);
  assert.equal(layer.parentElement, document.body);
  assert.equal(layer.style.display, 'block');
  cleanup();
  assert.equal(document.body.children.length, 0);
  assert(observers.every(observer => !observer.active));
  assert(images.every(image => [...image.events.values()].every(handlers => handlers.size === 0)));
});

test('glides between sparse mouse events and settles without a continuous idle JS loop', () => {
  const env = setup();
  env.pointer('pointermove', 100, 100);
  env.tick(0);
  env.pointer('pointermove', 400, 100);
  env.advance(16);
  const first = env.position()[0];
  assert(first > 112 && first < 412, 'The first frame must interpolate instead of jumping to the pointer');
  assert.equal(env.frames.size, 1);
  env.advance(16);
  assert(env.position()[0] > first && env.position()[0] < 412, 'It must keep moving between pointer samples');
  env.advance(1000);
  assert.equal(env.position()[0], 412);
  assert.equal(env.frames.size, 0, 'A resting UFO must not keep a JS animation loop alive');
  assert.match(env.sprite.style.animation, /infinite/, 'Idle hovering is handled by CSS');
  env.cleanup();
});

test('equal elapsed time gives the same follow position at 60 Hz and 120 Hz', () => {
  const follow = hz => {
    const env = setup();
    env.pointer('pointermove', 100, 100);
    env.tick(0);
    env.pointer('pointermove', 600, 300);
    env.advance(250, 1000 / hz);
    const point = env.position();
    env.cleanup();
    return point;
  };
  const at60 = follow(60), at120 = follow(120);
  assert(Math.abs(at60[0] - at120[0]) < 0.05);
  assert(Math.abs(at60[1] - at120[1]) < 0.05);
});

test('shrinking the viewport cannot leave an interpolating UFO outside the screen', () => {
  const env = setup();
  env.pointer('pointermove', 799, 599);
  env.tick(0);
  env.window.innerWidth = 320;
  env.window.innerHeight = 240;
  env.window.dispatch('resize');
  env.advance(16);
  const [x, y] = env.position();
  assert(x >= 0 && x <= 320 - Number.parseFloat(env.layer.style.width));
  assert(y >= 0 && y <= 240 - Number.parseFloat(env.layer.style.height));
  env.cleanup();
});

test('minor horizontal jitter does not repeatedly flip the swimming art', () => {
  const env = setup();
  env.pointer('pointermove', 200, 200);
  env.tick(0);
  env.pointer('pointermove', 240, 200);
  env.advance(16);
  for (const x of [239, 240, 239, 240]) {
    env.pointer('pointermove', x, 200);
    env.advance(16);
    assert.equal(env.layer.dataset.direction, 'right');
  }
  env.pointer('pointermove', 230, 200);
  env.advance(16);
  assert.equal(env.layer.dataset.direction, 'left', 'A deliberate reversal still changes direction');
  env.cleanup();
});

test('a held click keeps the beam while the position glides and stops scheduling once settled', () => {
  const env = setup();
  env.pointer('pointerdown', 100, 100);
  env.tick(0);
  env.pointer('pointermove', 400, 100);
  env.advance(16);
  assert.equal(env.layer.dataset.pose, 'beam');
  assert(env.position()[0] > 112 && env.position()[0] < 412);
  assert.equal(env.frames.size, 1, 'Holding a click must not interrupt follow frames');
  env.advance(1000);
  assert.equal(env.layer.dataset.pose, 'beam');
  assert.equal(env.position()[0], 412);
  assert.equal(env.frames.size, 0);
  env.cleanup();
});

test('reduced motion disables easing, hover, and fading, including when preferences change', () => {
  const env = setup({ reducedMotion: true });
  env.pointer('pointermove', 100, 100);
  env.tick(0);
  env.pointer('pointermove', 400, 100);
  env.advance(16);
  assert.equal(env.position()[0], 412);
  assert.equal(env.sprite.style.animation, 'none');
  assert(env.images.every(image => image.style.transition === 'none'));
  env.media.matches = false;
  env.media.dispatch('change');
  assert.match(env.sprite.style.animation, /infinite/);
  assert(env.images.every(image => /opacity/.test(image.style.transition)));
  env.cleanup();
  assert([...env.media.events.values()].every(handlers => handlers.size === 0));
});
