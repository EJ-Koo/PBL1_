import type { UfoPose } from './ufo-art';
import { mountCursorLayer } from '../../public/cursor-layer.js';

type Frame = { uri: string; width: number; height: number; left: number; top: number };
const SIZE = 64;
const REST_DELAY = 180;
const BEAM_DURATION = 420;
const POSES: readonly UfoPose[] = ['idle', 'swim', 'beam'];

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
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };
  const images = {} as Record<UfoPose, HTMLImageElement>;
  for (const pose of POSES) {
    const frame = frames[pose];
    const image = document.createElement('img');
    image.src = frame.uri;
    image.alt = '';
    image.draggable = false;
    image.dataset.ufoPose = pose;
    image.addEventListener('load', schedule, { signal: listeners.signal });
    image.addEventListener('error', schedule, { signal: listeners.signal });
    Object.assign(image.style, {
      position: 'absolute', width: `${frame.width * SIZE / 1200}px`,
      height: `${frame.height * SIZE / 1200}px`, left: `${-frame.left * SIZE / 1200}px`,
      top: `${-frame.top * SIZE / 1200}px`, pointerEvents: 'none', imageRendering: 'pixelated',
      visibility: pose === 'idle' ? 'visible' : 'hidden',
    });
    layer.appendChild(image);
    images[pose] = image;
  }
  // Native dialogs sit above body content regardless of its z-index. Share the
  // existing cursor host so opening or removing a dialog cannot bury the UFO.
  const host = mountCursorLayer(layer);

  let point: { x: number; y: number } | null = null;
  let direction = 1;
  let swimUntil = 0;
  let beamUntil = 0;
  let pressed = false;
  let animation = 0;
  let suspended = false;

  function ready(pose: UfoPose) {
    return images[pose].complete && images[pose].naturalWidth > 0;
  }

  function render(now: number) {
    animation = 0;
    if (!point || suspended || document.hidden) return;
    if (!layer.isConnected) host.sync();
    const requested: UfoPose = pressed || now < beamUntil ? 'beam' : now < swimUntil ? 'swim' : 'idle';
    // A state change must not hide the loaded sprite while another PNG loads.
    const pose = ready(requested) ? requested : ready('idle') ? 'idle' : POSES.find(ready);
    if (!pose) { layer.style.display = 'none'; return; }
    layer.dataset.pose = pose;
    layer.dataset.direction = direction > 0 ? 'right' : 'left';
    for (const key of POSES) {
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

  function hide(forgetPointer = true) {
    window.cancelAnimationFrame(animation);
    animation = 0;
    if (forgetPointer) point = null;
    pressed = false;
    swimUntil = beamUntil = 0;
    layer.style.display = 'none';
    layer.dataset.pose = 'idle';
  }

  function move(event: PointerEvent) {
    if (event.pointerType !== 'mouse') { hide(); return; }
    suspended = false;
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
    suspended = false;
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

  function cancel(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    pressed = false;
    swimUntil = beamUntil = 0;
    if (point) schedule();
  }

  function leave(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.relatedTarget) return;
    // Removing a hovered card/backdrop can also produce a null relatedTarget.
    // Only forget the pointer when its coordinates actually leave the viewport.
    if (event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) hide();
  }

  function suspend() {
    suspended = true;
    hide(false);
  }

  function resume() {
    if (document.hidden) return;
    suspended = false;
    if (point) { host.sync(); schedule(); }
  }

  window.addEventListener('pointermove', move, options);
  window.addEventListener('pointerover', move, options);
  window.addEventListener('pointerdown', down, options);
  window.addEventListener('pointerup', up, options);
  window.addEventListener('pointercancel', cancel, options);
  window.addEventListener('lostpointercapture', cancel, options);
  window.addEventListener('pointerout', leave, options);
  window.addEventListener('blur', suspend, options);
  window.addEventListener('focus', resume, options);
  window.addEventListener('resize', () => { if (point) schedule(); }, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else resume(); }, options);

  return () => {
    listeners.abort();
    hide();
    host.dispose();
  };
}
