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
export function setFontScale(value: number) {
  if (!Number.isFinite(value)) return fontScale;
  fontScale = Math.round(Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, value)) * 10) / 10;
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
let loaded = false;

function clamp(v: number) {
  return Math.min(Math.max(v, ROTATE_SENSITIVITY_MIN), ROTATE_SENSITIVITY_MAX);
}

export function getRotateSensitivity(): number {
  return rotateSensitivity;
}

export async function loadSettings(): Promise<void> {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(ROTATE_KEY);
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v)) rotateSensitivity = clamp(v);
  } catch {
    // 읽기 실패 시 기본값 사용
  }
  try {
    const raw = await AsyncStorage.getItem(FONT_KEY);
    const value = raw === null ? NaN : Number(raw);
    if (Number.isFinite(value)) {
      fontScale = Math.round(Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, value)) * 10) / 10;
      fontListeners.forEach(listener => listener());
    }
  } catch { /* 기본 글자 크기 유지 */ }
  loaded = true;
}

export function setRotateSensitivity(value: number): number {
  // [FIXED 2026-11-10] 숫자가 아니면 무시 (NaN 이 저장되면 우주 회전이 멈춘다)
  if (!Number.isFinite(value)) return rotateSensitivity;
  rotateSensitivity = clamp(value);
  AsyncStorage.setItem(ROTATE_KEY, String(rotateSensitivity)).catch(() => {});
  return rotateSensitivity;
}
