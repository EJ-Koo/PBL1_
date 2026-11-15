export type UniverseControls = { yaw: number; pitch: number; zoom: number };
const views = new Map<string, UniverseControls>();
export function controlsFor(scene: string): UniverseControls {
  let view = views.get(scene);
  if (!view) { view = { yaw: 0, pitch: 0, zoom: 1 }; views.set(scene, view); }
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
