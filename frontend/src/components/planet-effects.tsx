// 특수 행성 효과(Ocean·Cloud·Crystal·Nebula·Lava). 행성 본체 메시·셰이더는 건드리지 않고, 본체 바깥에 독립 메시로 더한다.
//  - 색은 고정하지 않는다: 행성의 감정 대표색 계열(planetPalette)과 보조 감정 색에서 고른다(용암 행성이라고 붉게 만들지 않음).
//  - 본체를 가리지 않게: 대부분 색만 더하는 투명 막(가장자리 위주)이고, 깊이를 쓰지 않는다(수정 조각만 불투명).
//  - 단계(LOD, EffectTier): 0 멀리 = 바탕 층만 멈춘 채 / 1 가까이 = 애니메이션 + 입자 일부 / 2 선택 = 전부.
// 서버(AI)가 정한 유형: ai/src/special/selector.py, 화면 설정: src/lib/special-planet.ts
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import {
  AddEquation,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  ZeroFactor,
  type IUniform,
  type InstancedMesh,
  type Points,
  type ShaderMaterial,
  type Vector2,
} from 'three';

import { seededRandoms, type PlanetQuality } from '@/lib/planet-visual';
import { SPECIAL_EFFECT_SETTINGS, type EffectTier, type SpecialType } from '@/lib/special-planet';

/** 행성 셰이더와 같은 빛 방향(화면 기준 오른쪽 위, 옆에서 비스듬히) */
export const LIGHT_DIR_GLSL = 'const vec3 LIGHT_DIR = vec3(0.88, 0.36, 0.31);';

/** 화면 전체가 함께 쓰는 값(universe-scene의 SCENE_UNIFORMS): 선택 중 여부, 먼 행성 어둡게 */
export type SharedUniforms = { uFocus: { value: number }; uDepthFade: { value: Vector2 } };

/** 효과 단계: 카메라 거리·선택에 따라 UniverseScene이 주기적으로 정한다(행성 id → 단계). 없으면 0(멀리). */
export const EFFECT_TIERS = new Map<string, EffectTier>();

export type EffectPalette = { deep: string; base: string; tone: string; light: string; accent: string };

// 색만 더한다(캔버스 알파는 그대로). 투명 캔버스에서 테두리가 검게 보이지 않게(universe-scene 대기막과 같은 방식).
const ADDITIVE = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;
// 반투명하게 덮는다(구름). 캔버스 알파는 그대로.
const OVER = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

const NOISE_GLSL = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    return (0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 1.7) + 0.125 * vnoise(p * 4.1 + 9.2)) / 0.875;
  }
`;

// 선택 강조·먼 행성 어둡게(행성 본체와 같은 규칙)
const FADE_GLSL = `
  uniform float uHighlight;
  uniform float uFocus;
  uniform vec2 uDepthFade;
  float sceneFade(float viewZ) {
    return (1.0 - 0.45 * smoothstep(uDepthFade.x, uDepthFade.y, -viewZ))
         * (1.0 + 0.6 * uHighlight) * (1.0 - 0.35 * uFocus * (1.0 - uHighlight));
  }
`;

// ---------------------------------------------------------------- 행성을 감싸는 막(구) 공통 정점 셰이더
const SHELL_VERTEX = `
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vObj = normalize(position);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const SHELL_HEAD = `
  ${LIGHT_DIR_GLSL}
  ${NOISE_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uSeed;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
`;

