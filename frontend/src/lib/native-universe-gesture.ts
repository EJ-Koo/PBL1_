export type TouchPoint = { identifier: number; pageX: number; pageY: number };
export type TouchFrame = { points: readonly TouchPoint[]; travel: number };
// RN reports the complete touch list, unlike browser PointerEvents. Never depend on
// receiving a separate pointermove for each finger during a native pinch.
export function advanceNativeGesture(previous: TouchFrame, points: readonly TouchPoint[]) {
  let dx = 0, dy = 0, zoom = 1;
  const sameFingers = points.length === previous.points.length && points.every(p => previous.points.some(q => q.identifier === p.identifier));
  if (sameFingers && points.length === 1) {
    dx = points[0].pageX - previous.points[0].pageX;
    dy = points[0].pageY - previous.points[0].pageY;
  } else if (sameFingers && points.length === 2) {
    const distance = (list: readonly TouchPoint[]) => Math.hypot(list[0].pageX - list[1].pageX, list[0].pageY - list[1].pageY);
    zoom = Math.max(1, distance(previous.points)) / Math.max(1, distance(points));
  }
  const travel = previous.travel + Math.hypot(dx, dy);
  return { frame: { points: points.map(p => ({ ...p })), travel }, dx, dy, zoom,
    suppressTap: points.length > 1 || previous.points.length > 1 || travel > 6 };
}
