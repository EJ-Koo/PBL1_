import { startAstronautCursor } from './astronaut-cursor.js';
import { mountCursorLayer } from './cursor-layer.js';

const SPACING = 8;
const MAX_PARTICLES = 72;
const MAX_PER_FRAME = 8;
const MAX_BACKING_PIXELS = 8_000_000;

function drawParticle(ctx, p, age, style) {
  const progress = age / p.life;
  const seconds = age / 1000;
  const x = p.x + p.vx * seconds;
  const y = p.y + p.vy * seconds + 17 * seconds * seconds;
  const glint = p.sparkle ? 0.78 + 0.22 * Math.sin(14 * progress) : 1;
  ctx.globalAlpha = p.opacity * Math.min(1, age / 45) * (1 - progress) ** 1.3 * glint;
  ctx.beginPath();
  if (style === 'diamond') {
    ctx.moveTo(x, y - p.radius * 1.9);
    ctx.lineTo(x + p.radius, y);
    ctx.lineTo(x, y + p.radius * 1.9);
    ctx.lineTo(x - p.radius, y);
    ctx.closePath();
  } else if (p.sparkle) {
    const ray = p.radius * (1.7 + glint);
    const core = p.radius * 0.46;
    ctx.moveTo(x, y - ray);
    ctx.lineTo(x + core, y - core);
    ctx.lineTo(x + ray, y);
    ctx.lineTo(x + core, y + core);
    ctx.lineTo(x, y + ray);
    ctx.lineTo(x - core, y + core);
    ctx.lineTo(x - ray, y);
    ctx.lineTo(x - core, y - core);
    ctx.closePath();
  } else {
    ctx.arc(x, y, p.radius, 0, Math.PI * 2);
  }
  ctx.fill();
}

function startTrail(effect) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.dataset.stardustTrail = '';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', left: '0', top: '0',
    pointerEvents: 'none', zIndex: '2147483647', display: 'block',
  });

  const layer = mountCursorLayer(canvas);

  let dpr = 0;
  let width = 0;
  let height = 0;
  const resize = () => {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = window.devicePixelRatio || 1;
    const ratio = Math.min(dpr, 2, Math.sqrt(MAX_BACKING_PIXELS / (width * height)));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.fillStyle = effect.color;
  };

  const particles = [];
  let previous = null;
  let pending = null;
  let remainder = 0;
  let frame = 0;

  function emit(from, to, now) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (!distance) return;
    const travel = remainder + distance;
    const steps = Math.floor(travel / SPACING);
    const count = Math.min(MAX_PER_FRAME, steps);
    remainder = travel % SPACING;
    if (!count) return;
    const overflow = particles.length + count - MAX_PARTICLES;
    if (overflow > 0) particles.splice(0, overflow);
    const speed = Math.min(24, 12 * distance / Math.max(8, to.time - from.time));
    for (let i = count - 1; i >= 0; i--) {
      const t = 1 - (remainder + i * SPACING * steps / count) / distance;
      const drift = speed * Math.random();
      particles.push({
        x: from.x + t * dx + (Math.random() - 0.5) * 4,
        y: from.y + t * dy + (Math.random() - 0.5) * 4,
        vx: dx / distance * drift + (Math.random() - 0.5) * 23,
        vy: dy / distance * drift + (Math.random() - 0.45) * 19,
        born: now, life: 320 + Math.random() * 360,
        radius: 0.55 + Math.random() * 0.8, opacity: 0.48 + Math.random() * 0.4,
        sparkle: effect.style === 'stardust' && Math.random() < 0.18,
      });
    }
  }

  const render = (now) => {
    frame = 0;
    if (previous && pending) emit(previous, pending, now);
    previous = pending ?? previous;
    pending = null;
    if (!canvas.isConnected) layer.sync();
    if ((window.devicePixelRatio || 1) !== dpr) resize();
    ctx.clearRect(0, 0, width, height);
    let alive = 0;
    for (const p of particles) {
      const age = now - p.born;
      if (age >= p.life) continue;
      particles[alive++] = p;
      drawParticle(ctx, p, age, effect.style);
    }
    particles.length = alive;
    if (alive) frame = window.requestAnimationFrame(render);
  };

  function onMove(event) {
    if (event.pointerType !== 'mouse') return;
    const point = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (!previous) { previous = point; return; }
    const last = pending ?? previous;
    if (point.x === last.x && point.y === last.y) return;
    pending = point;
    if (!frame) frame = window.requestAnimationFrame(render);
  }
  function resetPointer() {
    previous = pending = null;
    remainder = 0;
  }
  function onPointerOut(event) {
    if (event.pointerType === 'mouse' && !event.relatedTarget) resetPointer();
  }

  resize();
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };
  window.addEventListener('pointermove', onMove, options);
  window.addEventListener('pointerout', onPointerOut, options);
  window.addEventListener('blur', resetPointer, { signal: listeners.signal });
  window.addEventListener('resize', resize, { signal: listeners.signal });
  return () => {
    listeners.abort();
    window.cancelAnimationFrame(frame);
    layer.dispose();
  };
}