// 바다: 반투명한 물 막 위로 흐르는 잔물결 빛(가는 선)과 가장자리의 물빛. 본체 색은 그대로 비친다.
const OCEAN_SHELL_FRAGMENT = `
  ${SHELL_HEAD}
  uniform vec3 uColor;
  uniform vec3 uDeep;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float mu = max(dot(n, v), 0.0);
    vec3 p = vObj;
    float w = fbm3(p * vec3(2.2, 3.5, 2.2) + uSeed + vec3(uTime * 0.12, 0.0, uTime * 0.05));
    // 위도를 따라 흐르는 물결 무늬: 가는 밝은 선만 남긴다
    float phase = p.y * 16.0 + w * 7.0 - uTime * 0.9;
    float ripple = pow(1.0 - abs(sin(phase)), 10.0);
    float sparkle = smoothstep(0.45, 0.8, vnoise(p * 7.0 + uSeed.yzx + uTime * 0.25));
    float lit = 0.3 + 0.7 * smoothstep(-0.2, 0.8, dot(n, LIGHT_DIR));
    float rim = pow(1.0 - mu, 2.5);
    vec3 col = uColor * (ripple * sparkle * 0.4 + rim * 0.45) * lit + uDeep * rim * 0.2;
    gl_FragColor = vec4(col * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// 구름: 천천히 흐르는 반투명 구름층(덮는 면적 약 3분의 1). 빛을 받는 쪽이 밝다.
const CLOUD_SHELL_FRAGMENT = `
  ${SHELL_HEAD}
  uniform vec3 uColor;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float a = uTime * 0.035;
    vec3 p = vec3(vObj.x * cos(a) - vObj.z * sin(a), vObj.y, vObj.x * sin(a) + vObj.z * cos(a));
    float c = fbm3(p * vec3(2.4, 5.0, 2.4) + uSeed + vec3(0.0, 0.0, uTime * 0.02));
    float cover = smoothstep(0.47, 0.7, c);
    float lit = 0.4 + 0.6 * smoothstep(-0.3, 0.8, dot(n, LIGHT_DIR));
    // 가장자리로 갈수록 조금 더 짙게(구름층의 두께감), 정면 가운데는 엷게 → 무늬가 비친다
    float mu = max(dot(n, v), 0.0);
    float alpha = cover * (0.45 + 0.3 * (1.0 - mu)) * uIntensity;
    gl_FragColor = vec4(uColor * lit * sceneFade(vViewPos.z), alpha);
    #include <colorspace_fragment>
  }
