// 특수 행성 효과(Ocean·Cloud·Crystal·Nebula·Lava). 행성 본체 메시·셰이더는 건드리지 않고, 본체 바깥에 독립 메시로 더한다.
//  - 색은 고정하지 않는다: 행성의 감정 대표색 계열(planetPalette)과 보조 감정 색에서 고른다(용암 행성이라고 붉게 만들지 않음).
//  - 본체를 가리지 않게: 대부분 색만 더하는 투명 막(가장자리 위주)이고, 깊이를 쓰지 않는다(수정 조각만 불투명).
//  - 단계(LOD, EffectTier): 0 멀리 = 바탕 층만 멈춘 채 / 1 가까이 = 애니메이션 + 입자 일부 / 2 선택 = 전부.
// [2026-11-12] 유형은 사용자가 상점에서 산 효과를 직접 적용한 값(DiaryEntry.effect). 화면 설정: src/lib/special-planet.ts
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Euler,
  Matrix4,
  Vector3,
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
} from 'three';

import { seededRandoms } from '@/lib/planet-visual';
import { SPECIAL_EFFECT_SETTINGS, isNewSpecialType, type ClassicSpecialType, type EffectTier } from '@/lib/special-planet';
import { NewSpecialEffect } from './planet-effects-new';
// [2026-11-21] 기존 5종과 신규 3종이 함께 쓰는 값은 planet-effects-shared.ts 로 옮겼다(내용 그대로). 이 파일에서 그대로 다시 내보낸다.
import {
  EFFECT_TIERS,
  FADE_GLSL,
  LIGHT_DIR_GLSL,
  NO_DIM,
  effectColors,
  type EffectProps,
} from './planet-effects-shared';
export {
  EFFECT_DETAIL,
  EFFECT_TIERS,
  FADE_GLSL,
  LIGHT_DIR_GLSL,
  NO_DIM,
  effectColors,
  type EffectPalette,
  type EffectProps,
  type SharedUniforms,
} from './planet-effects-shared';





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
// [2026-11-25] 미리 곱한 알파: 색 = 덮는 색×덮는 양 + 빛, 아래는 (1 − 덮는 양)만큼 비친다. 캔버스 알파는 그대로(용암 암석).
const PREMULT = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;
// [2026-11-26] 반투명하게 덮으면서 캔버스 알파도 쌓는다(행성 둘레 빈 우주 위의 구름도 보이게)
const OVER_A = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
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

