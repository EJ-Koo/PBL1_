// 행성 크기 규칙(일기 분량 → 반지름). react-native 없이 쓸 수 있게 따로 둔다(테스트: tests/planet-size.test.mjs).
// - 크기는 일기 분량(공백 제외 글자 수)만으로 정한다. 감정 점수·사진 수는 쓰지 않는다.
// - 위치(서버 좌표)는 바꾸지 않는다. 이웃 행성과 겹칠 만큼 크면 화면에서만 반지름을 줄인다(capRadiiByNeighbors).

/**
 * 기본 표시 반지름. 실제 반지름 = 기본 × 배율.
 * [2026-11-21] 0.32 → 0.272(15% 축소, 반지름 0.16~0.54). 3D 간격은 충분했지만(가장 가까운 행성까지 약 1.3)
 * 앞뒤 행성이 화면에서 겹쳐 붙어 보였다. 배율 범위는 그대로라 분량에 따른 크기 차이(비율)는 같다.
 */
export const PLANET_BASE_RADIUS = 0.272;
/**
 * [2026-11-18] 기본 0.3·배율 0.8~1.3(600자 최대) → 기본 0.32·배율 0.6~2.0(300자 최대).
 * 예전에는 흔한 짧은 일기(10~50자)가 반지름 0.25~0.28 에 몰려 분량 차이가 거의 안 보였다.
 * 큰 행성이 이웃과 겹칠 수 있는 경우는 capRadiiByNeighbors 가 막는다(AI 배치 최소 간격 0.8 < 최대 지름 1.09).
 */
export const PLANET_SCALE_MIN = 0.6;
export const PLANET_SCALE_MAX = 2.0;
/** 이 글자 수(공백 제외) 이상이면 최대 크기. */
export const PLANET_CHARS_FOR_MAX = 300;
const PLANET_CHARS_CURVE = 10;
/** 이웃과 겹치지 않게 줄일 때 둘 사이에 남길 틈(표시 단위) */
const NEIGHBOR_GAP = 0.04;

export function countCharsNoSpace(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

/**
 * 공백 제외 글자 수 → 크기 배율(0.6~2.0). 로그 곡선이라 짧은 일기에서 빠르게, 긴 일기에서 천천히 커진다.
 * 예: 0자 0.60 · 10자 0.88 · 20자 1.05 · 50자 1.33 · 100자 1.58 · 200자 1.84 · 300자 이상 2.00
 */
export function planetScaleForText(text: string): number {
  const n = Math.min(countCharsNoSpace(text), PLANET_CHARS_FOR_MAX);
  const ratio = Math.log1p(n / PLANET_CHARS_CURVE) / Math.log1p(PLANET_CHARS_FOR_MAX / PLANET_CHARS_CURVE);
  return PLANET_SCALE_MIN + (PLANET_SCALE_MAX - PLANET_SCALE_MIN) * ratio;
}

export function planetRadiusForText(text: string): number {
  return PLANET_BASE_RADIUS * planetScaleForText(text);
}

/**
 * 우주 화면용: 행성마다 원하는 반지름을 쓰되, 가장 가까운 행성과 겹치면 그 거리의 절반(틈 제외)까지만 키운다.
 * 둘 다 절반 이하가 되므로 어떤 두 행성도 서로 파고들지 않는다. 가장 작은 크기보다 작게 줄이지는 않는다.
 */
export function capRadiiByNeighbors(positions: readonly (readonly number[])[], radii: readonly number[]): number[] {
  const floor = PLANET_BASE_RADIUS * PLANET_SCALE_MIN;
  return radii.map((r, i) => {
    const p = positions[i];
    let nearest = Infinity;
    for (let j = 0; j < positions.length; j++) {
      if (j === i) continue;
      const q = positions[j];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d < nearest) nearest = d;
    }
    if (!Number.isFinite(nearest)) return r;
    return Math.max(Math.min(r, nearest / 2 - NEIGHBOR_GAP), Math.min(r, floor));
  });
}
