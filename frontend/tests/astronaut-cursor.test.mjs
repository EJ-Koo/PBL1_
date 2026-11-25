import test from 'node:test';
import assert from 'node:assert/strict';
import { startAstronautCursor } from '../public/astronaut-cursor.js';

function browser(t) {
  const cleanups = [];
  const originals = Object.fromEntries(['window', 'document', 'MutationObserver', 'HTMLDialogElement', 'HTMLElement', 'customElements', 'localStorage']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const observers = [];
  class Element extends EventTarget {
    constructor(tagName = 'custom') { super(); this.tagName = tagName; this.style = {}; this.dataset = {}; this.children = []; this.attributes = new Map(); }
    get parentNode() { return this.parentElement; }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    appendChild(child) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null;
    }
    setAttribute(name, value) {
      const before = this.getAttribute(name);
      this.attributes.set(name, value);
      if (this.constructor.observedAttributes?.includes(name)) this.attributeChangedCallback(name, before, value);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    closest() {
      for (let node = this; node; node = node.parentElement) if (node instanceof Dialog && node.open) return node;
      return null;
    }
    getContext() { return Object.fromEntries(['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'arc', 'fill'].map(name => [name, () => {}])); }
  }
  class Dialog extends Element { open = false; }
  class Observer {
    constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const document = new EventTarget();
  document.body = new Element('body');
  document.hidden = false;
  document.activeElement = document.body;
  const descendants = (root = document.body) => root.children.flatMap(child => [child, ...descendants(child)]);
  document.querySelector = () => descendants().find(node => node instanceof Dialog && node.open) ?? null;
  document.createElement = name => new Element(name);
  const window = new EventTarget();
  let now = 1000, sequence = 0;
  const frames = new Map();
  window.innerWidth = 800;
  window.innerHeight = 600;
  window.devicePixelRatio = 1;
  window.performance = { now: () => now };
  window.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
  window.cancelAnimationFrame = id => frames.delete(id);
  const media = new EventTarget();
  media.matches = true;
  window.matchMedia = () => media;
  const registry = new Map();
  const cache = new Map();
  Object.assign(globalThis, { window, document, MutationObserver: Observer, HTMLDialogElement: Dialog, HTMLElement: Element,
    customElements: { define: (name, element) => registry.set(name, element) },
    localStorage: { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) } });
  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const emit = (target, type, properties = {}) => {
    const event = new Event(type);
    Object.assign(event, properties);
    target.dispatchEvent(event);
  };
  return {
    window, document, observers, Dialog, registry, cache, media, cleanup: callback => cleanups.push(callback),
    find: () => descendants().find(node => 'astronautCursor' in node.dataset),
    move: (x, y, pointerType = 'mouse') => emit(window, 'pointermove', { clientX: x, clientY: y, pointerType }),
    emit,
    advance(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += 16) {
        now += 16;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach(callback => callback(now));
      }
    },
    pending: () => frames.size,
  };
}

for (const theme of ['blue', 'pink']) test(`${theme} uses the supplied swimming pose and the same follow, facing, and resting behavior`, t => {
  const env = browser(t);
  const stop = startAstronautCursor(theme);
  env.cleanup(stop);
  const avatar = env.find();
  assert.equal(avatar.style.display, 'none');
  const floating = avatar.children.find(child => child.tagName === 'div');
  const [idle, swim] = floating.children;
  assert.equal(avatar.dataset.astronautTheme, theme);
  assert.equal(idle.src, `/cursors/astronaut-${theme}-idle.png`);
  assert.equal(swim.src, `/cursors/astronaut-${theme}-swim.png`);
  assert.match(floating.style.filter, theme === 'pink' ? /255,133,193/ : /72,223,255/);
  assert.match(floating.style.animation, /infinite/);
  assert.equal(avatar.style.pointerEvents, 'none');
  env.move(200, 150);
  assert.equal(avatar.dataset.pose, 'swim');
  assert.equal(swim.style.visibility, 'visible');
  env.advance(240);
  assert.equal(avatar.dataset.pose, 'idle');
  assert.equal(idle.style.visibility, 'visible');
  assert.equal(swim.style.visibility, 'hidden');
  assert.equal(env.pending(), 0, 'idle floating does not require a JavaScript animation loop');
  env.move(200, 150);
  assert.equal(avatar.dataset.pose, 'idle', 'unchanged coordinates do not restart swimming');
  env.move(500, 150);
  assert.equal(avatar.dataset.pose, 'swim');
  assert.equal(swim.style.transform, 'scaleX(-1)');
  env.advance(800);
  assert.equal(avatar.dataset.pose, 'idle');
  assert.match(avatar.style.transform, /512\.00px,118\.00px/);
  env.move(450, 150);
  assert.equal(swim.style.transform, 'none');
});

test('stays inside the viewport, hides on leave or blur, and ignores touch pointers', t => {
  const env = browser(t);
  const stop = startAstronautCursor();
  const avatar = env.find();
  env.move(799, 599);
  env.advance(300);
  assert.match(avatar.style.transform, /723\.00px,528\.00px/);
  env.move(0, 0);
  env.advance(1000);
  assert.match(avatar.style.transform, /12\.00px,8\.00px/);
  env.emit(env.window, 'pointerout', { pointerType: 'mouse', relatedTarget: {} });
  assert.equal(avatar.style.display, 'block');
  env.emit(env.window, 'pointerout', { pointerType: 'mouse', relatedTarget: null });
  assert.equal(avatar.style.display, 'none');
  assert.equal(env.pending(), 0);
  env.move(100, 100, 'touch');
  assert.equal(avatar.style.display, 'none');
  env.move(120, 120);
  env.emit(env.window, 'blur');
  assert.equal(avatar.style.display, 'none');
  env.move(140, 140);
  stop();
  assert.equal(env.pending(), 0);
  assert.equal(env.find(), undefined);
  env.move(300, 300);
  assert.equal(env.pending(), 0, 'removal also stops pointer listeners');
});

test('follows native dialogs and cleans up its layer observers', t => {
  const env = browser(t);
  const stop = startAstronautCursor();
  const avatar = env.find();
  const dialog = new env.Dialog('dialog');
  env.document.body.appendChild(dialog);
  dialog.open = true;
  env.document.activeElement = dialog;
  env.emit(env.document, 'focusin');
  assert.equal(avatar.parentElement, dialog);
  assert(env.observers.some(observer => observer.active));
  dialog.open = false;
  env.document.activeElement = env.document.body;
  env.emit(env.document, 'focusin');
  assert.equal(avatar.parentElement, env.document.body);
  stop();
  assert(env.observers.every(observer => !observer.active));
});

test('shop selection switches, visibility and motion preferences remove the astronaut cleanly', async t => {
  const env = browser(t);
  await import(`../public/stardust-cursor-trail.js?test=${Date.now()}`);
  const Cursor = env.registry.get('stardust-cursor-trail');
  const controller = new Cursor();
  controller.dataset.cachePrefix = 'cursor:';
  controller.dataset.sessionKey = 'session';
  const astronaut = { type: 'cursor', style: 'astronaut_blue', color: '#48DFFF', itemId: 'cursor_astronaut_blue' };
  const select = (owner, effect) => controller.setAttribute('selection', JSON.stringify({ owner, effect }));
  select('account-a', astronaut);
  controller.connectedCallback();
  env.cleanup(() => controller.disconnectedCallback());
  assert(env.find());
  env.media.matches = false;
  env.emit(env.media, 'change');
  assert.equal(env.find(), undefined);
  env.media.matches = true;
  env.emit(env.media, 'change');
  assert(env.find());
  env.document.hidden = true;
  env.emit(env.document, 'visibilitychange');
  assert.equal(env.find(), undefined);
  env.document.hidden = false;
  env.emit(env.document, 'visibilitychange');
  assert(env.find());
  select('account-b', null);
  assert.equal(env.find(), undefined);
  assert.equal(JSON.parse(env.cache.get('cursor:account-a')).itemId, astronaut.itemId);
  select('account-b', { type: 'cursor', style: 'diamond', color: '#BB77FF' });
  assert(env.document.body.children.some(node => node.tagName === 'canvas'));
  select('account-a', astronaut);
  assert(env.find());
  assert(!env.document.body.children.some(node => node.tagName === 'canvas'));
  const blueAvatar = env.find();
  const pink = { type: 'cursor', style: 'astronaut_pink', color: '#FF85C1', itemId: 'cursor_astronaut_pink' };
  env.move(200, 150);
  env.advance(32);
  select('account-a', pink);
  assert(!blueAvatar.isConnected, 'Changing astronaut themes removes the old cursor');
  const pinkAvatar = env.find();
  assert.equal(pinkAvatar.dataset.astronautTheme, 'pink');
  const pinkImages = pinkAvatar.children.find(child => child.tagName === 'div').children;
  assert.equal(pinkImages[0].src, '/cursors/astronaut-pink-idle.png');
  assert.equal(pinkImages[1].src, '/cursors/astronaut-pink-swim.png');
  assert.equal(JSON.parse(env.cache.get('cursor:account-a')).itemId, pink.itemId);
  assert.equal(env.pending(), 0, 'Theme changes clear the old follow animation');
  env.move(300, 150);
  env.advance(240);
  assert.equal(pinkAvatar.dataset.pose, 'idle');
  select('account-a', astronaut);
  assert(!pinkAvatar.isConnected);
  assert.equal(env.find().dataset.astronautTheme, 'blue');
  select('account-a', { ...astronaut, style: 'unknown' });
  assert.equal(env.find(), undefined);
  controller.disconnectedCallback();
  assert.equal(env.pending(), 0);
});
