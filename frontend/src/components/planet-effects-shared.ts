// [2026-11-21] 특수 효과 기존 5종(planet-effects.tsx)과 신규 3종(planet-effects-new.tsx)이 함께 쓰는 값.
// planet-effects.tsx 에 있던 것을 내용 그대로 옮겼다(두 파일이 서로를 불러오지 않게). planet-effects.tsx 가 다시 내보낸다.
import { Color, type Vector2 } from 'three';

import type { PlanetQuality } from '@/lib/planet-visual';
import type { EffectTier, SpecialType } from '@/lib/special-planet';

/** 행성 셰이더와 같은 빛 방향(화면 기준 오른쪽 위, 옆에서 비스듬히) */
export const LIGHT_DIR_GLSL = 'const vec3 LIGHT_DIR = vec3(0.88, 0.36, 0.31);';

/** 화면 전체가 함께 쓰는 값(universe-scene의 SCENE_UNIFORMS): 선택 중 여부, 먼 행성 어둡게 */
export type SharedUniforms = { uFocus: { value: number }; uDepthFade: { value: Vector2 } };

/** 효과 단계: 카메라 거리·선택에 따라 UniverseScene이 주기적으로 정한다(행성 id → 단계). 없으면 0(멀리). */
export const EFFECT_TIERS = new Map<string, EffectTier>();

/**
 * [2026-11-25] 상세 장식(추가 입자·잔상·광륜)을 켤 행성 id. 우주 화면이 0.3초마다 정한다(확대해서 가까이 본 행성).
 * 선택한 행성·미리보기(단계 고정)는 여기에 없어도 켠다. 설정: special-planet.ts SPECIAL_EFFECT_SETTINGS.detail
 */
export const EFFECT_DETAIL = new Set<string>();

export type EffectPalette = { deep: string; base: string; tone: string; light: string; accent: string };

// 선택 강조·먼 행성 어둡게(행성 본체와 같은 규칙)
// [2026-11-13] uDim: 별자리 보기에서 별자리 밖 행성을 어둡게 할 때 본체(universe-scene uDim)와 같은 값으로
// 막·판·궤도·수정·입자를 모두 함께 어둡게 한다(0이면 예전과 똑같다). 효과 저장값과는 무관한 화면 처리.
export const FADE_GLSL = `
  uniform float uHighlight;
  uniform float uFocus;
  uniform vec2 uDepthFade;
  uniform float uDim;
  float sceneFade(float viewZ) {
    return (1.0 - 0.45 * smoothstep(uDepthFade.x, uDepthFade.y, -viewZ))
         * (1.0 + 0.6 * uHighlight) * (1.0 - 0.35 * uFocus * (1.0 - uHighlight))
         * (1.0 - uDim);
  }
`;

/** 대표색 계열에서 효과 색을 고른다(색상은 대표색 그대로, 밝기·채도만 조절). */
export function effectColors(p: EffectPalette) {
  const light = new Color(p.light);
  const base = new Color(p.base);
  const accent = new Color(p.accent);
  const white = new Color('#ffffff');
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  // 에너지 색: 대표색의 색상 그대로, 더 밝고 선명하게
  const hot = new Color().setHSL(hsl.h, Math.min(1, Math.max(hsl.s, 0.25) * 1.15), Math.min(0.78, Math.max(hsl.l, 0.5) + 0.12));
  return {
    light,
    base,
    accent,
    hot,
    water: light.clone().lerp(white, 0.35),
    cloud: light.clone().lerp(white, 0.6),
    deep: new Color(p.deep),
    crystalA: light.clone().lerp(white, 0.45),
    crystalB: base.clone().lerp(light, 0.5),
  };
}

export type EffectProps = {
  id: string;
  type: SpecialType;
  radius: number;
  palette: EffectPalette;
  intensity: number;
  speed: number;
  quality: PlanetQuality;
  /** 행성 선택 강조 값(0~1, Planet이 매 프레임 갱신) */
  highlight: { current: number };
  /** [2026-11-13] 어둡게 할 정도(0~1, Planet 본체와 같은 값. 별자리 밖 행성). 없으면 0 */
  dim?: { current: number };
  shared: SharedUniforms;
  /** 단계 고정(미리보기). 없으면 선택 여부·EFFECT_TIERS(거리)로 정한다. */
  fixedTier?: EffectTier;
};

/** 어둡게 하지 않음(dim 이 없을 때) */
export const NO_DIM = { current: 0 };
