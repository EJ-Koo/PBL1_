import type { UfoPose } from './ufo-art';

type Frame = { uri: string; width: number; height: number; left: number; top: number };
const SIZE = 64;
const REST_DELAY = 180;
const BEAM_DURATION = 420;

/** A mouse-only companion layer. It never captures clicks or hides the pointer. */
export function startUfoCursor(frames: Record<UfoPose, Frame>) {
  const layer = document.createElement('div');
  layer.dataset.ufoCursor = 'mint';
  layer.dataset.pose = 'idle';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed', left: '0', top: '0', width: `${SIZE}px`, height: `${SIZE}px`,
    pointerEvents: 'none', zIndex: '2147483647', display: 'none', overflow: 'hidden',
    userSelect: 'none', contain: 'layout style paint',
    filter: 'drop-shadow(0 0 5px rgba(92,255,223,0.25))',
  });
  const images = {} as Record<UfoPose, HTMLImageElement>;
  for (const pose of ['idle', 'swim', 'beam'] as const) {
    const frame = frames[pose];
    const image = document.createElement('img');
    image.src = frame.uri;
    image.alt = '';
    image.draggable = false;
    image.dataset.ufoPose = pose;
    Object.assign(image.style, {
      position: 'absolute', width: `${frame.width * SIZE / 1200}px`,
      height: `${frame.height * SIZE / 1200}px`, left: `${-frame.left * SIZE / 1200}px`,
      top: `${-frame.top * SIZE / 1200}px`, pointerEvents: 'none', imageRendering: 'pixelated',
      visibility: pose === 'idle' ? 'visible' : 'hidden',
    });
    layer.appendChild(image);
    images[pose] = image;
  }
  document.body.appendChild(layer);

  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };
  let point: { x: number; y: number } | null = null;
  let direction = 1;
  let swimUntil = 0;
  let beamUntil = 0;
  let pressed = false;
  let animation = 0;

  function render(now: number) {
    animation = 0;
    if (!point) return;
    const pose = pressed || now < beamUntil ? 'beam' : now < swimUntil ? 'swim' : 'idle';
    layer.dataset.pose = pose;
    layer.dataset.direction = direction > 0 ? 'right' : 'left';
    for (const key of ['idle', 'swim', 'beam'] as const) {
      images[key].style.visibility = key === pose ? 'visible' : 'hidden';
    }
    // Flip the normalized canvas, so the tilted art faces the movement direction.
    const flip = pose === 'swim' && direction < 0;
    layer.style.transform = `translate3d(${Math.max(0, Math.min(point.x + 12, window.innerWidth - SIZE))}px,${Math.max(0, Math.min(point.y - 20, window.innerHeight - SIZE))}px,0)${flip ? ' scaleX(-1)' : ''}`;
    layer.style.display = 'block';
    // Resting and held-click states need no continuous JS animation.
    if (!pressed && (now < beamUntil || now < swimUntil)) schedule();
  }

  function schedule() {
    if (!animation) animation = window.requestAnimationFrame(render);
  }

  function hide() {
    window.cancelAnimationFrame(animation);
    animation = 0;
    point = null;
    pressed = false;
    swimUntil = beamUntil = 0;
    layer.style.display = 'none';
    layer.dataset.pose = 'idle';
  }

  function move(event: PointerEvent) {
    if (event.pointerType !== 'mouse') { hide(); return; }
    const dx = point ? event.clientX - point.x : 0;
    if (Math.abs(dx) >= 1) {
      direction = dx > 0 ? 1 : -1;
      swimUntil = performance.now() + REST_DELAY;
    }
    point = { x: event.clientX, y: event.clientY };
    schedule();
  }

  function down(event: PointerEvent) {
    if (event.pointerType !== 'mouse') { hide(); return; }
    if (event.button !== 0 || event.isPrimary === false) return;
    point = { x: event.clientX, y: event.clientY };
    pressed = true;
    beamUntil = performance.now() + BEAM_DURATION;
    schedule();
  }

  function up(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    pressed = false;
    schedule();
  }

  window.addEventListener('pointermove', move, options);
  window.addEventListener('pointerdown', down, options);
  window.addEventListener('pointerup', up, options);
  window.addEventListener('pointercancel', hide, options);
  window.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); }, options);
  window.addEventListener('blur', hide, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); }, options);

  return () => {
    listeners.abort();
    hide();
    layer.remove();
  };
}
