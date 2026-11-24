export type UniverseControls = { yaw: number; pitch: number; zoom: number };
const views = new Map<string, UniverseControls>();
export function controlsFor(scene: string): UniverseControls {
  // Home and every group share angle/zoom for one login; account changes start clean.
  const scope = scene.includes(':') ? scene.split(':')[0] : 'default';
  let view = views.get(scope);
  if (!view) { view = { yaw: 0, pitch: 0, zoom: 1 }; views.set(scope, view); }
  return view;
}
export function rotateView(view: UniverseControls, dx: number, dy: number, sensitivity: number) {
  view.yaw += dx * 0.01 * sensitivity;
  view.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, view.pitch + dy * 0.01 * sensitivity));
}
// A proportional zoom step feels the same regardless of the number/spread of planets.
export function zoomView(view: UniverseControls, factor: number) {
  view.zoom = Math.min(5, Math.max(0.25, view.zoom * factor));
}
// [2026-11-15] 별자리 보기: 정면(기울기 0, 가장 가까운 한 바퀴)으로 돌리고 거리를 맞춘다. 저장해 둔 화면으로 되돌릴 때도 쓴다.
export function setView(view: UniverseControls, next: Partial<UniverseControls>) {
  Object.assign(view, next);
}
export function frontView(view: UniverseControls, zoom?: number) {
  view.pitch = 0;
  view.yaw = Math.round(view.yaw / (Math.PI * 2)) * Math.PI * 2;
  if (zoom != null && Number.isFinite(zoom)) view.zoom = zoom;
}

// Keep a selected diary readable by limiting camera approach while its popup is open.
export function limitDiaryZoom(view: UniverseControls) {
  view.zoom = Math.max(0.6, view.zoom);
}
