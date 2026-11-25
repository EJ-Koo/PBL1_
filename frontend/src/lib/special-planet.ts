// 특수 행성 효과(Ocean·Cloud·Crystal·Nebula·Lava).
// [MODIFIED 2026-11-12] 효과는 AI가 자동으로 고르지 않는다. 사용자가 상점에서 산 효과를 원하는 일기 행성에 직접 적용한다.
//  - 효과 아이템: 서버 items 표의 소모품(consumable), 칸(slot) planet_effect, effect = {"type":"planet_effect","special":"ocean"}
//    1개 = 행성 1개. 남은 개수 = 산 개수 − 적용 중인 행성 수. 해제·변경하면 1개가 돌아온다.
//  - 적용 상태: 서버 planet_effects 표 → GET /stars 의 effect 필드 → DiaryEntry.effect
// 행성 본체(감정 색·무늬·크기·위치)는 그대로이고, 효과는 본체 바깥에만 더한다(색도 행성의 감정 색에서 고른다).
import type { PlanetQuality, PlanetVisual } from '@/lib/planet-visual';
import type { ShopItem } from '@/lib/shop-api';

/** [2026-11-12] 기존 5종. 이 다섯 개의 id·모양은 바꾸지 않는다. */
export type ClassicSpecialType = 'ocean' | 'cloud' | 'crystal' | 'nebula' | 'lava';
/** [2026-11-21] 신규 3종: 천상의 고리 · 공전하는 위성 · 별똥별 */
export type NewSpecialType = 'celestial_ring' | 'orbiting_moons' | 'shooting_stars';
export type SpecialType = ClassicSpecialType | NewSpecialType;

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
 * [ADDED 2026-11-12] 일기 작성 화면의 '오늘의 주제' 줄을 보일지 (선택 사항, 고르지 않아도 저장된다).
 * 고른 주제는 서버를 거쳐 AI 서비스에 일기와 함께 저장된다. false 로 바꾸면 줄이 숨겨진다.
 */
export const SHOW_TOPIC_PICKER = true;

/** 서버가 준 주제 값 → 앱이 아는 주제. 모르는 값·없음은 null(주제 없는 일기). */
export function asDiaryTopic(value: unknown): DiaryTopic | null {
  return typeof value === 'string' && DIARY_TOPICS.some((t) => t.id === value) ? (value as DiaryTopic) : null;
}

export const SPECIAL_NAMES: Record<SpecialType, string> = {
  ocean: '바다 행성',
  cloud: '구름 행성',
  crystal: '수정 행성',
  nebula: '성운 행성',
  lava: '용암 행성',
  celestial_ring: '천상의 고리 행성',
  orbiting_moons: '위성을 거느린 행성',
  shooting_stars: '별똥별 행성',
};

/** 효과 이름(상점·꾸미기 화면 칩). 서버 아이템 이름이 있으면 그것을 먼저 쓴다. */
export const EFFECT_LABELS: Record<SpecialType, { name: string; icon: string }> = {
  ocean: { name: '바다 효과', icon: '🌊' },
  cloud: { name: '구름 효과', icon: '☁️' },
  crystal: { name: '수정 효과', icon: '💎' },
  nebula: { name: '성운 효과', icon: '🌌' },
  lava: { name: '용암 효과', icon: '🌋' },
  celestial_ring: { name: '천상의 고리', icon: '💫' },
  orbiting_moons: { name: '공전하는 위성', icon: '🌙' },
  shooting_stars: { name: '별똥별', icon: '🌠' },
};

export const SPECIAL_TYPES = Object.keys(SPECIAL_NAMES) as SpecialType[];

export const NEW_SPECIAL_TYPES: readonly NewSpecialType[] = ['celestial_ring', 'orbiting_moons', 'shooting_stars'];

export function isNewSpecialType(type: SpecialType): type is NewSpecialType {
  return (NEW_SPECIAL_TYPES as readonly string[]).includes(type);
}

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
  types: {
    ocean: true,
    cloud: true,
    crystal: true,
    nebula: true,
    lava: true,
    celestial_ring: true,
    orbiting_moons: true,
    shooting_stars: true,
  } as Record<SpecialType, boolean>,
  maxNear: { low: 3, medium: 6, high: 10 } as Record<PlanetQuality, number>,
  nearDistance: 9,
  /**
   * [2026-11-22] 우주에서도 상점·꾸미기 미리보기와 똑같이(최고 단계) 그린다. false 면 위의 거리별 단계(예전 방식).
   * maxFull: 최고 단계로 그릴 효과 행성 수 상한(기기 사양별, 가까운 순서). 넘는 행성은 '가까이' 단계.
   */
  matchPreview: true,
  maxFull: { low: 8, medium: 24, high: 40 } as Record<PlanetQuality, number>,
  /** 저품질(휴대폰·행성 많음)에서는 가까운 행성도 입자를 그리지 않는다(선택한 행성만) */
  particlesWhenNear: { low: false, medium: true, high: true } as Record<PlanetQuality, boolean>,
  /**
   * [2026-11-25] 상세 장식(별가루·별빛 잔해·위성 잔상·광륜): 선택하거나 확대해서 가까이 본 행성에만.
   * 전체 우주에서는 효과 본체(고리·위성·별똥별)만 그려 화면이 복잡하지 않게 한다.
   * distance: 카메라와 이 거리 안이면 '확대해서 본 행성', max: 기기 사양별 최대 개수(가까운 순서)
   */
  detail: { distance: 6.5, max: { low: 1, medium: 4, high: 6 } as Record<PlanetQuality, number> },
};

