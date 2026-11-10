// 특수 행성(Ocean·Cloud·Crystal·Nebula·Lava)과 일기 주제(선택). 서버(AI) 형식: ai/src/special/design.py
// 행성 본체(감정 색·무늬·크기·위치)는 그대로이고, 특수 행성은 본체 바깥에 효과만 더한다.
import type { PlanetQuality } from '@/lib/planet-visual';

export type SpecialType = 'ocean' | 'cloud' | 'crystal' | 'nebula' | 'lava';

export type PlanetDesign = {
  version: string;
  planetType: 'normal' | 'special';
  specialType: SpecialType | null;
  emotionCore: {
    primaryEmotion: string;
    primaryEmotionName: string;
    state: string;
    colors: string[];
    pattern: string;
    size: number | null;
  };
  specialEffects: Record<'waterAura' | 'cloudLayer' | 'crystals' | 'nebula' | 'lavaEnergy', boolean>;
  effectParameters: { intensity: number; speed: number } | null;
  selection: {
    score: number | null;
    threshold: number | null;
    candidate: SpecialType | null;
    candidateName: string | null;
    typeName: string | null;
    topic: DiaryTopic | null;
    topicName: string | null;
    reason: string | null;
  };
};

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

export const SPECIAL_NAMES: Record<SpecialType, string> = {
  ocean: '바다 행성',
  cloud: '구름 행성',
  crystal: '수정 행성',
  nebula: '성운 행성',
  lava: '용암 행성',
};

/**
 * 특수 효과 설정. 여기서 효과를 끄거나(enabled, types) 애니메이션 속도(speed)를 바꿀 수 있다.
 * 장기 사용자(행성이 많을 때)를 위한 단계(LOD):
 *  - 선택한 행성(마우스 올림·누름): 모든 효과 + 입자 전부 + 애니메이션
 *  - 가까운 특수 행성(카메라와 nearDistance 이내, 가까운 순서로 maxNear개까지): 효과 + 입자 절반 + 애니메이션
 *  - 그 밖(멀리 있는 행성): 효과의 바탕 층만 멈춘 채로(입자 없음, 애니메이션 없음)
 */
export const SPECIAL_EFFECT_SETTINGS = {
  enabled: true,
  speed: 1,
  types: { ocean: true, cloud: true, crystal: true, nebula: true, lava: true } as Record<SpecialType, boolean>,
  maxNear: { low: 3, medium: 6, high: 10 } as Record<PlanetQuality, number>,
  nearDistance: 9,
  /** 저품질(휴대폰·행성 많음)에서는 가까운 행성도 입자를 그리지 않는다(선택한 행성만) */
  particlesWhenNear: { low: false, medium: true, high: true } as Record<PlanetQuality, boolean>,
};

/** 서버 설계에서 그릴 특수 효과 종류. 일반 행성·효과 꺼짐·알 수 없는 값이면 null. */
export function specialTypeOf(design: PlanetDesign | null | undefined): SpecialType | null {
  if (!SPECIAL_EFFECT_SETTINGS.enabled || !design || design.planetType !== 'special') return null;
  const t = design.specialType;
  return t && t in SPECIAL_NAMES && SPECIAL_EFFECT_SETTINGS.types[t] ? t : null;
}

/** 효과 단계: 0 멀리(바탕만, 정지), 1 가까이(효과·입자 일부), 2 선택(전부) */
export type EffectTier = 0 | 1 | 2;
