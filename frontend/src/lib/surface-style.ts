// [NEW FILE 2026-11-21] 행성 표면 스타일(Surface Style): Opal Glass · Pastel Cloud · Pearl Silk · Crystal Prism · Aurora Ribbon.
//
// 행성 렌더링 층 구조(각 층은 따로 켜고 끈다)
//  - 감정 본체(Emotion Core): AI 감정 분석(KcELECTRA)이 정한 색·무늬. planet-visual.ts 그대로. 여기서 바꾸지 않는다.
//  - 표면 스타일(Surface Style): 이 파일. 감정 본체가 만든 색을 입력으로 받아 재질(광택·빛결)만 덧입힌다.
//  - 특수 효과(Special Effect): special-planet.ts / planet-effects.tsx. 행성 바깥(주변)에만 그린다.
//  - 대기·광택(Atmosphere), 회전(Animation): universe-scene.tsx 그대로.
//
// 지키는 것
//  - 스타일이 없으면(null) 기존 셰이더를 한 글자도 바꾸지 않고 그대로 쓴다 → 기존 행성과 완전히 같다.
//  - 스타일 색은 전부 감정 본체에서 온다(감정 색 줄 텍스처·대표색 계열 밝은 색·보조 감정 색).
//    참고 HTML의 감정 프리셋·파스텔 고정색은 쓰지 않는다.
//  - 크기(일기 분량)·위치(서버 좌표)·감정 분석 결과는 읽기만 한다.
//  - 상점: 특수 효과와 같은 방식(소모품, 1개 = 행성 1개). 칸(slot) planet_surface, 아이템 id 는 sf_ 로 시작(특수 효과 fx_ 와 겹치지 않음).
import type { PlanetQuality } from './planet-visual';

export type SurfaceStyle = 'opal_glass' | 'pastel_cloud' | 'pearl_silk' | 'crystal_prism' | 'aurora_ribbon';

/**
 * 바꾸는 범위
 *  - finish: 광택·반사만 바꾼다. 감정 무늬(층·보조 감정 층)는 그대로 보인다.
 *  - overlay: 감정 무늬 위에 새 결(구름·결정면·오로라)을 반투명하게 겹친다. 겹치는 양은 SURFACE_OVERLAY_MAX 이하.
 */
export type SurfaceScope = 'finish' | 'overlay';

export const SURFACE_STYLES: Record<
  SurfaceStyle,
  { name: string; en: string; icon: string; description: string; scope: SurfaceScope; index: number }
> = {
  opal_glass: {
    name: '오팔 유리구슬',
    en: 'Opal Glass',
    icon: '🔮',
    description: '감정 색 위로 무지갯빛 유리 광택과 빛결이 흐른다.',
    scope: 'finish',
    index: 1,
  },
  pastel_cloud: {
    name: '솜사탕 구름',
    en: 'Pastel Cloud',
    icon: '🍥',
    description: '감정 색으로 물든 부드러운 구름결이 표면을 감싼다.',
    scope: 'overlay',
    index: 2,
  },
  pearl_silk: {
    name: '진주 실크',
    en: 'Pearl Silk',
    icon: '🦪',
    description: '진주 광택과 실크 같은 빛줄기가 감정 무늬를 따라 흐른다.',
    scope: 'finish',
    index: 3,
  },
  crystal_prism: {
    name: '크리스탈 프리즘',
    en: 'Crystal Prism',
    icon: '💠',
    description: '감정 색 보석 결정면과 프리즘 반짝임이 비친다.',
    scope: 'overlay',
    index: 4,
  },
  aurora_ribbon: {
    name: '오로라 리본',
    en: 'Aurora Ribbon',
    icon: '🎐',
    description: '감정 색 오로라 리본이 유리구슬 속을 유영한다.',
    scope: 'overlay',
    index: 5,
  },
};

export const SURFACE_STYLE_IDS = Object.keys(SURFACE_STYLES) as SurfaceStyle[];

/** 겹치는 스타일(overlay)이 감정 무늬를 덮는 최대 비율. 이보다 많이 덮으면 감정 무늬가 안 보인다. */
export const SURFACE_OVERLAY_MAX = 0.35;