// [REWRITE 2026-11-25] 용암 행성: 어두운 암석 판 + 불규칙한 균열 + 균열에서 나오는 선명한 빛(용암).
//  - 암석: 세포 노이즈(가까운 두 점 거리 차이)로 나눈 판. 색은 감정 대표색을 아주 어둡게(고정 검정·빨강 아님). 거친 결.
//  - 균열: 판 경계. 폭이 곳곳에서 달라 불규칙하고, 안쪽은 감정 에너지 색(hot)으로 밝게, 가장자리 암석이 열기로 달아오른다.
//  - 움직임: 균열 속 용암 밝기가 천천히 흘러간다(맥동·번개 같은 깜빡임 없음). 작은 불꽃은 입자(아래 MOTION.lava).
//  - 오로라 리본과 다르게: 부드러운 빛의 띠가 아니라 각진 판과 갈라진 틈(거친 지질 구조)이다.
//  - 섞기: 미리 곱한 알파(PREMULT). 암석은 몸통을 덮어 어둡게(덮는 양 ≤ 0.8 → 감정 무늬가 판 사이로 조금 비친다), 빛은 더한다.
const LAVA_SHELL_FRAGMENT = `
  ${SHELL_HEAD}
  uniform vec3 uHot;
  uniform vec3 uRock;
  vec3 lHash(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  // 세포 노이즈: 가장 가까운 점까지(F1)·두 번째(F2). F2 - F1 이 작을수록 판 경계(균열)
  vec2 lCells(vec3 x) {
    vec3 cn = floor(x);
    vec3 cf = fract(x);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int k = -1; k <= 1; k++)
      for (int j = -1; j <= 1; j++)
        for (int i = -1; i <= 1; i++) {
          vec3 g = vec3(float(i), float(j), float(k));
          vec3 r = g + lHash(cn + g) * 0.85 - cf;
          float d = dot(r, r);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
    return vec2(sqrt(f1), sqrt(f2));
  }
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 p = vObj;
    // 판 경계를 조금 흔들어 직선이 아닌 갈라진 틈으로
    vec3 x = p * 2.5 + uSeed + (vec3(vnoise(p * 5.0 + uSeed), vnoise(p * 5.0 + uSeed.yzx + 3.1), vnoise(p * 5.0 + uSeed.zxy + 6.7)) - 0.5) * 0.55;
    vec2 c = lCells(x);
    float gap = c.y - c.x;
    float width = 0.03 + 0.07 * vnoise(p * 3.0 + uSeed.zxy);
    float crack = 1.0 - smoothstep(0.0, width, gap);
    float heat = exp(-gap * 14.0);
    float flow = 0.55 + 0.45 * vnoise(p * 4.5 + vec3(0.0, -uTime * 0.22, uTime * 0.08) + uSeed.yzx);
    // 암석: 어둡고 거친 결, 빛 받는 쪽만 조금 보인다
    float rough = fbm3(p * 10.0 + uSeed) * 0.6 + vnoise(p * 26.0 + uSeed.zxy) * 0.4;
    float lit = 0.22 + 0.78 * smoothstep(-0.2, 0.9, dot(n, LIGHT_DIR));
    vec3 rock = uRock * (0.45 + 0.75 * rough) * lit;
    float cover = (1.0 - crack) * 0.8;
    // 작은 불씨: 균열 근처에서 드물게 반짝인다
    float ember = smoothstep(0.82, 0.95, vnoise(p * 30.0 + vec3(uTime * 0.6, 0.0, 0.0) + uSeed)) * heat;
    vec3 glow = uHot * (crack * (0.75 + 0.75 * flow) + heat * 0.3 * flow + ember * 0.8);
    glow = mix(glow, vec3(1.0), crack * flow * 0.07);
    float fade = sceneFade(vViewPos.z);
    gl_FragColor = vec4((rock * cover + glow * uIntensity) * fade, cover);
    #include <colorspace_fragment>
  }
`;

// [2026-11-26] 구름 효과: 행성 둘레를 감싸는 뭉게구름(화면을 향한 판, 성운과 같은 방식).
// 판은 행성 중심을 지나므로 행성 앞면이 판 안쪽을 가린다 → 구름은 행성 외곽 바로 바깥에서 둘레를 감싸며 천천히 돈다.
// 뭉게구름 모양 = 빌로우 노이즈, 외곽은 들쭉날쭉. 빛 쪽(오른쪽 위)이 밝고 반대쪽은 그늘(감정 색 계열 밝은 색).
const CLOUD_HALO_FRAGMENT = `
  ${NOISE_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInner;
  uniform vec3 uSeed;
  uniform vec3 uColor;
  uniform vec3 uShade;
  varying vec2 vLocal;
  varying vec3 vViewPos;
  void main() {
    float r = length(vLocal);
    float ang = atan(vLocal.y, vLocal.x) + uTime * 0.025;
    vec2 q = vec2(cos(ang), sin(ang)) * r;
    // 뭉게구름 덩어리: 큰 덩어리(n) 안에 작은 몽글함(billow). 띠를 꽉 채우지 않고 덩어리 사이는 비운다.
    float n = fbm3(vec3(q * 2.6, uTime * 0.02) + uSeed);
    float billow = 1.0 - abs(2.0 * fbm3(vec3(q * 6.0, 1.7 + uTime * 0.015) + uSeed.yzx) - 1.0);
    // 행성 바로 바깥이 가장 짙고, 바깥으로 갈수록 드문드문(외곽선은 들쭉날쭉)
    float d = (r - uInner) / uInner;                       // 행성 외곽에서 0, 바깥으로 증가
    float near = smoothstep(-0.06, 0.02, d) * (1.0 - smoothstep(0.12, 0.42 + 0.12 * n, d));
    float dens = n * 0.62 + billow * 0.38 + near * 0.22 - 0.1;
    float puff = smoothstep(0.52, 0.72, dens) * near;
    float a = puff * 0.9 * uIntensity;
    if (a < 0.004) discard;
    vec2 L = normalize(vec2(0.88, 0.36));
    float lit = 0.5 + 0.5 * dot(vLocal / max(r, 1e-4), L);
    // 밝은 솜구름(빛 쪽은 거의 흰빛, 반대쪽도 회색이 아니라 밝은 감정 색 그늘)
    vec3 col = mix(uShade, uColor, clamp(0.45 + lit * 0.4 + billow * 0.25, 0.0, 1.0)) * 1.08;
    gl_FragColor = vec4(col * sceneFade(vViewPos.z), a);
    #include <colorspace_fragment>
  }
`;

