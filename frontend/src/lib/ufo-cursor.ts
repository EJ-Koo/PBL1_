import type { UfoPose } from './ufo-art';
import { mountCursorLayer } from '../../public/cursor-layer.js';

type Frame = { uri: string; width: number; height: number; left: number; top: number };
const SIZE = 57.6;
const REST_DELAY = 180;
const BEAM_DURATION = 420;
const FOLLOW_TIME = 65; // Match the astronaut's time-based follow response.
const SETTLE_DISTANCE = 0.1;
const TURN_DISTANCE = 3;
const POSES: readonly UfoPose[] = ['idle', 'swim', 'beam'];

/** A mouse-only companion layer. It never captures clicks or hides the pointer. */
export function startUfoCursor(frames: Record<UfoPose, Frame>) {
  const layer = document.createElement('div');
  layer.dataset.ufoCursor = 'mint';
  layer.dataset.pose = 'idle';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed', left: '0', top: '0', width: `${SIZE}px`, height: `${SIZE}px`,
    pointerEvents: 'none', zIndex: '2147483647', display: 'none',
    userSelect: 'none', contain: 'layout style', willChange: 'transform',
  });
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const style = document.createElement('style');
  style.textContent = '@keyframes star2day-ufo-float { 0%,100% { transform:translateY(-2px) } 50% { transform:translateY(2px) } }';
  layer.appendChild(style);
  // Keep hover, image fades, and pointer translation on separate transforms.
  const sprite = document.createElement('div');
  sprite.dataset.ufoSprite = '';
  Object.assign(sprite.style, {
    position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
    pointerEvents: 'none', willChange: 'transform',
    filter: 'drop-shadow(0 0 5px rgba(92,255,223,0.25))',
  });
  layer.appendChild(sprite);
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
      opacity: pose === 'idle' ? '1' : '0',
      transformOrigin: `${(frame.left + 600) * SIZE / 1200}px 50%`,
    });
    sprite.appendChild(image);
    images[pose] = image;
  }
  // The supplied swimming art banks left; mirror it for rightward movement.
  images.swim.style.transform = 'scaleX(-1)';
  // Native dialogs sit above body content regardless of its z-index. Share the
  // existing cursor host so opening or removing a dialog cannot bury the UFO.
  const host = mountCursorLayer(layer);

  let point: { x: number; y: number } | null = null;
  let position: { x: number; y: number } | null = null;
  let lastFrame: number | null = null;
  let turnX: number | null = null;
  let direction = 1;
  let renderedDirection = 1;
  let displayedPose: UfoPose = 'idle';
  let swimUntil = 0;
  let beamUntil = 0;
  let pressed = false;
  let animation = 0;
  let suspended = false;

  function targetFor(pointer: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.min(pointer.x + 12, window.innerWidth - SIZE)),
      y: Math.max(0, Math.min(pointer.y - 20, window.innerHeight - SIZE)),
    };
  }

  function setPose(pose: UfoPose) {
    if (displayedPose === pose) return;
    displayedPose = pose;
    layer.dataset.pose = pose;
    for (const key of POSES) images[key].style.opacity = key === pose ? '1' : '0';
  }

  function updateMotion() {
    sprite.style.animation = motion.matches ? 'none' : 'star2day-ufo-float 2.8s ease-in-out infinite';
    for (const pose of POSES) images[pose].style.transition = motion.matches ? 'none' : 'opacity 100ms ease-out';
    if (point) schedule();
  }

  function ready(pose: UfoPose) {
    return images[pose].complete && images[pose].naturalWidth > 0;
  }

  function render(now: number) {
    animation = 0;
    if (!point || suspended || document.hidden) return;
    if (!layer.isConnected) host.sync();
    const target = targetFor(point);
    position ??= { ...target };
    const dt = Math.min(64, Math.max(0, now - (lastFrame ?? now)));
    lastFrame = now;
    const follow = motion.matches ? 1 : 1 - Math.exp(-dt / FOLLOW_TIME);
    position.x += (target.x - position.x) * follow;
    position.y += (target.y - position.y) * follow;
    // A resized viewport can invalidate the old position before easing finishes.
    position.x = Math.max(0, Math.min(position.x, window.innerWidth - SIZE));
    position.y = Math.max(0, Math.min(position.y, window.innerHeight - SIZE));
    const following = Math.hypot(target.x - position.x, target.y - position.y) > SETTLE_DISTANCE;
    const swimming = now < swimUntil || Math.abs(target.x - position.x) > SETTLE_DISTANCE;
    if (!following) position = target;
    const requested: UfoPose = pressed || now < beamUntil ? 'beam' : swimming ? 'swim' : 'idle';
    // A state change must not hide the loaded sprite while another PNG loads.
    const pose = ready(requested) ? requested : ready('idle') ? 'idle' : POSES.find(ready);
    if (!pose) { layer.style.display = 'none'; lastFrame = null; return; }
    setPose(pose);
    if (renderedDirection !== direction) {
      renderedDirection = direction;
      images.swim.style.transform = direction > 0 ? 'scaleX(-1)' : 'none';
    }
    layer.dataset.direction = direction > 0 ? 'right' : 'left';
    layer.style.transform = `translate3d(${position.x.toFixed(2)}px,${position.y.toFixed(2)}px,0)`;
    layer.style.display = 'block';
    // Keep interpolating between sparse mouse samples, including during clicks.
    // Once settled, CSS handles the hover without a continuous JS loop.
    if (following || (!pressed && (now < beamUntil || now < swimUntil))) schedule();
    else lastFrame = null;
  }

  function schedule() {
    if (!animation) {
      lastFrame ??= performance.now();
      animation = window.requestAnimationFrame(render);
    }
  }

  function hide(forgetPointer = true) {
    window.cancelAnimationFrame(animation);
    animation = 0;
    lastFrame = null;
    if (forgetPointer) { point = position = null; turnX = null; }
    pressed = false;
    swimUntil = beamUntil = 0;
    layer.style.display = 'none';
    setPose('idle');
  }

  function move(event: PointerEvent) {
    if (event.pointerType !== 'mouse') { hide(); return; }
    if (!suspended && point?.x === event.clientX && point.y === event.clientY
        && layer.isConnected && layer.style.display === 'block') return;
    suspended = false;
    const dx = point ? event.clientX - point.x : 0;
    turnX ??= event.clientX;
    if (dx !== 0) {
      swimUntil = performance.now() + REST_DELAY;
      const turn = event.clientX - turnX;
      if (Math.abs(turn) >= TURN_DISTANCE) {
        direction = turn > 0 ? 1 : -1;
        turnX = event.clientX;
      }
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

  updateMotion();
  motion.addEventListener('change', updateMotion, { signal: listeners.signal });
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