`;

// 성운 행성의 오로라: 극지방 위도에서 세로로 흔들리는 빛의 커튼
const AURORA_FRAGMENT = `
  ${SHELL_HEAD}
  uniform vec3 uC1;
  uniform vec3 uC2;
  void main() {
    vec3 p = vObj;
    float lat = abs(p.y);
    float band = smoothstep(0.6, 0.72, lat) * smoothstep(0.98, 0.82, lat);
    float lon = atan(p.z, p.x);
    float sway = vnoise(vec3(lon * 2.0, uTime * 0.18, p.y * 3.0) + uSeed);
    // 부드럽게 흔들리는 빛 무리(가는 세로줄이 아니라 번지는 빛)
    float curtain = smoothstep(0.35, 0.85, fbm3(vec3(lon * 4.0 + sway * 2.0, p.y * 5.0 - uTime * 0.25, uTime * 0.08) + uSeed.zxy));
    vec3 col = mix(uC1, uC2, smoothstep(0.55, 0.9, lat));
    float f = band * (0.35 + 0.65 * curtain) * (0.6 + 0.4 * sway);
    gl_FragColor = vec4(col * f * 0.3 * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// 용암 행성의 에너지 흐름: 표면 바로 위를 흐르는 가는 빛줄기(무늬를 덮지 않도록 아주 가늘게)
const LAVA_SHELL_FRAGMENT = `
  ${SHELL_HEAD}
  uniform vec3 uHot;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 p = vObj;
    float f = fbm3(p * 3.2 + uSeed + vec3(0.0, uTime * 0.35, uTime * 0.12));
    float vein = pow(1.0 - abs(2.0 * f - 1.0), 22.0);
    vein *= smoothstep(0.45, 0.7, vnoise(p * 1.6 + uSeed.zxy + vec3(uTime * 0.08, 0.0, 0.0)));
    float flicker = 0.75 + 0.25 * vnoise(p * 9.0 + uTime * 1.5);
    float mu = max(dot(n, normalize(-vViewPos)), 0.0);
    float rim = pow(1.0 - mu, 3.0);
    vec3 col = uHot * (vein * flicker * 0.45 + rim * 0.4);
    gl_FragColor = vec4(col * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- 성운: 행성 뒤의 화면 정렬 판(빌보드)
// 판은 행성 중심을 지나므로 행성 앞면이 판을 가린다 → 성운은 행성 둘레와 뒤로만 보인다.
const NEBULA_VERTEX = `
  uniform float uSize;
  varying vec2 vLocal;
  varying vec3 vViewPos;
  void main() {
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vLocal = position.xy * 2.0;
    vec4 mv = c + vec4(position.xy * uSize, 0.0, 0.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const NEBULA_FRAGMENT = `
  ${NOISE_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInner;
  uniform vec3 uSeed;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  varying vec2 vLocal;
  varying vec3 vViewPos;
  void main() {
    float r = length(vLocal);
    float ang = atan(vLocal.y, vLocal.x);
    // 느리게 도는 성운 결: 각도 방향으로 끌린 노이즈
    vec3 q = vec3(cos(ang + uTime * 0.03) * r * 2.0, sin(ang + uTime * 0.03) * r * 2.0, r * 1.5 + uTime * 0.04) + uSeed;
    float n1 = fbm3(q);
    float n2 = fbm3(q * 2.1 + 4.0);
    float mask = smoothstep(uInner * 0.9, uInner * 1.25, r) * (1.0 - smoothstep(0.55, 1.0, r));
    float wisp = smoothstep(0.42, 0.85, n1) * (0.6 + 0.4 * n2);
    vec3 col = mix(uC1, uC2, smoothstep(0.3, 0.8, n2));
    col = mix(col, uC3, 0.4 * smoothstep(0.6, 0.95, n1));
    float f = mask * wisp;
    gl_FragColor = vec4(col * f * 0.6 * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- 고리 모양 빛(용암 행성의 빛나는 궤도)
const ORBIT_VERTEX = `
  varying vec2 vLocal;
  varying vec3 vViewPos;
  void main() {
    vLocal = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const ORBIT_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec2 vLocal;
  varying vec3 vViewPos;
  void main() {
    float t = (length(vLocal) - uInner) / (uOuter - uInner);
    float line = pow(1.0 - abs(2.0 * t - 1.0), 2.0);
    float a = atan(vLocal.y, vLocal.x);
    // 궤도를 따라 도는 빛 덩어리 세 개
    float pulse = pow(0.5 + 0.5 * sin(a * 3.0 - uTime * 2.2), 10.0);
    vec3 col = mix(uCool, uHot, pulse) * line * (0.45 + 1.1 * pulse);
    gl_FragColor = vec4(col * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- 수정 조각(인스턴스, 불투명)
const CRYSTAL_VERTEX = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uOrbit;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vShade;
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  void main() {
    float ang = aSeed.x * 6.2832 + uTime * 0.22;
    float r = uOrbit * (0.9 + 0.2 * aSeed.z);
    vec3 center = vec3(cos(ang) * r, uOrbit * 0.14 * sin(ang * 2.0 + aSeed.y * 6.0), sin(ang) * r);
    mat3 R = rotY(uTime * (0.4 + 0.8 * aSeed.w) + aSeed.y * 6.0) * rotX(0.6 + aSeed.z * 2.0);
    float s = 0.65 + 0.6 * aSeed.w;
    vec3 lp = R * (position * vec3(s * 0.75, s * 1.35, s * 0.75)) + center;
    vNormalV = normalize(normalMatrix * (R * normal));
    vShade = aSeed.y;
    vec4 mv = modelViewMatrix * vec4(lp, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const CRYSTAL_FRAGMENT = `
  ${LIGHT_DIR_GLSL}
  ${FADE_GLSL}
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uIntensity;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vShade;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float ndl = dot(n, LIGHT_DIR);
    vec3 col = mix(uC1, uC2, vShade);
    // 면마다 다른 밝기(각진 결정) + 날카로운 반사 + 가장자리 빛
    vec3 lit = col * (0.25 + 0.75 * smoothstep(-0.2, 0.9, ndl));
    vec3 h = normalize(LIGHT_DIR + v);
    lit += vec3(1.0) * pow(max(dot(n, h), 0.0), 40.0) * 0.9;
    lit += col * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.5;
    gl_FragColor = vec4(lit * (0.7 + 0.3 * uIntensity) * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- 입자(종류마다 움직임이 다르다, 위치는 GPU에서 계산)
const PARTICLE_VERTEX = (motion: string) => `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uRadius;
  uniform float uSize;
  varying float vAlpha;
  varying float vMix;
  varying float vViewZ;
  const float TAU = 6.2832;
  void main() {
    vec3 pos;
    float alpha = 1.0;
    float size = 1.0;
    ${motion}
    vAlpha = alpha;
    vMix = aSeed.y;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * size * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const PARTICLE_FRAGMENT = `
  ${FADE_GLSL}
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uIntensity;
  varying float vAlpha;
  varying float vMix;
  varying float vViewZ;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 2.0) * vAlpha;
    if (a < 0.01) discard;
    vec3 col = mix(uC1, uC2, vMix);
    gl_FragColor = vec4(col * a * uIntensity * sceneFade(vViewZ), 1.0);
    #include <colorspace_fragment>
  }
`;

const MOTION: Record<SpecialType, string> = {
  // 물방울: 행성 둘레의 넓은 띠를 천천히 돌며 위아래로 출렁인다
  ocean: `
    float ang = aSeed.x * TAU + uTime * 0.18 * (0.6 + aSeed.y);
    float r = uRadius * (1.25 + 0.4 * aSeed.z);
    pos = vec3(cos(ang) * r, uRadius * (0.3 * (aSeed.w - 0.5) + 0.07 * sin(uTime * 1.3 + aSeed.x * 20.0)), sin(ang) * r);
    alpha = 0.55 + 0.35 * sin(uTime * 0.8 + aSeed.w * 12.0);
    size = 0.7 + 0.6 * aSeed.z;`,
  // 작은 빛 입자: 구름층 바깥을 아주 느리게 떠다닌다
  cloud: `
    vec3 d = normalize(aSeed.xyz * 2.0 - 1.0 + 0.001);
    float a = uTime * 0.05 * (0.5 + aSeed.w);
    d = vec3(d.x * cos(a) - d.z * sin(a), d.y, d.x * sin(a) + d.z * cos(a));
    pos = d * uRadius * (1.2 + 0.35 * fract(aSeed.w + uTime * 0.015));
    alpha = 0.45 + 0.35 * sin(uTime * 0.6 + aSeed.x * 30.0);`,
  // 반짝임: 수정 궤도 근처에서 짧게 반짝인다
  crystal: `
    float ang = aSeed.x * TAU + uTime * 0.22;
    float r = uRadius * 1.7 * (0.85 + 0.3 * aSeed.z);
    pos = vec3(cos(ang) * r, uRadius * 0.35 * (aSeed.w - 0.5), sin(ang) * r);
    alpha = pow(max(sin(uTime * 2.2 + aSeed.y * 40.0), 0.0), 10.0);
    size = 1.2;`,
  // 은은한 빛 입자: 성운 안에서 느리게 맴돈다
  nebula: `
    vec3 d = normalize(aSeed.xyz * 2.0 - 1.0 + 0.001);
    float a = uTime * 0.04;
    d = vec3(d.x * cos(a) - d.z * sin(a), d.y * 0.6, d.x * sin(a) + d.z * cos(a));
    pos = normalize(d) * uRadius * (1.45 + 0.8 * aSeed.w);
    alpha = 0.35 + 0.25 * sin(uTime * 0.5 + aSeed.x * 17.0);`,
  // 불꽃: 표면에서 나선을 그리며 피어올라 사라진다
  lava: `
    float life = fract(aSeed.w + uTime * 0.32 * (0.7 + 0.6 * aSeed.z));
    float ang = aSeed.x * TAU + uTime * 0.5 + life * 1.8;
    float r = uRadius * (1.04 + 0.85 * life);
    pos = vec3(cos(ang) * r, uRadius * (aSeed.y - 0.5) * 1.7 * (1.0 - 0.3 * life), sin(ang) * r);
    alpha = pow(1.0 - life, 1.5) * smoothstep(0.0, 0.08, life);
    size = 1.3 - 0.7 * life;`,
};

const PARTICLE_COUNT: Record<SpecialType, number> = { ocean: 28, cloud: 16, crystal: 18, nebula: 22, lava: 30 };
const PARTICLE_SIZE: Record<SpecialType, number> = { ocean: 0.05, cloud: 0.045, crystal: 0.06, nebula: 0.05, lava: 0.055 };
const CRYSTAL_COUNT = 7;

/** 대표색 계열에서 효과 색을 고른다(색상은 대표색 그대로, 밝기·채도만 조절). */
function effectColors(p: EffectPalette) {
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

type EffectProps = {
  id: string;
  type: SpecialType;
  radius: number;
  palette: EffectPalette;
  intensity: number;
  speed: number;
  quality: PlanetQuality;
  /** 행성 선택 강조 값(0~1, Planet이 매 프레임 갱신) */
  highlight: { current: number };
  shared: SharedUniforms;
};

/** 특수 행성 효과 하나. Planet의 위치·기울기 그룹 안에 둔다(자전 그룹 밖 → 효과는 자기 속도로 움직인다). */
export function SpecialEffect({ id, type, radius, palette, intensity, speed, quality, highlight, shared }: EffectProps) {
  // 효과마다 재질은 최대 두 개(막·판·궤도) + 입자 하나
  const mat0 = useRef<ShaderMaterial>(null);
  const mat1 = useRef<ShaderMaterial>(null);
  const matP = useRef<ShaderMaterial>(null);
  const pointsRef = useRef<Points>(null);
  const crystalMesh = useRef<InstancedMesh>(null);
  const time = useRef(0);
  const colors = useMemo(() => effectColors(palette), [palette]);
  const rand = useMemo(() => seededRandoms(`${id}:fx`, 3), [id]);
  const segs = quality === 'low' ? 20 : quality === 'medium' ? 32 : 40;

  const common = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uHighlight: { value: 0 },
      uFocus: shared.uFocus,
      uDepthFade: shared.uDepthFade,
      uSeed: { value: [rand[0] * 30, rand[1] * 30, rand[2] * 30] },
    }),
    [intensity, shared, rand]
  );
  const shellUniforms = useMemo(
    () => ({
      ocean: { ...common, uColor: { value: colors.water }, uDeep: { value: colors.base } },
      cloud: { ...common, uColor: { value: colors.cloud } },
      aurora: { ...common, uC1: { value: colors.light }, uC2: { value: colors.accent.clone().lerp(colors.light, 0.4) } },
      lava: { ...common, uHot: { value: colors.hot } },
      nebula: {
        ...common,
        uSize: { value: radius * 3.4 },
        uInner: { value: 1 / 3.4 },
        uC1: { value: colors.base },
        uC2: { value: colors.light },
        uC3: { value: colors.accent },
      },
      orbit: { ...common, uInner: { value: radius * 1.56 }, uOuter: { value: radius * 1.64 }, uHot: { value: colors.hot }, uCool: { value: colors.base } },
      crystal: { ...common, uOrbit: { value: radius * 1.7 }, uC1: { value: colors.crystalA }, uC2: { value: colors.crystalB } },
      particle: {
        ...common,
        uRadius: { value: radius },
        uSize: { value: PARTICLE_SIZE[type] * (radius / 0.3) },
        uC1: { value: type === 'lava' ? colors.hot : colors.light },
        uC2: { value: type === 'nebula' ? colors.accent : type === 'lava' ? colors.base : new Color('#ffffff') },
      },
    }),
    [common, colors, radius, type]
  );

  const particleSeeds = useMemo(() => {
    const n = PARTICLE_COUNT[type];
    return new Float32BufferAttribute(seededRandoms(`${id}:p`, n * 4), 4);
  }, [id, type]);
  const particlePositions = useMemo(() => new Float32BufferAttribute(new Float32Array(PARTICLE_COUNT[type] * 3), 3), [type]);
  const crystalSeeds = useMemo(() => new InstancedBufferAttribute(new Float32Array(seededRandoms(`${id}:c`, CRYSTAL_COUNT * 4)), 4), [id]);

  useFrame((_, delta) => {
    const sel = highlight.current > 0.5;
    const tier: EffectTier = sel ? 2 : (EFFECT_TIERS.get(id) ?? 0);
    // 멀리 있으면 멈춘다(바탕 층만 보임). 선택하면 조금 더 생기 있게.
    if (tier > 0) time.current += delta * speed * SPECIAL_EFFECT_SETTINGS.speed * (tier === 2 ? 1.25 : 1);
    for (const m of [mat0.current, mat1.current, matP.current]) {
      if (!m) continue;
      m.uniforms.uTime.value = time.current;
      m.uniforms.uHighlight.value = highlight.current;
    }
    const pts = pointsRef.current;
    if (pts) {
      const near = tier === 1 && SPECIAL_EFFECT_SETTINGS.particlesWhenNear[quality];
      pts.visible = tier === 2 || near;
      pts.geometry.setDrawRange(0, tier === 2 ? PARTICLE_COUNT[type] : Math.ceil(PARTICLE_COUNT[type] / 2));
    }
    // 멀리 있으면 수정 조각 3개만
    if (crystalMesh.current) crystalMesh.current.count = tier === 0 ? 3 : CRYSTAL_COUNT;
  });

  const shell = (scale: number, frag: string, uniforms: Record<string, IUniform>, ref: typeof mat0, blend: typeof ADDITIVE | typeof OVER) => (
    <mesh raycast={() => null} renderOrder={2}>
      <sphereGeometry args={[radius * scale, segs, Math.round(segs * 0.75)]} />
      <shaderMaterial ref={ref} uniforms={uniforms} vertexShader={SHELL_VERTEX} fragmentShader={frag} {...blend} />
    </mesh>
  );

  const particles = (
    <points ref={pointsRef} raycast={() => null} frustumCulled={false} renderOrder={3}>
      <bufferGeometry>
        <primitive attach="attributes-position" object={particlePositions} />
        <primitive attach="attributes-aSeed" object={particleSeeds} />
      </bufferGeometry>
      <shaderMaterial
        ref={matP}
        uniforms={shellUniforms.particle}
        vertexShader={PARTICLE_VERTEX(MOTION[type])}
        fragmentShader={PARTICLE_FRAGMENT}
        {...ADDITIVE}
      />
    </points>
  );

  switch (type) {
    case 'ocean':
      return (
        <group>
          {shell(1.03, OCEAN_SHELL_FRAGMENT, shellUniforms.ocean, mat0, ADDITIVE)}
          {particles}
        </group>
      );
    case 'cloud':
      return (
        <group>
          {shell(1.06, CLOUD_SHELL_FRAGMENT, shellUniforms.cloud, mat0, OVER)}
          {particles}
        </group>
      );
    case 'crystal':
      return (
        <group rotation={[0.35, 0, -0.2]}>
          <instancedMesh ref={crystalMesh} args={[undefined, undefined, CRYSTAL_COUNT]} raycast={() => null} frustumCulled={false}>
            <octahedronGeometry args={[radius * 0.16, 0]}>
              <primitive attach="attributes-aSeed" object={crystalSeeds} />
            </octahedronGeometry>
            <shaderMaterial ref={mat0} uniforms={shellUniforms.crystal} vertexShader={CRYSTAL_VERTEX} fragmentShader={CRYSTAL_FRAGMENT} />
          </instancedMesh>
          {particles}
        </group>
      );
    case 'nebula':
      return (
        <group>
          <mesh raycast={() => null} renderOrder={1}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              ref={mat0}
              uniforms={shellUniforms.nebula}
              vertexShader={NEBULA_VERTEX}
              fragmentShader={NEBULA_FRAGMENT}
              side={DoubleSide}
              {...ADDITIVE}
            />
          </mesh>
          {shell(1.03, AURORA_FRAGMENT, shellUniforms.aurora, mat1, ADDITIVE)}
          {particles}
        </group>
      );
    case 'lava':
      return (
        <group>
          {shell(1.025, LAVA_SHELL_FRAGMENT, shellUniforms.lava, mat0, ADDITIVE)}
          <mesh rotation={[Math.PI / 2 + 0.4, 0.25, 0]} raycast={() => null} renderOrder={2}>
            <ringGeometry args={[radius * 1.56, radius * 1.64, quality === 'low' ? 48 : 96, 1]} />
            <shaderMaterial
              ref={mat1}
              uniforms={shellUniforms.orbit}
              vertexShader={ORBIT_VERTEX}
              fragmentShader={ORBIT_FRAGMENT}
              side={DoubleSide}
              {...ADDITIVE}
            />
          </mesh>
          {particles}
        </group>
      );
  }
}