// [2026-11-26 2차] 바다 효과: 행성을 감싸며 흘러가는 불규칙한 물줄기(물 튀김 리본) 세 개.
//  - 모양: 기울기·반지름이 다른 고리 위의 넓은 띠. 고리 전체가 아니라 몇 조각으로 끊겨 있고, 조각이 고리를 따라 흘러간다.
//    폭이 곳곳에서 달라지고 가장자리는 물 튀김처럼 들쭉날쭉. 띠 자체도 위아래로 출렁이고 비틀린다(정점 셰이더).
//  - 재질: 반투명한 물(감정 색 계열 물빛) + 두꺼운 가장자리는 조금 진하게 + 흐르는 흰 하이라이트 결.
//  - 뒤쪽은 옅게(행성 뒤로 지나가는 부분은 깊이 판정으로 가려진다), 앞쪽은 또렷하게.
const OCEAN_STREAM_VERTEX = `
  attribute float aRing;
  attribute float aU;
  attribute float aEdge;
  attribute vec3 aAxis;
  uniform float uRadius;
  uniform float uTime;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  const float TAU = 6.2832;
  void main() {
    vRing = aRing;
    vU = aU;
    vEdge = aEdge;
    // 출렁임(고리 축 방향으로 오르내림) + 비틀림(폭 방향 양 끝이 반대로) + 안팎으로 부풀었다 줄어듦
    float ph = aU * TAU;
    float wave = sin(ph * 2.0 + uTime * 0.5 + aRing * 1.7) * 0.6 + sin(ph * 5.0 - uTime * 0.8 + aRing * 3.1) * 0.25;
    float twist = cos(ph * 3.0 + uTime * 0.6 + aRing * 2.3);
    vec3 p = position * (1.0 + 0.05 * sin(ph * 4.0 + uTime * 0.7 + aRing));
    p += aAxis * uRadius * (0.1 * wave + 0.07 * aEdge * twist);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vFront = clamp((mv.z - c.z) / uRadius * 0.5 + 0.5, 0.0, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const OCEAN_STREAM_FRAGMENT = `
  ${NOISE_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uWater;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  const float TAU = 6.2832;
  void main() {
    float sp = vRing < 0.5 ? 0.05 : (vRing < 1.5 ? -0.04 : 0.032);
    float uu = vU + uTime * sp;                                   // 고리를 따라 흘러가는 좌표
    // 조각: 고리 전체가 아니라 몇 덩이로 끊긴 물줄기
    float piece = vnoise(vec3(uu * 3.2, vRing * 7.0, uTime * 0.04));
    float present = smoothstep(0.46, 0.62, piece);
    // 폭: 곳곳에서 넓어졌다 좁아진다
    float wn = vnoise(vec3(uu * 8.0, vRing * 3.0 + 1.0, uTime * 0.08));
    float wprof = (0.12 + 0.88 * wn * wn * (3.0 - 2.0 * wn)) * present;
    // 물 튀김 가장자리: 들쭉날쭉(조각 끝으로 갈수록 더 거칠게 튄다)
    float fringe = ((vnoise(vec3(uu * 70.0, vEdge * 3.0, uTime * 0.35 + vRing)) - 0.5) * 0.3
                 + (vnoise(vec3(uu * 24.0, vEdge * 2.0 + 4.0, uTime * 0.25)) - 0.5) * 0.22) * (1.4 - present);
    float e = abs(vEdge);
    float inside = 1.0 - smoothstep(wprof - 0.05 + fringe, wprof + 0.02 + fringe, e);
    if (inside < 0.01) discard;
    // 가장자리 쪽은 물이 두꺼워 조금 진하고 밝은 테두리
    float rim = smoothstep(wprof - 0.28, wprof, e - fringe * 0.4);
    // 안쪽을 흐르는 흰 하이라이트 결
    float flow = vnoise(vec3(uu * 22.0, vEdge * 2.0, uTime * 0.2));
    float streak = pow(0.5 + 0.5 * sin(uu * TAU * 13.0 + vEdge * 5.0 + flow * 6.0), 14.0);
    // 물결 윤곽선(진한 물빛의 가는 선): 물이 접히고 휘는 결
    float lines = pow(1.0 - abs(sin(uu * TAU * 7.0 + vEdge * 3.5 + flow * 4.0)), 16.0);
    vec3 col = mix(uWater, uDeep, clamp(rim * 0.6 + lines * 0.55, 0.0, 1.0));
    col += uFoam * (streak * 0.8 + rim * 0.22);
    float alpha = (0.36 + rim * 0.4 + streak * 0.35 + lines * 0.25) * inside * mix(0.4, 1.0, vFront) * uIntensity;
    gl_FragColor = vec4(col * sceneFade(vViewPos.z), alpha);
    #include <colorspace_fragment>
  }
`;

/** 바다 물줄기 고리 3개(반지름·기울기 다름)를 지오메트리 하나로. aRing = 몇 번째, aU = 둘레 위치 0~1, aEdge = 폭 방향 −1~1, aAxis = 고리 축(출렁임 방향) */
function buildStreamGeometry(radius: number, segments: number) {
  const rings = [
    { r: 1.34, w: 0.62, tx: 0.42, tz: -0.25 },
    { r: 1.6, w: 0.5, tx: -0.55, tz: 0.32 },
    { r: 1.84, w: 0.38, tx: 1.05, tz: 0.55 },
  ];
  const pos: number[] = [];
  const ring: number[] = [];
  const u: number[] = [];
  const edge: number[] = [];
  const axis: number[] = [];
  const index: number[] = [];
  const v = new Vector3();
  const ax = new Vector3();
  rings.forEach((rg, k) => {
    const m = new Matrix4().makeRotationFromEuler(new Euler(rg.tx, 0, rg.tz));
    ax.set(0, 1, 0).applyMatrix4(m).normalize();
    const base = pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = t * Math.PI * 2;
      for (const e of [-1, 1]) {
        const rr = radius * (rg.r + (e * rg.w) / 2);
        v.set(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        ring.push(k);
        u.push(t);
        edge.push(e);
        axis.push(ax.x, ax.y, ax.z);
      }
      if (i < segments) {
        const o = base + i * 2;
        index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aRing', new BufferAttribute(new Float32Array(ring), 1));
  g.setAttribute('aU', new BufferAttribute(new Float32Array(u), 1));
  g.setAttribute('aEdge', new BufferAttribute(new Float32Array(edge), 1));
  g.setAttribute('aAxis', new BufferAttribute(new Float32Array(axis), 3));
  g.setIndex(index);
  return g;
}

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

const MOTION: Record<ClassicSpecialType, string> = {
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

const PARTICLE_COUNT: Record<ClassicSpecialType, number> = { ocean: 40, cloud: 16, crystal: 18, nebula: 22, lava: 30 };
const PARTICLE_SIZE: Record<ClassicSpecialType, number> = { ocean: 0.05, cloud: 0.045, crystal: 0.06, nebula: 0.05, lava: 0.055 };
const CRYSTAL_COUNT = 7;

/** 특수 행성 효과 하나. Planet의 위치·기울기 그룹 안에 둔다(자전 그룹 밖 → 효과는 자기 속도로 움직인다). */

/**
 * [2026-11-21] 효과 종류에 따라 기존 5종(ClassicEffect, 아래 코드 그대로) 또는 신규 3종(planet-effects-new.tsx)을 그린다.
 * 훅이 없는 갈래 함수라 종류마다 컴포넌트가 따로다(Planet 이 효과를 바꾸면 key 로 통째로 내리고 새로 만든다).
 */
export function SpecialEffect(props: EffectProps) {
  if (isNewSpecialType(props.type)) return <NewSpecialEffect {...props} type={props.type} />;
  return <ClassicEffect {...props} type={props.type} />;
}

/** 기존 5종(바다·구름·수정·성운·용암). [2026-11-21] 이름만 SpecialEffect → ClassicEffect, 내용은 그대로. */
function ClassicEffect({ id, type, radius, palette, intensity, speed, quality, highlight, dim = NO_DIM, shared, fixedTier }: EffectProps & { type: ClassicSpecialType }) {
  // 효과마다 재질은 최대 두 개(막·판·궤도) + 입자 하나
  const mat0 = useRef<ShaderMaterial>(null);
  const mat1 = useRef<ShaderMaterial>(null);
  // [2026-11-26] 구름 둘레 판 / 바다 빛줄기
  const mat2 = useRef<ShaderMaterial>(null);
  const streamGeo = useMemo(() => (type === 'ocean' ? buildStreamGeometry(radius, quality === 'low' ? 64 : 128) : null), [type, radius, quality]);
  useEffect(() => () => streamGeo?.dispose(), [streamGeo]);
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
      uDim: { value: 0 },
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
      // [2026-11-26] 구름 둘레(판 크기 = 반지름 × 3 → 판 좌표 1 = 1.5R, 행성 외곽 = 1/1.5)
      cloudHalo: {
        ...common,
        uSize: { value: radius * 3.0 },
        uInner: { value: 1 / 1.5 },
        uColor: { value: colors.cloud },
        uShade: { value: colors.cloud.clone().lerp(colors.light, 0.5).multiplyScalar(0.82) },
      },
      // [2026-11-26] 바다 물줄기: 반투명 물빛(감정 색 계열) · 두꺼운 가장자리는 조금 진하게 · 흰 하이라이트
      oceanStream: {
        ...common,
        uRadius: { value: radius },
        uWater: { value: colors.base.clone().lerp(colors.light, 0.45).lerp(colors.accent, 0.15) },
        uDeep: { value: colors.base.clone().multiplyScalar(0.62) },
        uFoam: { value: colors.light.clone().lerp(new Color('#ffffff'), 0.85) },
      },
      aurora: { ...common, uC1: { value: colors.light }, uC2: { value: colors.accent.clone().lerp(colors.light, 0.4) } },
      lava: { ...common, uHot: { value: colors.hot }, uRock: { value: colors.base.clone().lerp(colors.deep, 0.7).multiplyScalar(0.22) } },
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
    const tier: EffectTier = fixedTier ?? (sel ? 2 : (EFFECT_TIERS.get(id) ?? 0));
    // 멀리 있으면 멈춘다(바탕 층만 보임). 선택하면 조금 더 생기 있게.
    if (tier > 0) time.current += delta * speed * SPECIAL_EFFECT_SETTINGS.speed * (tier === 2 ? 1.25 : 1);
    for (const m of [mat0.current, mat1.current, mat2.current, matP.current]) {
      if (!m) continue;
      m.uniforms.uTime.value = time.current;
      m.uniforms.uHighlight.value = highlight.current;
      if (m.uniforms.uDim) m.uniforms.uDim.value = dim.current;
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

  const shell = (scale: number, frag: string, uniforms: Record<string, IUniform>, ref: typeof mat0, blend: typeof ADDITIVE | typeof OVER | typeof PREMULT) => (
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
          {/* [2026-11-26] 행성을 감싸며 흘러가는 불규칙한 물줄기(물 튀김 리본) */}
          {streamGeo ? (
            <mesh geometry={streamGeo} raycast={() => null} renderOrder={2} frustumCulled={false}>
              <shaderMaterial
                ref={mat2}
                uniforms={shellUniforms.oceanStream}
                vertexShader={OCEAN_STREAM_VERTEX}
                fragmentShader={OCEAN_STREAM_FRAGMENT}
                side={DoubleSide}
                {...OVER_A}
              />
            </mesh>
          ) : null}
          {particles}
        </group>
      );
    case 'cloud':
      return (
        <group>
          {/* [2026-11-26] 행성 둘레를 감싸는 뭉게구름(행성 앞면이 판 안쪽을 가린다) */}
          <mesh raycast={() => null} renderOrder={1}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              ref={mat2}
              uniforms={shellUniforms.cloudHalo}
              vertexShader={NEBULA_VERTEX}
              fragmentShader={CLOUD_HALO_FRAGMENT}
              side={DoubleSide}
              {...OVER_A}
            />
          </mesh>
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
          {shell(1.012, LAVA_SHELL_FRAGMENT, shellUniforms.lava, mat0, PREMULT)}
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
