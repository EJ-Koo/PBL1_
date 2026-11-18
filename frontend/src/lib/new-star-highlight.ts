export const NEW_STAR_HIGHLIGHT_MS = 20_000;
export type NewStarHighlight = { id: string; startedAt: number };

/** Euler XYZ angles that bring this star to the front without changing its saved position. */
export function newStarFocus(position: readonly number[], center: readonly number[]) {
  const [x, y, z] = position.map((value, index) => value - center[index]);
  const horizontal = Math.hypot(x, z);
  return {
    rotationX: Math.atan2(y, horizontal),
    rotationY: Math.atan2(-x, z),
    distance: Math.hypot(x, y, z) + 3.5,
  };
}

/** A gentle pulse, with a short arrival and a two-second fade at the end. */
export function newStarGlow(elapsedMs: number, reducedMotion: boolean) {
  const remaining = NEW_STAR_HIGHLIGHT_MS - elapsedMs;
  if (elapsedMs < 0 || remaining <= 0) return { opacity: 0, scale: 1 };
  const fade = Math.min(1, elapsedMs / 350, remaining / 2000);
  const pulse = reducedMotion ? 0.5 : (1 - Math.cos(elapsedMs / 1600 * Math.PI * 2)) / 2;
  return { opacity: fade * (0.55 + pulse * 0.35), scale: 1 + pulse * 0.08 };
}

/** Unread group stars keep the same visible halo until the diary is read. */
export function unreadStarGlow(elapsedMs: number, reducedMotion: boolean) {
  const pulse = reducedMotion ? 0.5 : (1 - Math.cos(Math.max(0, elapsedMs) / 1600 * Math.PI * 2)) / 2;
  return { opacity: 0.55 + pulse * 0.35, scale: 1 + pulse * 0.08 };
}
