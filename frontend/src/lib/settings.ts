// 기기에 저장하는 사용자 설정: 우주 회전 민감도와 글자 크기.
// 우주 화면(universe-scene.tsx)은 드래그할 때마다 getRotateSensitivity()를 읽으므로,
// 메뉴에서 값을 바꾸면 화면을 다시 그리지 않아도 바로 적용된다.
import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_KEY = 'settings:fontScale';
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.4;
let fontScale = 1;
const fontListeners = new Set<() => void>();
export const getFontScale = () => fontScale;
export function subscribeFontScale(listener: () => void) {
  fontListeners.add(listener);
  return () => { fontListeners.delete(listener); };
}
function normalizeFontScale(value: number) {
  return Math.round(Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, value)) * 10) / 10;
}
export function setFontScale(value: number) {
  if (!Number.isFinite(value)) return fontScale;
  const next = normalizeFontScale(value);
  if (next === fontScale) return fontScale;
  fontScale = next;
  fontListeners.forEach(listener => listener());
  AsyncStorage.setItem(FONT_KEY, String(fontScale)).catch(() => {});
  return fontScale;
}

const ROTATE_KEY = 'settings:rotateSensitivity';

// 느린 쪽을 넓히고 빠른 쪽을 줄임 (기존 0.25~2.5배 → 2배도 너무 빠르다는 의견 반영)
export const ROTATE_SENSITIVITY_MIN = 0.1;
export const ROTATE_SENSITIVITY_MAX = 1.5;
export const ROTATE_SENSITIVITY_DEFAULT = 1;

let rotateSensitivity = ROTATE_SENSITIVITY_DEFAULT;
let loading: Promise<void> | undefined;

function clamp(v: number) {
  return Math.min(Math.max(v, ROTATE_SENSITIVITY_MIN), ROTATE_SENSITIVITY_MAX);
}

export function getRotateSensitivity(): number {
  return rotateSensitivity;
}

export function loadSettings(): Promise<void> {
  // 루트와 홈이 동시에 요청해도 저장소는 한 번만 읽는다. 읽기 실패 시 기본값 유지.
  return loading ??= Promise.all([ROTATE_KEY, FONT_KEY].map(key =>
    AsyncStorage.getItem(key).catch(() => null)
  )).then(([rotate, font]) => {
    if (rotate !== null && Number.isFinite(Number(rotate))) rotateSensitivity = clamp(Number(rotate));
    if (font !== null && Number.isFinite(Number(font))) {
      const next = normalizeFontScale(Number(font));
      if (next !== fontScale) {
        fontScale = next;
        fontListeners.forEach(listener => listener());
      }
    }
  });
}

export function setRotateSensitivity(value: number): number {
  // [FIXED 2026-11-10] 숫자가 아니면 무시 (NaN 이 저장되면 우주 회전이 멈춘다)
  if (!Number.isFinite(value)) return rotateSensitivity;
  const next = clamp(value);
  if (next === rotateSensitivity) return rotateSensitivity;
  rotateSensitivity = next;
  AsyncStorage.setItem(ROTATE_KEY, String(rotateSensitivity)).catch(() => {});
  return rotateSensitivity;
}