/** 서버 아이템의 칸(slot). 이 칸의 아이템은 상점 '소모품' 탭의 '행성 표면' 줄에 나온다. */
export const PLANET_SURFACE_SLOT = 'planet_surface';

/**
 * 표면 스타일 설정. 여기서 끄거나(enabled, styles) 세기(amount)를 바꿀 수 있다.
 * 단계(LOD) — 특수 효과와 같은 규칙:
 *  - 0 멀리: 광택(빛 반사)만. 추가 노이즈 계산 없음 → 행성이 많아도 가볍다.
 *  - 1 가까이(카메라와 nearDistance 이내, 가까운 순서로 maxNear개까지): 빛결·구름·결정면 등 무늬 + 느린 움직임
 *  - 2 선택(마우스 올림·누름): 1 + 가는 결·반짝임까지 전부
 *  - 별자리 보기: 별자리 밖(어둡게 한) 행성은 0, 행성들이 움직이는 동안은 모두 0(기존 가독성·성능 규칙 우선)
 */
export const SURFACE_STYLE_SETTINGS = {
  enabled: true,
  /** 스타일 세기(0~1). 1이면 설계한 최대치(겹침은 SURFACE_OVERLAY_MAX 까지). */
  amount: 1,
  styles: {
    opal_glass: true,
    pastel_cloud: true,
    pearl_silk: true,
    crystal_prism: true,
    aurora_ribbon: true,
  } as Record<SurfaceStyle, boolean>,
  maxNear: { low: 3, medium: 6, high: 10 } as Record<PlanetQuality, number>,
  nearDistance: 9,
};

/** 표면 단계: 0 멀리(광택만), 1 가까이(무늬·움직임), 2 선택(전부) */
export type SurfaceTier = 0 | 1 | 2;

/** 우주 화면이 0.3초마다 정하는 행성별 표면 단계(행성 id → 단계). 없으면 0. 선택(2)은 행성 쪽에서 바로 판단한다. */
export const SURFACE_TIERS = new Map<string, SurfaceTier>();

export function asSurfaceStyle(value: unknown): SurfaceStyle | null {
  return typeof value === 'string' && value in SURFACE_STYLES ? (value as SurfaceStyle) : null;
}

/** 상점 아이템 → 표면 스타일. 표면 아이템이 아니거나 앱이 모르는 값이면 null. */
export function surfaceOfItem(item: { slot: string | null; effect?: { type?: unknown; surface?: unknown } | null }): SurfaceStyle | null {
  if (item.slot !== PLANET_SURFACE_SLOT || item.effect?.type !== PLANET_SURFACE_SLOT) return null;
  return asSurfaceStyle(item.effect.surface);
}

/** 화면에 그릴 표면 스타일. 꺼져 있거나 모르는 값이면 null(기본 스타일 = 기존 행성 그대로). */
export function surfaceToDraw(surface: SurfaceStyle | null | undefined): SurfaceStyle | null {
  if (!SURFACE_STYLE_SETTINGS.enabled || !surface) return null;
  return surface in SURFACE_STYLES && SURFACE_STYLE_SETTINGS.styles[surface] ? surface : null;
}

/**
 * 표면 단계 정하기(순수 함수, 테스트용). ranked = 카메라에서 가까운 순서로 정렬한 표면 스타일 행성.
 * dimmed = 별자리 보기에서 어둡게 한 행성(항상 0). moving = 별자리 전환 중(모두 0).
 */
export function surfaceTiers(
  ranked: readonly { id: string; d: number }[],
  quality: PlanetQuality,
  opts: { moving?: boolean; dimmed?: ReadonlySet<string> } = {}
): Map<string, SurfaceTier> {
  const out = new Map<string, SurfaceTier>();
  let near = 0;
  for (const r of ranked) {
    const ok =
      !opts.moving &&
      !opts.dimmed?.has(r.id) &&
      near < SURFACE_STYLE_SETTINGS.maxNear[quality] &&
      r.d < SURFACE_STYLE_SETTINGS.nearDistance;
    if (ok) near++;
    out.set(r.id, ok ? 1 : 0);
  }
  return out;
}
