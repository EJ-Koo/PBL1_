// 특수 행성 효과(Ocean·Cloud·Crystal·Nebula·Lava).
// [MODIFIED 2026-11-12] 효과는 AI가 자동으로 고르지 않는다. 사용자가 상점에서 산 효과를 원하는 일기 행성에 직접 적용한다.
//  - 효과 아이템: 서버 items 표의 소모품(consumable), 칸(slot) planet_effect, effect = {"type":"planet_effect","special":"ocean"}
//    1개 = 행성 1개. 남은 개수 = 산 개수 − 적용 중인 행성 수. 해제·변경하면 1개가 돌아온다.
//  - 적용 상태: 서버 planet_effects 표 → GET /stars 의 effect 필드 → DiaryEntry.effect
// 행성 본체(감정 색·무늬·크기·위치)는 그대로이고, 효과는 본체 바깥에만 더한다(색도 행성의 감정 색에서 고른다).
import type { PlanetQuality, PlanetVisual } from '@/lib/planet-visual';
import type { ShopItem } from '@/lib/shop-api';

export type SpecialType = 'ocean' | 'cloud' | 'crystal' | 'nebula' | 'lava';

export type DiaryTopic =
  | 'travel'
  | 'relationship'
  | 'study_achievement'
  | 'rest_daily'
  | 'challenge_activity'
  | 'other';

/** 일기 작성 화면의 주제 선택지(선택 사항). 서버 Topic(backend/app/schemas/diary.py)과 같은 값. */
export const DIARY_TOPICS: { id: DiaryTopic; label: string }[] = [
  { id: 'travel', label: '여행' },
  { id: 'relationship', label: '인간관계' },
  { id: 'study_achievement', label: '학업·성취' },
  { id: 'rest_daily', label: '휴식·일상' },
  { id: 'challenge_activity', label: '도전·활동' },
  { id: 'other', label: '기타' },
];

/**
 * [ADDED 2026-11-12] 일기 작성 화면의 '오늘의 주제' 줄을 보일지.
 * 주제는 AI가 특수 행성을 자동으로 고를 때만 쓰였는데, 이제 효과는 사용자가 직접 고르므로 화면에서 숨긴다.
 * 서버는 주제를 계속 받을 수 있어(선택 값) true 로 바꾸면 그대로 다시 나타난다.
 */
export const SHOW_TOPIC_PICKER = false;

export const SPECIAL_NAMES: Record<SpecialType, string> = {
  ocean: '바다 행성',
  cloud: '구름 행성',
  crystal: '수정 행성',
  nebula: '성운 행성',
  lava: '용암 행성',
};

/** 효과 이름(상점·꾸미기 화면 칩). 서버 아이템 이름이 있으면 그것을 먼저 쓴다. */
export const EFFECT_LABELS: Record<SpecialType, { name: string; icon: string }> = {
  ocean: { name: '바다 효과', icon: '🌊' },
  cloud: { name: '구름 효과', icon: '☁️' },
  crystal: { name: '수정 효과', icon: '💎' },
  nebula: { name: '성운 효과', icon: '🌌' },
  lava: { name: '용암 효과', icon: '🌋' },
};

export const SPECIAL_TYPES = Object.keys(SPECIAL_NAMES) as SpecialType[];

/** 서버 아이템의 칸(slot). 이 칸의 아이템은 상점 '소모품' 탭의 '행성 효과' 줄에 나온다. */
export const PLANET_EFFECT_SLOT = 'planet_effect';

/** 상점 아이템 → 효과 종류. 행성 효과 아이템이 아니거나 앱이 모르는 값이면 null. */
export function effectOfItem(item: Pick<ShopItem, 'slot' | 'effect'>): SpecialType | null {
  if (item.slot !== PLANET_EFFECT_SLOT || item.effect?.type !== PLANET_EFFECT_SLOT) return null;
  return asSpecialType(item.effect.special);
}

export function asSpecialType(value: unknown): SpecialType | null {
  return typeof value === 'string' && value in SPECIAL_NAMES ? (value as SpecialType) : null;
}

/**
 * 특수 효과 설정. 여기서 효과를 끄거나(enabled, types) 애니메이션 속도(speed)·세기(intensity)를 바꿀 수 있다.
 * 장기 사용자(행성이 많을 때)를 위한 단계(LOD):
 *  - 선택한 행성(마우스 올림·누름): 모든 효과 + 입자 전부 + 애니메이션
 *  - 가까운 특수 행성(카메라와 nearDistance 이내, 가까운 순서로 maxNear개까지): 효과 + 입자 절반 + 애니메이션
 *  - 그 밖(멀리 있는 행성): 효과의 바탕 층만 멈춘 채로(입자 없음, 애니메이션 없음)
 */
export const SPECIAL_EFFECT_SETTINGS = {
  enabled: true,
  speed: 1,
  /** 효과 세기(0.6~1.0). 예전 AI 방식은 점수에 따라 달랐고, 사용자가 고른 효과는 모두 같은 세기로 그린다. */
  intensity: 0.85,
  types: { ocean: true, cloud: true, crystal: true, nebula: true, lava: true } as Record<SpecialType, boolean>,
  maxNear: { low: 3, medium: 6, high: 10 } as Record<PlanetQuality, number>,
  nearDistance: 9,
  /** 저품질(휴대폰·행성 많음)에서는 가까운 행성도 입자를 그리지 않는다(선택한 행성만) */
  particlesWhenNear: { low: false, medium: true, high: true } as Record<PlanetQuality, boolean>,
};

/** 화면에 그릴 효과. 효과가 꺼져 있거나 모르는 값이면 null(일반 행성). */
export function effectToDraw(effect: SpecialType | null | undefined): SpecialType | null {
  if (!SPECIAL_EFFECT_SETTINGS.enabled || !effect) return null;
  return effect in SPECIAL_NAMES && SPECIAL_EFFECT_SETTINGS.types[effect] ? effect : null;
}

/** 효과 단계: 0 멀리(바탕만, 정지), 1 가까이(효과·입자 일부), 2 선택(전부) */
export type EffectTier = 0 | 1 | 2;

/**
 * 상점 미리보기용 샘플 행성: '설렘·애정'(연분홍) 감정 + '기쁨' 보조 감정, 띠 무늬.
 * 실제 AI 감정 행성과 같은 형식이라 효과 색이 감정 색에서 어떻게 나오는지 그대로 보인다.
 */
export const SAMPLE_PLANET: PlanetVisual = {
  version: 'sample',
  state: 'clear',
  primary: { group: 'warmth', name: '설렘·애정', label: '', score: 0.9, passed: true },
  none_prob: 0,
  base_color: '#FF9CC2',
  tone_color: '#F58BB8',
  accents: [
    { group: 'joy', name: '기쁨', label: '', score: 0.8, color: '#FFC93C', weight: 0.2, slot: 'main' },
    { group: 'anxiety', name: '불안', label: '', score: 0.5, color: '#B888FF', weight: 0.06, slot: 'rare' },
  ],
  pattern: 'bands',
  turbulence: 0.4,
  glow: 0.7,
  ring: { visible: false, color: null },
  atmosphere: { visible: true, color: '#FFD6E7' },
  valence: 0.7,
};
