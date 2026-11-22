import { mountCursorLayer } from './cursor-layer.js';

const SIZE = 64;
const GAP = 20;
const EDGE = 8;
const REST_DELAY = 180;

export function startAstronautCursor() {
  const element = document.createElement('div');
  element.dataset.astronautCursor = '';
  element.dataset.pose = 'idle';
  element.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {
    position: 'fixed', left: '0', top: '0', width: `${SIZE}px`, height: `${SIZE}px`,
    pointerEvents: 'none', zIndex: '2147483647', display: 'none', userSelect: 'none',
  });

  const style = document.createElement('style');
  style.textContent = '@keyframes star2day-astronaut-float { 0%,100% { transform:translateY(-3px) } 50% { transform:translateY(3px) } }';
  element.appendChild(style);
  const floating = document.createElement('div');
  Object.assign(floating.style, {
    width: '100%', height: '100%', position: 'relative', pointerEvents: 'none',
    animation: 'star2day-astronaut-float 2.8s ease-in-out infinite',
    filter: 'drop-shadow(0 2px 5px rgba(72,223,255,0.2))',
  });
  element.appendChild(floating);
  const images = {};
  for (const pose of ['idle', 'swim']) {
    const image = document.createElement('img');
    image.src = `/cursors/astronaut-blue-${pose}.png`;
    image.alt = '';
    image.draggable = false;
    image.dataset.astronautPose = pose;
    Object.assign(image.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain',
      imageRendering: 'pixelated', pointerEvents: 'none', visibility: pose === 'idle' ? 'visible' : 'hidden',
    });
    floating.appendChild(image);
    images[pose] = image;
  }

  const layer = mountCursorLayer(element);
  const listeners = new AbortController();
  const options = { capture: true, passive: true, signal: listeners.signal };
  let pointer = null;
  let position = null;
  let lastMovement = 0;
  let lastFrame = 0;
  let facing = 1;
  let frame = 0;

  function targetFor(point) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const x = point.x + GAP + SIZE + EDGE <= width ? point.x + GAP : point.x - GAP - SIZE;
    return {
      x: Math.min(Math.max(EDGE, x), Math.max(0, width - SIZE - EDGE)),
      y: Math.min(Math.max(EDGE, point.y - SIZE / 2), Math.max(0, height - SIZE - EDGE)),
    };
  }

  function setPose(pose) {
    if (element.dataset.pose !== pose) {
      element.dataset.pose = pose;
      images.idle.style.visibility = pose === 'idle' ? 'visible' : 'hidden';
      images.swim.style.visibility = pose === 'swim' ? 'visible' : 'hidden';
    }
    // The supplied swimming PNG faces left; mirror only that pose when moving right.
    images.swim.style.transform = facing < 0 ? 'scaleX(-1)' : 'none';
  }

  function draw() {
    element.style.transform = `translate3d(${position.x.toFixed(2)}px,${position.y.toFixed(2)}px,0)`;
  }

  function render(now) {
    frame = 0;
    if (!pointer || !position) return;
    if (!element.isConnected) layer.sync();
    const target = targetFor(pointer);
    const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
    lastFrame = now;
    const follow = 1 - Math.exp(-dt / 65);
    position.x += (target.x - position.x) * follow;
    position.y += (target.y - position.y) * follow;
    const remaining = Math.hypot(target.x - position.x, target.y - position.y);
    const moving = now - lastMovement < REST_DELAY || remaining > 1;
    setPose(moving ? 'swim' : 'idle');
    if (!moving) position = target;
    draw();
    if (moving) frame = window.requestAnimationFrame(render);
    else lastFrame = 0; // CSS keeps the gentle float; no JS loop runs while idle.
  }

  function hide() {
    window.cancelAnimationFrame(frame);
    frame = 0;
    pointer = position = null;
    lastFrame = 0;
    element.style.display = 'none';
    setPose('idle');
  }

  function onMove(event) {
    if (event.pointerType !== 'mouse') { hide(); return; }
    if (pointer && event.clientX === pointer.x && event.clientY === pointer.y) return;
    if (pointer && event.clientX !== pointer.x) facing = event.clientX > pointer.x ? -1 : 1;
    pointer = { x: event.clientX, y: event.clientY };
    if (!position) { position = targetFor(pointer); draw(); }
    lastMovement = window.performance.now();
    setPose('swim');
    element.style.display = 'block';
    if (!frame) frame = window.requestAnimationFrame(render);
  }

  function onPointerOut(event) {
    if (event.pointerType === 'mouse' && !event.relatedTarget) hide();
  }

  window.addEventListener('pointermove', onMove, options);
  window.addEventListener('pointerout', onPointerOut, options);
  window.addEventListener('blur', hide, { signal: listeners.signal });
  window.addEventListener('resize', () => {
    if (pointer && !frame) frame = window.requestAnimationFrame(render);
  }, { signal: listeners.signal });
  return () => {
    listeners.abort();
    window.cancelAnimationFrame(frame);
    layer.dispose();
  };
}