const starter = { type: 'cursor', style: 'stardust', color: '#FFFFFF' };

function readLocal(key) {
  if (!key) return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}

class StardustCursorTrail extends HTMLElement {
  static observedAttributes = ['selection'];
  #stopListening;
  #select;

  attributeChangedCallback(name, before, after) {
    if (before !== after) this.#select?.();
  }

  connectedCallback() {
    const eligible = window.matchMedia('(any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    let stopTrail;
    let effect;
    let owner;
    const cacheKey = (id) => id ? this.dataset.cachePrefix + id : null;
    const update = () => {
      if (effect && eligible.matches && !document.hidden) {
        stopTrail ??= effect.style === 'astronaut_blue' || effect.style === 'astronaut_pink'
          ? startAstronautCursor(effect.style === 'astronaut_pink' ? 'pink' : 'blue') : startTrail(effect);
      } else {
        stopTrail?.();
        stopTrail = undefined;
      }
    };

    const apply = (next) => {
      // Cache entries only describe appearance. The shop API verifies ownership and equipment.
      if (next === undefined) next = starter;
      if (next?.type !== 'cursor' || !['stardust', 'dots', 'diamond', 'astronaut_blue', 'astronaut_pink'].includes(next.style)
          || !/^#[\da-f]{6}$/i.test(next.color)) next = null;
      if (next?.color !== effect?.color || next?.style !== effect?.style) {
        stopTrail?.();
        stopTrail = undefined;
      }
      effect = next;
      update();
    };
    this.#select = () => {
      const selection = JSON.parse(this.getAttribute('selection') || 'null');
      owner = selection ? selection.owner : readLocal(this.dataset.sessionKey)?.user_id;
      const key = cacheKey(owner);
      if (key && selection && 'effect' in selection) {
        try { localStorage.setItem(key, JSON.stringify(selection.effect)); } catch { /* storage disabled */ }
        apply(selection.effect);
      } else {
        apply(readLocal(key));
      }
    };
    const onStorage = (event) => {
      if (event.key === this.dataset.sessionKey || event.key === null) {
        owner = readLocal(this.dataset.sessionKey)?.user_id;
        apply(readLocal(cacheKey(owner)));
      } else if (event.key === cacheKey(owner)) {
        apply(readLocal(event.key));
      }
    };
    window.addEventListener('storage', onStorage);
    eligible.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    this.#stopListening = () => {
      window.removeEventListener('storage', onStorage);
      eligible.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      stopTrail?.();
    };
    this.#select();
  }

  disconnectedCallback() {
    this.#stopListening?.();
    this.#stopListening = undefined;
    this.#select = undefined;
  }
}

customElements.define('stardust-cursor-trail', StardustCursorTrail);