/**
 * [2026-11-21] 신규 효과 크기(행성 반지름 R 기준 배수). 디자인을 보며 여기 값만 바꾸면 된다.
 * 행성 크기는 0.16~0.54라서, 배수만 쓰면 작은 행성의 효과는 안 보이고 큰 행성의 효과는 너무 넓어진다
 * → 표면에서 바깥으로 나가는 거리(R × (배수 − 1))를 minGap~maxGap 사이로 묶는다(effectReach).
 */
export const NEW_EFFECT_LAYOUT = {
  /** 표면 바깥으로 최소·최대 이만큼(화면 단위)까지만 나간다 */
  minGap: 0.1,
  maxGap: 0.5,
  /** 천상의 고리: 고리 3개의 반지름(배수)과 고리 폭(R 대비) */
  ring: { radii: [1.42, 1.6, 1.8], width: [0.1, 0.065, 0.05] },
  /** 공전하는 위성: 궤도 반지름 범위(배수)와 위성 크기(R 대비) */
  moons: { orbitMin: 1.5, orbitMax: 2.2, sizeMin: 0.17, sizeMax: 0.24 },
  /** 별똥별: 행성 둘레 이 범위(배수) 안에서만 지나간다 */
  stars: { reachMin: 1.35, reachMax: 2.4 },
};

/** 행성 반지름 R, 배수 k → 효과까지의 거리. R×k 를 쓰되 표면에서 나가는 거리를 minGap~maxGap 으로 묶는다. */
export function effectReach(radius: number, k: number): number {
  const gap = Math.min(Math.max(radius * (k - 1), NEW_EFFECT_LAYOUT.minGap), NEW_EFFECT_LAYOUT.maxGap);
  return radius + gap;
}

/**
 * 반지름 R 행성의 고리 n개 반지름(안쪽 → 바깥쪽). 작은 행성에서도 고리끼리 minSpacing 이상 떨어진다.
 */
export function ringRadii(radius: number, ks: readonly number[], minSpacing = 0.03): number[] {
  const out: number[] = [];
  for (const k of ks) {
    const r = effectReach(radius, k);
    out.push(out.length ? Math.max(r, out[out.length - 1] + minSpacing) : r);
  }
  return out;
}

/**
 * 공전하는 위성 배치(행성 id 고정 난수 rand 로 결정 → 같은 행성은 항상 같은 구성).
 * 위성끼리·행성과 부딪히지 않게: 궤도 반지름 간격 ≥ 위성 지름의 1.1배, 가장 안쪽 궤도 > R + 위성 크기 × 1.8.
 * kind: 0 진주(Pearl) · 1 수정(Crystal) · 2 발광(Glow)
 */
export function moonLayout(radius: number, rand: readonly number[]) {
  const L = NEW_EFFECT_LAYOUT.moons;
  const count = rand[0] < 0.45 ? 2 : 3;
  const out: { orbit: number; size: number; phase: number; speed: number; tiltX: number; tiltZ: number; kind: number }[] = [];
  const inner0 = effectReach(radius, L.orbitMin);
  const outer0 = effectReach(radius, L.orbitMax);
  const sizes = Array.from({ length: count }, (_, i) =>
    Math.min(Math.max(radius * (L.sizeMin + (L.sizeMax - L.sizeMin) * rand[1 + i]), 0.022), 0.075)
  );
  const biggest = Math.max(...sizes);
  const inner = Math.max(inner0, radius + biggest * 1.8);
  const spacing = Math.max((outer0 - inner) / Math.max(count - 1, 1), biggest * 2.2);
  const firstKind = Math.floor(rand[4] * 3);
  for (let i = 0; i < count; i++) {
    out.push({
      orbit: inner + spacing * i,
      size: sizes[i],
      phase: rand[5 + i] * Math.PI * 2,
      // 바깥 궤도일수록 느리게(케플러처럼), 행성마다 조금씩 다르게. 한 바퀴 약 25~60초.
      speed: (0.25 - 0.05 * i) * (0.8 + 0.4 * rand[8 + i]) * (rand[11] < 0.5 ? 1 : -1),
      tiltX: (rand[12 + i] - 0.5) * 0.9,
      tiltZ: (rand[15 + i] - 0.5) * 0.7,
      kind: (firstKind + i) % 3,
    });
  }
  return out;
}

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
