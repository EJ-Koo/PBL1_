// [NEW FILE 2026-11-21] 신규 특수 효과 3종: 천상의 고리(celestial_ring) · 공전하는 위성(orbiting_moons) · 별똥별(shooting_stars).
// [2026-11-25] 디자인 강화: 고리마다 다른 결·고리를 따라 도는 빛의 파동·별가루 / 위성 재질(진주·결정·발광)·궤도 잔상·광륜 /
//   별똥별의 긴 꼬리·곡선 경로·지나간 뒤 흩어지는 별빛·간헐적 연속 별똥별.
//
// 기존 5종(planet-effects.tsx)과 같은 규칙을 따른다.
//  - 행성 본체(감정 색·무늬·크기·위치)는 건드리지 않는다. Planet 의 위치·기울기 그룹 안에 둔 독립 메시라 행성이 움직이면(별자리 포함) 함께 움직인다.
//  - 색은 고정하지 않는다: 행성의 감정 대표색 계열(밝은 색·대표색·보조 감정 색)에서 고르고, 하이라이트만 흰빛을 섞는다.
//  - 클릭: 모든 메시가 광선 검사에서 빠진다(raycast = null) → 고리·위성·별똥별을 눌러도 행성 클릭과 겹치지 않는다.
//  - 단계(LOD): EFFECT_TIERS(0 멀리 / 1 가까이 / 2 선택). 별자리 밖으로 어둡게 한 행성은 고리 단순화·위성 궤도선 숨김·별똥별 끔.
//  - 상세 장식(별가루·별빛 잔해·위성 잔상·광륜 일부)은 선택·확대해서 본 행성·미리보기에서만(uDetail, EFFECT_DETAIL).
//    전체 우주에서는 효과 본체만 → 화면이 복잡하지 않고 다른 행성 탐색을 가리지 않는다. 저품질(휴대폰)은 입자 수를 줄인다.
//  - 크기: 행성 반지름에 비례하되 표면 바깥 거리는 최소·최대로 묶는다(special-planet.ts NEW_EFFECT_LAYOUT·effectReach).
//  - 지오메트리는 효과마다 몇 개만 만들고, 컴포넌트가 사라지면(효과 해제·변경·행성 삭제) 직접 정리한다.
//    매 프레임 바꾸는 값은 시간·강조·어둡게·상세 정도뿐이다(위치는 셰이더가 시간으로 계산).
//  - 빛 효과는 색을 더하면서 캔버스 알파도 빛 세기만큼 올린다(빈 우주 위에서도 보이게, 2026-11-19 별자리 선과 같은 방식).
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber/native';
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Euler,
  InstancedBufferAttribute,
  Matrix3,
  Matrix4,
  OneFactor,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type Points,
  type ShaderMaterial,
} from 'three';

import { seededRandoms, type PlanetQuality } from '@/lib/planet-visual';
import {
  NEW_EFFECT_LAYOUT,
  SPECIAL_EFFECT_SETTINGS,
  effectReach,
  moonLayout,
  ringRadii,
  type EffectTier,
  type NewSpecialType,
} from '@/lib/special-planet';

import { EFFECT_DETAIL, EFFECT_TIERS, FADE_GLSL, LIGHT_DIR_GLSL, NO_DIM, effectColors, type EffectProps } from './planet-effects-shared';

// 색을 더하고 알파도 빛 세기만큼 더한다(셰이더 끝에서 a = 가장 밝은 색 성분)
const GLOW = {
  transparent: true,
  depthWrite: false,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: OneFactor,
  blendDst: OneFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneFactor,
} as const;
const ALPHA_FROM_LIGHT = 'gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);';

/**
 * 단계별 설정(조절용). ringParticles: 고리 위 빛 입자 수, moonsVisible: 보이는 위성 수 상한, starSlots/starChance: 별똥별 수·등장 비율.
 * [2026-11-25] dust·debris: 상세 장식 입자 수(품질별). 상세(선택·확대·미리보기)일 때만 그린다.
 */
export const NEW_EFFECT_LOD = {
  ringParticles: [0, 10, 24] as const,
  moonsVisible: [2, 3, 3] as const,
  starSlots: [1, 2, 3] as const,
  /** 주기마다 별똥별이 실제로 나타날 비율(멀리서는 드물게) */
  starChance: [0.35, 0.75, 1] as const,
  dust: { low: 36, medium: 80, high: 110 } as Record<PlanetQuality, number>,
  debrisPerStar: { low: 5, medium: 10, high: 12 } as Record<PlanetQuality, number>,
};
const DUST_MAX = 110;
const DEBRIS_MAX = 12;

/** 행성마다 고정된 값(같은 행성은 늘 같은 기울기·색 배치·위성 구성) */
function useSeeds(id: string, tag: string, n: number) {
  return useMemo(() => seededRandoms(`${id}:${tag}`, n), [id, tag, n]);
}

/**
 * 효과 공통: 단계·시간·강조·어둡게·상세 값을 매 프레임 재질에 넣는다. 멀리(0)에서는 시간을 멈춘다(alwaysRun 이면 계속).
 * 상세(0~1, 부드럽게): 미리보기(단계 고정 2)·선택·확대해서 본 행성(EFFECT_DETAIL)이면 1. 별자리 밖으로 어둡게 하면 0.
 */
function useEffectClock(
  id: string,
  props: Pick<EffectProps, 'highlight' | 'dim' | 'fixedTier' | 'speed'>,
  mats: { current: ShaderMaterial | null }[],
  opts: { alwaysRun?: boolean; onTier?: (tier: EffectTier, dim: number, detail: number) => void } = {}
) {
  const time = useRef(0);
  const detailNow = useRef(props.fixedTier === 2 ? 1 : 0);
  const dim = props.dim ?? NO_DIM;
  useFrame((_, delta) => {
    const sel = props.highlight.current > 0.5;
    const tier: EffectTier = props.fixedTier ?? (sel ? 2 : (EFFECT_TIERS.get(id) ?? 0));
    if (tier > 0 || opts.alwaysRun) time.current += Math.min(delta, 0.1) * props.speed * SPECIAL_EFFECT_SETTINGS.speed;
    const want =
      props.fixedTier !== undefined ? (props.fixedTier === 2 ? 1 : 0) : (sel || EFFECT_DETAIL.has(id)) && dim.current <= 0.05 ? 1 : 0;
    detailNow.current += (want - detailNow.current) * Math.min(1, delta * 3);
    if (Math.abs(detailNow.current - want) < 0.002) detailNow.current = want;
    for (const ref of mats) {
      const m = ref.current;
      if (!m) continue;
      m.uniforms.uTime.value = time.current;
      m.uniforms.uHighlight.value = props.highlight.current;
      m.uniforms.uDim.value = dim.current;
      if (m.uniforms.uTier) m.uniforms.uTier.value = tier;
      if (m.uniforms.uDetail) m.uniforms.uDetail.value = detailNow.current;
    }
    opts.onTier?.(tier, dim.current, detailNow.current);
  });
}

function commonUniforms(props: EffectProps) {
  return {
    uTime: { value: 0 },
    uTier: { value: 0 },
    uDetail: { value: props.fixedTier === 2 ? 1 : 0 },
    uIntensity: { value: props.intensity },
    uHighlight: { value: 0 },
    uDim: { value: 0 },
    uFocus: props.shared.uFocus,
    uDepthFade: props.shared.uDepthFade,
  };
}

/** 지오메트리를 컴포넌트가 사라질 때 정리한다(효과 해제·변경·행성 삭제) */
function useDisposeOnUnmount(...items: { dispose: () => void }[]) {
  useEffect(
    () => () => {
      for (const it of items) it.dispose();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    items
  );
}

/** 위치는 셰이더가 계산하는 점 구름(position 은 개수만 맞춘 빈 값) */
function pointCloud(count: number, attrs: Record<string, { data: number[]; size: number }>) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  for (const [name, a] of Object.entries(attrs)) g.setAttribute(name, new BufferAttribute(new Float32Array(a.data), a.size));
  return g;
}

const tiltMatrix = (x: number, z: number) => new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(x, 0, z)));

// 부드러운 점(별가루·잔해·광륜 공용): 둥근 빛, cross > 0 이면 가는 십자 반짝임
const SOFT_POINT_FRAGMENT = `
  ${FADE_GLSL}
  uniform vec3 uC1;
  uniform float uIntensity;
  uniform float uCross;
  varying float vAlpha;
  varying float vViewZ;
  varying vec3 vTint;
  void main() {
    if (vAlpha < 0.004) discard;
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    float glow = pow(max(1.0 - d, 0.0), 2.2);
    float cr = max(exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 5.0), exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 5.0)) * (1.0 - d);
    float a = (glow + cr * uCross) * vAlpha;
    if (a < 0.006) discard;
    gl_FragColor = vec4(vTint * a * uIntensity * sceneFade(vViewZ), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;

// ---------------------------------------------------------------- 가는 빛 고리(천상의 고리·위성 궤도선 공용)
type RingSpec = { radius: number; width: number; tiltX: number; tiltZ: number };

/** 고리 여러 개를 지오메트리 하나로: 고리마다 기울어진 평면의 얇은 띠(aRing = 몇 번째 고리, aU = 둘레 위치 0~1, aEdge = 폭 방향 −1~1) */
function buildRingGeometry(rings: RingSpec[], segments: number) {
  const pos: number[] = [];
  const ring: number[] = [];
  const u: number[] = [];
  const edge: number[] = [];
  const index: number[] = [];
  const v = new Vector3();
  rings.forEach((r, k) => {
    const m = new Matrix4().makeRotationFromEuler(new Euler(r.tiltX, 0, r.tiltZ));
    const base = pos.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = t * Math.PI * 2;
      for (const e of [-1, 1]) {
        const rr = r.radius + (e * r.width) / 2;
        v.set(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        ring.push(k);
        u.push(t);
        edge.push(e);
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
  g.setIndex(index);
  return g;
}

const RING_VERTEX = `
  attribute float aRing;
  attribute float aU;
  attribute float aEdge;
  uniform float uRadius;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  void main() {
    vRing = aRing;
    vU = aU;
    vEdge = aEdge;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // 행성 중심보다 카메라 쪽이면 1(앞쪽 고리를 밝게, 뒤쪽은 어둡게 → 행성을 감싸는 입체감)
    vFront = clamp((mv.z - c.z) / uRadius * 0.5 + 0.5, 0.0, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// 천상의 고리: 고리마다 결이 다르다 — 안쪽 = 여러 겹의 가는 띠(행성 고리처럼), 가운데 = 가늘고 또렷한 심 + 점점이 빛,
// 바깥 = 넓고 희미한 먼지 띠. 둘레를 따라 이동하는 빛의 파동, 몇 군데에서 부드럽게 반짝이는 별빛.
// 뒤쪽 고리는 어둡게(행성 뒤로 지나가는 부분은 깊이 판정으로 가려짐), 앞쪽은 밝게.
const CELESTIAL_RING_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
  uniform float uDetail;
  uniform float uIntensity;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uGlint;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  void main() {
    float e = abs(vEdge);
    float k = vRing;
    float flowOn = min(uTier, 1.0);
    vec3 col = k < 0.5 ? uC0 : (k < 1.5 ? uC1 : uC2);
    float body;
    if (k < 0.5) {
      float bands = 0.5 + 0.5 * sin(vEdge * 10.0 + 0.6) * sin(vEdge * 27.0 + 1.3);
      body = (1.0 - e * e) * (0.3 + 0.7 * bands) * 0.85 + exp(-e * e * 30.0) * 0.3;
    } else if (k < 1.5) {
      float core = exp(-e * e * 16.0);
      float dots = pow(0.5 + 0.5 * sin(6.2832 * vU * 54.0 + uTime * 0.6), 8.0);
      body = core * 0.95 + (1.0 - e) * 0.1 + core * dots * 0.55 * flowOn;
    } else {
      float dust = 0.55 + 0.45 * sin(6.2832 * vU * 7.0 + 1.3) * sin(6.2832 * vU * 17.0 + uTime * 0.05);
      body = (1.0 - e) * (1.0 - e) * 0.5 * dust;
    }
    // 빛의 파동: 고리를 따라 이동하는 밝은 물결(고리마다 속도·방향 다름), 뒤따르는 작은 물결 하나
    float speed = k < 0.5 ? 0.055 : (k < 1.5 ? -0.04 : 0.028);
    float ph = fract(vU - uTime * speed + k * 0.37);
    float wave = exp(-pow(ph - 0.5, 2.0) * 160.0) + 0.5 * exp(-pow(fract(ph + 0.42) - 0.5, 2.0) * 300.0);
    // 부드러운 별빛 반짝임: 한 바퀴에 세 군데, 천천히 이동하며 숨 쉬듯 밝아진다
    float glint = pow(0.5 + 0.5 * sin(6.2832 * (vU * 3.0 + uTime * 0.018) + k * 1.7), 24.0) * (0.55 + 0.45 * sin(uTime * 1.1 + k * 2.0));
    vec3 c = mix(col, uGlint, clamp(wave * 0.55 + glint * 0.7, 0.0, 1.0));
    float centre = exp(-e * e * 7.0);
    float amt = body * (0.72 + 0.28 * flowOn) + (wave * 0.85 * flowOn + glint * 0.9 * (0.35 + 0.65 * flowOn)) * centre;
    amt *= mix(0.3, 1.0, smoothstep(0.2, 0.8, vFront));
    float strength = (k < 0.5 ? 1.0 : (k < 1.5 ? 0.8 : 0.6));
    // 별자리 밖으로 어둡게 한 행성: 바깥 두 고리를 지우고 안쪽 고리만(단순화)
    strength *= mix(1.0, step(k, 0.5), step(0.05, uDim));
    gl_FragColor = vec4(c * amt * strength * 1.05 * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;

// 고리 위를 천천히 도는 작은 빛 입자(가까이부터). 고리 기울기는 uniform 행렬로.
const RING_PARTICLE_VERTEX = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uRingR;
  uniform mat3 uRot0;
  uniform mat3 uRot1;
  uniform mat3 uRot2;
  uniform float uSize;
  uniform vec3 uC1;
  varying float vAlpha;
  varying float vViewZ;
  varying vec3 vTint;
  const float TAU = 6.2832;
  void main() {
    float k = floor(aSeed.x * 2.999);
    float r = k < 0.5 ? uRingR.x : (k < 1.5 ? uRingR.y : uRingR.z);
    float a = aSeed.y * TAU + uTime * (0.08 + 0.05 * aSeed.z) * (k < 0.5 ? 1.0 : -1.0);
    vec3 p = vec3(cos(a) * r, 0.0, sin(a) * r);
    p = k < 0.5 ? uRot0 * p : (k < 1.5 ? uRot1 * p : uRot2 * p);
    vAlpha = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed.w) + aSeed.z * 40.0), 3.0);
    vTint = mix(uC1, vec3(1.0), 0.5);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * (0.6 + 0.8 * aSeed.w) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
// [2026-11-25] 별가루: 고리 둘레에 얇게 퍼진 아주 작은 빛 먼지(상세일 때만). 고리 폭의 몇 배 안에서 위아래로 조금 흩어진다.
const RING_DUST_VERTEX = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uDetail;
  uniform vec3 uRingR;
  uniform vec3 uRingW;
  uniform mat3 uRot0;
  uniform mat3 uRot1;
  uniform mat3 uRot2;
  uniform float uSize;
  uniform vec3 uC1;
  uniform vec3 uC2;
  varying float vAlpha;
  varying float vViewZ;
  varying vec3 vTint;
  const float TAU = 6.2832;
  void main() {
    float k = floor(aSeed.x * 2.999);
    float r = k < 0.5 ? uRingR.x : (k < 1.5 ? uRingR.y : uRingR.z);
    float wdt = k < 0.5 ? uRingW.x : (k < 1.5 ? uRingW.y : uRingW.z);
    float j1 = fract(aSeed.z * 13.7) - 0.5;
    float j2 = fract(aSeed.w * 7.3) - 0.5;
    r += j1 * wdt * 3.2;
    float a = aSeed.y * TAU + uTime * (0.035 + 0.03 * aSeed.w) * (k < 0.5 ? 1.0 : -1.0);
    vec3 p = vec3(cos(a) * r, j2 * wdt * 1.8, sin(a) * r);
    p = k < 0.5 ? uRot0 * p : (k < 1.5 ? uRot1 * p : uRot2 * p);
    vAlpha = uDetail * (0.2 + 0.8 * pow(0.5 + 0.5 * sin(uTime * (0.7 + aSeed.z * 1.6) + aSeed.w * 30.0), 4.0));
    vTint = mix(mix(uC1, uC2, aSeed.z), vec3(1.0), 0.35);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * (0.35 + 0.55 * aSeed.z) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const RING_TILTS = [
  { tiltX: 0.02, tiltZ: -0.24 },
  { tiltX: 0.16, tiltZ: -0.1 },
  { tiltX: -0.12, tiltZ: -0.36 },
];

function CelestialRing(props: EffectProps) {
  const { id, radius, palette, quality } = props;
  const rand = useSeeds(id, 'ring', 4);
  const colors = useMemo(() => effectColors(palette), [palette]);
  const L = NEW_EFFECT_LAYOUT.ring;
  const radii = useMemo(() => ringRadii(radius, L.radii), [radius, L.radii]);
  const specs = useMemo<RingSpec[]>(
    () =>
      radii.map((r, i) => ({
        radius: r,
        // 고리 폭: 행성 반지름 비례, 아주 작은 행성에서도 보이게 하한
        width: Math.max(radius * L.width[i], 0.008),
        // 고리마다 기울기가 확실히 다르고, 행성마다도 조금씩 다르다(고정 난수)
        tiltX: RING_TILTS[i].tiltX + (rand[0] - 0.5) * 0.25,
        tiltZ: RING_TILTS[i].tiltZ + (rand[1] - 0.5) * 0.3,
      })),
    [radii, radius, L.width, rand]
  );
  const geometry = useMemo(() => buildRingGeometry(specs, quality === 'low' ? 64 : 128), [specs, quality]);
  const sparkGeo = useMemo(() => pointCloud(24, { aSeed: { data: seededRandoms(`${id}:ringp`, 24 * 4), size: 4 } }), [id]);
  const dustGeo = useMemo(() => pointCloud(DUST_MAX, { aSeed: { data: seededRandoms(`${id}:dust`, DUST_MAX * 4), size: 4 } }), [id]);
  useDisposeOnUnmount(geometry, sparkGeo, dustGeo);

  const white = useMemo(() => new Color('#ffffff'), []);
  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
    const rot = {
      uRingR: { value: new Vector3(radii[0], radii[1], radii[2]) },
      uRot0: { value: tiltMatrix(specs[0].tiltX, specs[0].tiltZ) },
      uRot1: { value: tiltMatrix(specs[1].tiltX, specs[1].tiltZ) },
      uRot2: { value: tiltMatrix(specs[2].tiltX, specs[2].tiltZ) },
    };
    // 안쪽 고리 = 대표색 계열 밝은 색(금빛 하이라이트), 바깥 고리 = 보조 감정 색·밝은 색으로 더 투명하게
    return {
      ring: {
        ...c,
        uRadius: { value: radius },
        uC0: { value: colors.hot.clone().lerp(white, 0.35) },
        uC1: { value: colors.accent.clone().lerp(colors.light, 0.35) },
        uC2: { value: colors.light.clone().lerp(white, 0.25) },
        uGlint: { value: colors.light.clone().lerp(white, 0.75) },
      },
      spark: { ...c, ...rot, uSize: { value: Math.max(radius, 0.2) * 0.16 }, uC1: { value: colors.light }, uCross: { value: 0.8 } },
      dust: {
        ...c,
        ...rot,
        uRingW: { value: new Vector3(specs[0].width, specs[1].width, specs[2].width) },
        uSize: { value: Math.max(radius, 0.2) * 0.075 },
        uC1: { value: colors.light },
        uC2: { value: colors.accent.clone().lerp(colors.light, 0.5) },
        uCross: { value: 0 },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, radii, specs, props.intensity, props.shared, white]);

  const matRing = useRef<ShaderMaterial>(null);
  const matSpark = useRef<ShaderMaterial>(null);
  const matDust = useRef<ShaderMaterial>(null);
  const sparks = useRef<Points>(null);
  const dust = useRef<Points>(null);
  useEffectClock(id, props, [matRing, matSpark, matDust], {
    onTier: (tier, dim, detail) => {
      const pts = sparks.current;
      if (pts) {
        const n = dim > 0.05 ? 0 : NEW_EFFECT_LOD.ringParticles[tier];
        pts.visible = n > 0;
        pts.geometry.setDrawRange(0, n);
      }
      if (dust.current) {
        dust.current.visible = detail > 0.01;
        dust.current.geometry.setDrawRange(0, NEW_EFFECT_LOD.dust[quality]);
      }
    },
  });

  return (
    <group>
      <mesh geometry={geometry} raycast={() => null} renderOrder={2} frustumCulled={false}>
        <shaderMaterial ref={matRing} uniforms={uniforms.ring} vertexShader={RING_VERTEX} fragmentShader={CELESTIAL_RING_FRAGMENT} side={2} {...GLOW} />
      </mesh>
      <points ref={sparks} geometry={sparkGeo} raycast={() => null} frustumCulled={false} renderOrder={3}>
        <shaderMaterial ref={matSpark} uniforms={uniforms.spark} vertexShader={RING_PARTICLE_VERTEX} fragmentShader={SOFT_POINT_FRAGMENT} {...GLOW} />
      </points>
      <points ref={dust} geometry={dustGeo} raycast={() => null} frustumCulled={false} renderOrder={3} visible={false}>
        <shaderMaterial ref={matDust} uniforms={uniforms.dust} vertexShader={RING_DUST_VERTEX} fragmentShader={SOFT_POINT_FRAGMENT} {...GLOW} />
      </points>
    </group>
  );
}

// ---------------------------------------------------------------- 공전하는 위성
// 위성 = 인스턴스 메시 하나(구 지오메트리 하나를 함께 씀). 궤도 위치는 셰이더에서 시간으로 계산(DB 저장 없음).
// 위성은 불투명이라 깊이를 쓴다 → 행성 뒤로 가면 자연스럽게 가려지고 앞으로 오면 행성을 가린다.
// 같은 궤도 계산(MOON_CENTER_GLSL)을 위성·광륜이 함께 쓴다. 궤도선(링)의 둘레 위치 aU 는 위성 각도/2π 와 같다.
const MOON_CENTER_GLSL = `
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  vec3 moonCenter(vec4 orbit, vec4 shape, float t) {
    float ang = orbit.z + t * orbit.w;
    return rotX(shape.x) * rotZ(shape.y) * vec3(cos(ang) * orbit.x, 0.0, sin(ang) * orbit.x);
  }
`;
const MOON_VERTEX = `
  attribute vec4 aOrbit;   // 궤도 반지름, 위성 크기, 처음 각도, 속도
  attribute vec4 aShape;   // 기울기 X, 기울기 Z, 종류(0 진주 / 1 결정 / 2 발광), 고정 난수
  uniform float uTime;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;
  varying float vKind;
  varying float vSeed;
  ${MOON_CENTER_GLSL}
  void main() {
    vec3 center = moonCenter(aOrbit, aShape, uTime);
    // 스스로 천천히 돈다(결정면 반짝임·진주 결이 움직이게)
    float spin = uTime * (0.3 + aShape.w * 0.4);
    float cs = cos(spin), sn = sin(spin);
    vec3 lp = vec3(position.x * cs - position.z * sn, position.y, position.x * sn + position.z * cs);
    vObj = normalize(lp);
    vKind = aShape.z;
    vSeed = aShape.w;
    vNormalV = normalize(normalMatrix * normalize(lp));
    vec4 mv = modelViewMatrix * vec4(center + lp * aOrbit.y, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const MOON_FRAGMENT = `
  ${LIGHT_DIR_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
  uniform float uDetail;
  uniform vec3 uPearl;
  uniform vec3 uCrystal;
  uniform vec3 uGlow;
  uniform vec3 uSheen;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;
  varying float vKind;
  varying float vSeed;
  void main() {
    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float ndl = dot(n, LIGHT_DIR);
    float mu = max(dot(n, v), 0.0);
    float rim = pow(1.0 - mu, 2.5);
    float detail = clamp(uTier, 0.0, 1.0) * 0.5 + 0.5 * uDetail;
    vec3 col;
    if (vKind < 0.5) {
      // 진주: 불투명한 새틴. 은은한 가로 결 + 부드러운 넓은 광택 + 가장자리 진주빛(오리엔트)
      float band = 0.93 + 0.07 * sin(vObj.y * 16.0 + vSeed * 6.0 + sin(vObj.x * 5.0) * 1.2);
      vec3 base = uPearl * band;
      vec3 lit = base * (0.32 + 0.72 * smoothstep(-0.45, 1.0, ndl));
      vec3 irid = 0.78 + 0.22 * cos(6.2832 * (rim * 1.2 + vSeed + vec3(0.0, 0.33, 0.67)));
      lit += mix(uSheen, irid, 0.5) * rim * (0.3 + 0.3 * detail);
      lit += mix(base, vec3(1.0), 0.6) * pow(max(dot(n, normalize(LIGHT_DIR + v)), 0.0), 14.0) * (0.22 + 0.25 * detail);
      col = lit;
    } else if (vKind < 1.5) {
      // 결정: 면 법선(화면 미분) → 각진 면마다 밝기가 다르고, 빛과 맞는 면은 통째로 번쩍인다
      vec3 nf = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
      if (dot(nf, v) < 0.0) nf = -nf;
      float f = 0.22 + 0.78 * smoothstep(-0.2, 1.0, dot(nf, LIGHT_DIR));
      vec3 lit = uCrystal * f;
      float flash = pow(max(dot(nf, normalize(LIGHT_DIR + v)), 0.0), 40.0);
      vec3 disp = 0.7 + 0.3 * cos(6.2832 * (dot(nf, vec3(1.3, 2.1, 0.7)) + vec3(0.0, 0.33, 0.67)));
      lit += mix(vec3(1.0), disp, 0.5) * flash * (0.8 + 0.6 * detail);
      lit += uCrystal * pow(1.0 - max(dot(nf, v), 0.0), 2.0) * 0.45;
      col = lit;
    } else {
      // 발광: 스스로 빛나는 작은 구슬(밤면도 밝다). 속이 더 밝고 가장자리로 번진다. 둘레 광륜은 별도 점(MoonHalo).
      float pulse = 0.92 + 0.08 * sin(uTime * 1.4 + vSeed * 10.0);
      col = uGlow * (0.75 + 0.25 * smoothstep(-0.5, 1.0, ndl)) * pulse + mix(uGlow, vec3(1.0), 0.6) * pow(mu, 3.0) * 0.45 * pulse;
      col += mix(uGlow, vec3(1.0), 0.4) * rim * 0.5;
    }
    gl_FragColor = vec4(col * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;
// 위성 광륜: 발광 위성은 늘 은은한 빛 무리, 진주·결정 위성은 상세일 때만 아주 옅게
const MOON_HALO_VERTEX = `
  attribute vec4 aOrbit;
  attribute vec4 aShape;
  uniform float uTime;
  uniform float uDetail;
  uniform float uScale;
  uniform float uCount;
  uniform vec3 uGlow;
  uniform vec3 uPearl;
  uniform vec3 uCrystal;
  varying float vAlpha;
  varying float vViewZ;
  varying vec3 vTint;
  attribute float aIndex;
  ${MOON_CENTER_GLSL}
  void main() {
    vec3 center = moonCenter(aOrbit, aShape, uTime);
    float glowMoon = step(1.5, aShape.z);
    vAlpha = step(aIndex + 0.5, uCount) * mix(0.14 * uDetail, 0.42, glowMoon) * (0.9 + 0.1 * sin(uTime * 1.4 + aShape.w * 10.0));
    vTint = aShape.z < 0.5 ? uPearl : (aShape.z < 1.5 ? uCrystal : uGlow);
    vec4 mv = modelViewMatrix * vec4(center, 1.0);
    vViewZ = mv.z;
    gl_PointSize = aOrbit.y * mix(4.0, 5.5, glowMoon) * uScale * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
// 위성 궤도선: 아주 희미한 가는 고리(가까이부터) + 위성 뒤를 따라가는 빛의 잔상(상세일 때)
const ORBIT_LINE_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
  uniform float uDetail;
  uniform float uIntensity;
  uniform vec3 uC0;
  uniform vec3 uTrail;
  uniform vec3 uPhase;
  uniform vec3 uSpeed;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  const float TAU = 6.2832;
  void main() {
    float core = exp(-vEdge * vEdge * 10.0);
    float dash = 0.85 + 0.15 * sin(TAU * vU * 24.0);
    float show = clamp(uTier, 0.0, 1.0) * (1.0 - step(0.05, uDim));
    float ph = vRing < 0.5 ? uPhase.x : (vRing < 1.5 ? uPhase.y : uPhase.z);
    float sp = vRing < 0.5 ? uSpeed.x : (vRing < 1.5 ? uSpeed.y : uSpeed.z);
    float a = vU * TAU;
    float m = ph + uTime * sp;
    float d = sp >= 0.0 ? mod(m - a, TAU) : mod(a - m, TAU);
    float trail = exp(-d * 2.6) * uDetail;
    vec3 c = uC0 * dash * 0.26 + uTrail * trail * 0.9;
    gl_FragColor = vec4(c * core * (0.45 + 0.55 * vFront) * show * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;

function OrbitingMoons(props: EffectProps) {
  const { id, radius, palette, quality } = props;
  const rand = useSeeds(id, 'moons', 18);
  const colors = useMemo(() => effectColors(palette), [palette]);
  const moons = useMemo(() => moonLayout(radius, rand), [radius, rand]);
  const white = useMemo(() => new Color('#ffffff'), []);
  const orbitData = useMemo(() => moons.flatMap((m) => [m.orbit, m.size, m.phase, m.speed]), [moons]);
  const shapeData = useMemo(() => moons.flatMap((m, i) => [m.tiltX, m.tiltZ, m.kind, rand[i]]), [moons, rand]);
  const orbitGeometry = useMemo(
    () =>
      buildRingGeometry(
        moons.map((m) => ({ radius: m.orbit, width: Math.max(m.size * 0.18, 0.004), tiltX: m.tiltX, tiltZ: m.tiltZ })),
        quality === 'low' ? 64 : 128
      ),
    [moons, quality]
  );
  // 위성 구: 효과마다 하나(위성별 궤도 값을 인스턴스 속성으로 붙이므로 다른 행성과 함께 쓰지 않는다).
  // 결정 위성의 면이 보이도록 분할을 낮게(면 법선으로 각진 면을 만든다).
  const sphere = useMemo(() => {
    const g = new SphereGeometry(1, quality === 'low' ? 10 : 14, quality === 'low' ? 7 : 10);
    g.setAttribute('aOrbit', new InstancedBufferAttribute(new Float32Array(orbitData), 4));
    g.setAttribute('aShape', new InstancedBufferAttribute(new Float32Array(shapeData), 4));
    return g;
  }, [orbitData, shapeData, quality]);
  const haloGeo = useMemo(
    () =>
      pointCloud(moons.length, {
        aOrbit: { data: orbitData, size: 4 },
        aShape: { data: shapeData, size: 4 },
        aIndex: { data: moons.map((_, i) => i), size: 1 },
      }),
    [moons, orbitData, shapeData]
  );
  useDisposeOnUnmount(orbitGeometry, sphere, haloGeo);

  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
    const pearl = colors.light.clone().lerp(white, 0.4);
    const crystal = colors.accent.clone().lerp(white, 0.3);
    const glow = colors.light.clone().lerp(colors.accent, 0.3).lerp(white, 0.2);
    const pick = (f: (m: (typeof moons)[number]) => number) => {
      const v = [0, 1, 2].map((i) => (moons[i] ? f(moons[i]) : 0));
      return new Vector3(v[0], v[1], v[2]);
    };
    return {
      moon: { ...c, uPearl: { value: pearl }, uCrystal: { value: crystal }, uGlow: { value: glow }, uSheen: { value: colors.accent.clone().lerp(white, 0.5) } },
      halo: { ...c, uScale: { value: 1 }, uCount: { value: moons.length }, uGlow: { value: glow }, uPearl: { value: pearl }, uCrystal: { value: crystal }, uC1: { value: glow }, uCross: { value: 0 } },
      orbit: {
        ...c,
        uRadius: { value: radius },
        uC0: { value: colors.light.clone().lerp(white, 0.5) },
        uTrail: { value: colors.light.clone().lerp(white, 0.3) },
        uPhase: { value: pick((m) => m.phase) },
        uSpeed: { value: pick((m) => m.speed) },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, moons, props.intensity, props.shared, white]);

  const matMoon = useRef<ShaderMaterial>(null);
  const matOrbit = useRef<ShaderMaterial>(null);
  const matHalo = useRef<ShaderMaterial>(null);
  const mesh = useRef<InstancedMesh>(null);
  const orbitMesh = useRef<Mesh>(null);
  useEffectClock(id, props, [matMoon, matOrbit, matHalo], {
    onTier: (tier, dim) => {
      // 멀리: 위성 2개까지, 별자리 밖(어둡게 함): 1개만 · 궤도선 숨김
      const count = Math.min(moons.length, dim > 0.05 ? 1 : NEW_EFFECT_LOD.moonsVisible[tier]);
      if (mesh.current) mesh.current.count = count;
      if (matHalo.current) matHalo.current.uniforms.uCount.value = count;
      if (orbitMesh.current) orbitMesh.current.visible = tier > 0 && dim <= 0.05;
    },
  });

  return (
    <group>
      <instancedMesh key={sphere.uuid} ref={mesh} args={[sphere, undefined, moons.length]} raycast={() => null} frustumCulled={false}>
        <shaderMaterial ref={matMoon} uniforms={uniforms.moon} vertexShader={MOON_VERTEX} fragmentShader={MOON_FRAGMENT} />
      </instancedMesh>
      <points geometry={haloGeo} raycast={() => null} frustumCulled={false} renderOrder={3}>
        <shaderMaterial ref={matHalo} uniforms={uniforms.halo} vertexShader={MOON_HALO_VERTEX} fragmentShader={SOFT_POINT_FRAGMENT} {...GLOW} />
      </points>
      <mesh ref={orbitMesh} geometry={orbitGeometry} raycast={() => null} renderOrder={2} frustumCulled={false}>
        <shaderMaterial ref={matOrbit} uniforms={uniforms.orbit} vertexShader={RING_VERTEX} fragmentShader={ORBIT_LINE_FRAGMENT} side={2} {...GLOW} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- 별똥별
// 이 행성 둘레(반지름 reach0~reach1 의 껍질)에서만 호를 그리며 지나간다. 별똥별 칸(slot) 최대 3개.
// 칸마다 주기가 다르고, 주기마다 지나가는 면·방향·위치·휘는 정도를 고정 난수로 새로 고른다 → 같은 자리에서 반복되지 않는다.
// [2026-11-25] 세 번째 칸은 가끔 첫 번째 별똥별을 0.35초 뒤에 거의 같은 길로 따라간다(간헐적 연속 별똥별).
// 꼬리 = 화면을 향해 펼친 띠(머리 쪽이 굵고 밝고, 꼬리 끝으로 가늘고 희미하게), 머리 = 반짝이는 점,
// 잔해 = 머리가 지나간 자리에 남아 천천히 흩어지며 사라지는 작은 별빛(상세일 때만).
const STAR_SLOTS = 3;
const TAIL_SEGMENTS = 18;
const STAR_PATH_GLSL = `
  uniform float uTime;
  uniform float uR0;
  uniform float uR1;
  uniform float uSlots;
  uniform float uChance;
  uniform vec3 uSeed;
  const float TAU = 6.2832;
  float h1(float n) { return fract(sin(n * 12.9898 + uSeed.x * 7.13) * 43758.5453); }
  float slotPeriod(float s) { return 4.5 + 3.5 * h1(s * 7.1 + 1.0); }
  // slot 의 지금 상태: life(0~1 지나가는 중), on(지나가는 중이고 보임), act(이번 주기에 나타남 — 잔해용, life 와 무관),
  // 호의 기저 u·w, 반지름, 시작 각도, 휩쓰는 각도, 휘는 정도(+ 안쪽으로 떨어짐 / − 바깥으로 벗어남)
  void starState(float slot, out float life, out float on, out float act, out vec3 u, out vec3 w, out float rad, out float a0, out float sweep, out float curve) {
    float src = slot;
    float shift = 0.0;
    float follow = 0.0;
    if (slot > 1.5) {
      float p0 = slotPeriod(0.0);
      float c0 = floor((uTime + h1(2.0) * p0) / p0);
      if (h1(c0 * 9.7 + 3.0) < 0.4) { src = 0.0; shift = -0.35; follow = 1.0; }
    }
    float period = slotPeriod(src);
    float tt = uTime + shift + h1(src * 3.3 + 2.0) * period;
    float cyc = floor(tt / period);
    float dur = src < 0.5 ? 1.7 : (src < 1.5 ? 1.1 : 1.4);
    life = (tt - cyc * period) / dur;
    float pick = h1(cyc * 5.7 + src * 13.1 + 4.0);
    act = step(slot + 0.5, uSlots) * step(pick, uChance);
    on = step(life, 1.0) * act;
    float s1 = h1(cyc * 1.7 + src * 11.0);
    float s2 = h1(cyc * 2.3 + src * 5.0 + 3.0);
    float s3 = h1(cyc * 3.1 + src * 2.0 + 7.0);
    float th = s1 * TAU + follow * 0.08;
    float ph = acos(2.0 * s2 - 1.0);
    vec3 nrm = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
    u = normalize(cross(nrm, abs(nrm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    w = cross(nrm, u);
    rad = mix(uR0, uR1, s3) * (1.0 + follow * 0.07);
    sweep = (0.9 + 0.5 * h1(cyc * 6.1 + src)) * (h1(cyc * 8.3 + src) < 0.5 ? 1.0 : -1.0);
    a0 = h1(cyc * 4.7 + src * 1.9) * TAU - follow * 0.12 * sign(sweep);
    curve = mix(-0.12, 0.26, h1(cyc * 7.7 + src * 3.0));
  }
  vec3 starPoint(vec3 u, vec3 w, float rad, float a0, float s, float life, float curve) {
    float rr = rad * (1.0 - curve * life);   // 안쪽으로 휘며 떨어지거나 바깥으로 벗어나는 곡선
    return (u * cos(a0 + s) + w * sin(a0 + s)) * rr;
  }
`;
const STAR_TAIL_VERTEX = `
  attribute float aSlot;
  attribute float aT;      // 0 = 머리, 1 = 꼬리 끝
  attribute float aSide;
  uniform float uWidth;
  varying float vAlpha;
  varying float vT;
  varying float vSide;
  varying float vSlot;
  varying vec3 vViewPos;
  ${STAR_PATH_GLSL}
  void main() {
    float life, on, act, rad, a0, sweep, curve;
    vec3 u, w;
    starState(aSlot, life, on, act, u, w, rad, a0, sweep, curve);
    float tail = aSlot < 0.5 ? 1.0 : (aSlot < 1.5 ? 0.62 : 0.8);
    float back = aT * tail * smoothstep(0.0, 0.3, life);
    float s = life * sweep - sign(sweep) * back;
    // 꼬리의 각 점은 그 점을 머리가 지났던 때의 반지름(곡선을 따라 남는다)
    float lifeAt = max(life - back / max(abs(sweep), 0.001), 0.0);
    vec3 p = starPoint(u, w, rad, a0, s, lifeAt, curve);
    vec3 p2 = starPoint(u, w, rad, a0, s + sign(sweep) * 0.01, lifeAt, curve);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 tv = (modelViewMatrix * vec4(p2, 1.0)).xyz - mv.xyz;
    vec3 side = normalize(cross(normalize(tv + 1e-5), vec3(0.0, 0.0, 1.0)));
    float wid = uWidth * (aSlot > 1.5 ? 1.2 : 1.0) * (1.0 - 0.85 * pow(aT, 0.6));
    mv.xyz += side * aSide * wid;
    // 나타날 때 밝아지고 사라질 때 서서히 어두워진다
    float fade = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.62, 1.0, life));
    vAlpha = on * fade * pow(1.0 - aT, 1.35);
    vT = aT;
    vSide = aSide;
    vSlot = aSlot;
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_TAIL_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uIntensity;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  varying float vAlpha;
  varying float vT;
  varying float vSide;
  varying float vSlot;
  varying vec3 vViewPos;
  void main() {
    if (vAlpha < 0.003) discard;
    // 부드러운 꼬리: 가운데 심은 머리 쪽에서만 또렷하고, 꼬리 끝으로 갈수록 넓게 번진다
    float core = exp(-vSide * vSide * mix(5.0, 1.6, vT));
    vec3 col = vSlot < 0.5 ? uC0 : (vSlot < 1.5 ? uC1 : uC2);
    col = mix(col, vec3(1.0), pow(1.0 - vT, 5.0) * 0.75);   // 머리 쪽은 흰빛에 가깝게
    gl_FragColor = vec4(col * core * vAlpha * 1.6 * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;
const STAR_HEAD_VERTEX = `
  attribute float aSlot;
  uniform float uSize;
  varying float vAlpha;
  varying float vViewZ;
  varying float vSlot;
  ${STAR_PATH_GLSL}
  void main() {
    float life, on, act, rad, a0, sweep, curve;
    vec3 u, w;
    starState(aSlot, life, on, act, u, w, rad, a0, sweep, curve);
    vec3 p = starPoint(u, w, rad, a0, life * sweep, life, curve);
    float fade = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.7, 1.0, life));
    vAlpha = on * fade;
    vSlot = aSlot;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_HEAD_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uIntensity;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  varying float vAlpha;
  varying float vViewZ;
  varying float vSlot;
  void main() {
    if (vAlpha < 0.003) discard;
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    // 밝은 중심 + 부드러운 빛 무리 + 가는 십자 반짝임
    float glow = pow(max(1.0 - d, 0.0), 2.4) + exp(-d * d * 60.0) * 0.8;
    float cross = max(exp(-abs(q.x) * 36.0) * exp(-abs(q.y) * 4.0), exp(-abs(q.y) * 36.0) * exp(-abs(q.x) * 4.0)) * (1.0 - d);
    vec3 col = vSlot < 0.5 ? uC0 : (vSlot < 1.5 ? uC1 : uC2);
    float a = (glow + cross * 0.9) * vAlpha;
    gl_FragColor = vec4(mix(col, vec3(1.0), 0.6) * a * uIntensity * sceneFade(vViewZ), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;
// 잔해: 머리가 지나간 자리(aS = 경로 위 위치 0~1)에 생겨, 천천히 바깥으로 흩어지며 반짝이다 사라진다(상세일 때만)
const STAR_DEBRIS_VERTEX = `
  attribute float aSlot;
  attribute vec3 aSeed;     // 경로 위 위치, 흩어지는 방향 2개
  uniform float uSize;
  uniform float uDetail;
  uniform vec3 uC0;
  uniform vec3 uC1;
  uniform vec3 uC2;
  varying float vAlpha;
  varying float vViewZ;
  varying vec3 vTint;
  ${STAR_PATH_GLSL}
  void main() {
    float life, on, act, rad, a0, sweep, curve;
    vec3 u, w;
    starState(aSlot, life, on, act, u, w, rad, a0, sweep, curve);
    float born = 0.15 + 0.75 * aSeed.x;
    float age = life - born;
    vec3 p = starPoint(u, w, rad, a0, born * sweep, born, curve);
    vec3 drift = normalize(p) * (0.04 + 0.05 * aSeed.y) + cross(u, w) * (aSeed.z - 0.5) * 0.08;
    p += drift * rad * max(age, 0.0);
    float twinkle = 0.6 + 0.4 * sin(age * 30.0 + aSeed.y * 20.0);
    vAlpha = act * uDetail * smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(0.2, 0.95, age)) * twinkle;
    vec3 c = aSlot < 0.5 ? uC0 : (aSlot < 1.5 ? uC1 : uC2);
    vTint = mix(c, vec3(1.0), 0.45);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * (0.5 + 0.6 * aSeed.z) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

function buildStarTailGeometry() {
  const slot: number[] = [];
  const t: number[] = [];
  const side: number[] = [];
  const index: number[] = [];
  for (let s = 0; s < STAR_SLOTS; s++) {
    const base = slot.length;
    for (let i = 0; i <= TAIL_SEGMENTS; i++) {
      for (const e of [-1, 1]) {
        slot.push(s);
        t.push(i / TAIL_SEGMENTS);
        side.push(e);
      }
      if (i < TAIL_SEGMENTS) {
        const o = base + i * 2;
        index.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(slot.length * 3), 3)); // 셰이더가 위치를 계산한다
  g.setAttribute('aSlot', new BufferAttribute(new Float32Array(slot), 1));
  g.setAttribute('aT', new BufferAttribute(new Float32Array(t), 1));
  g.setAttribute('aSide', new BufferAttribute(new Float32Array(side), 1));
  g.setIndex(index);
  return g;
}

function ShootingStars(props: EffectProps) {
  const { id, radius, palette, quality } = props;
  const rand = useSeeds(id, 'stars', 2);
  const colors = useMemo(() => effectColors(palette), [palette]);
  const white = useMemo(() => new Color('#ffffff'), []);
  const tail = useMemo(() => buildStarTailGeometry(), []);
  const head = useMemo(() => pointCloud(STAR_SLOTS, { aSlot: { data: [0, 1, 2], size: 1 } }), []);
  const debris = useMemo(() => {
    // 칸마다 DEBRIS_MAX 개(칸 0 → 1 → 2 순서). 품질별로 칸마다 앞쪽 n개만 그린다(drawRange 대신 크기 0)
    const seeds = seededRandoms(`${id}:debris`, STAR_SLOTS * DEBRIS_MAX * 3);
    const n = NEW_EFFECT_LOD.debrisPerStar[quality];
    const slots: number[] = [];
    const data: number[] = [];
    for (let s = 0; s < STAR_SLOTS; s++)
      for (let i = 0; i < n; i++) {
        slots.push(s);
        const k = (s * DEBRIS_MAX + i) * 3;
        data.push(seeds[k], seeds[k + 1], seeds[k + 2]);
      }
    return pointCloud(slots.length, { aSlot: { data: slots, size: 1 }, aSeed: { data, size: 3 } });
  }, [id, quality]);
  useDisposeOnUnmount(tail, head, debris);
  const L = NEW_EFFECT_LAYOUT.stars;

  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
    const path = {
      uR0: { value: effectReach(radius, L.reachMin) },
      uR1: { value: effectReach(radius, L.reachMax) },
      uSlots: { value: 1 },
      uChance: { value: NEW_EFFECT_LOD.starChance[0] },
      uSeed: { value: new Vector3(rand[0] * 50, rand[1] * 50, 0) },
      // 밝은 색 쪽·보조 감정 색 쪽·대표색과 보조 감정 색 사이 — 모두 감정 색 계열에서
      uC0: { value: colors.light.clone().lerp(white, 0.25) },
      uC1: { value: colors.accent.clone().lerp(white, 0.35) },
      uC2: { value: colors.base.clone().lerp(colors.accent, 0.5).lerp(white, 0.3) },
    };
    return {
      tail: { ...c, ...path, uWidth: { value: Math.max(radius, 0.2) * 0.05 } },
      head: { ...c, ...path, uSize: { value: Math.max(radius, 0.2) * 0.55 } },
      debris: { ...c, ...path, uSize: { value: Math.max(radius, 0.2) * 0.1 }, uCross: { value: 0.6 } },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, rand, props.intensity, props.shared, white]);

  const matTail = useRef<ShaderMaterial>(null);
  const matHead = useRef<ShaderMaterial>(null);
  const matDebris = useRef<ShaderMaterial>(null);
  const debrisPts = useRef<Points>(null);
  useEffectClock(id, props, [matTail, matHead, matDebris], {
    // 별똥별은 시간이 멈추면 공중에 멈춰 보이므로 멀리서도 흐르게 두고, 대신 드물게(등장 비율)·한 개만 나오게 한다
    alwaysRun: true,
    onTier: (tier, dim, detail) => {
      for (const m of [matTail.current, matHead.current, matDebris.current]) {
        if (!m) continue;
        // 별자리 밖으로 어둡게 한 행성은 끈다(최소화)
        m.uniforms.uSlots.value = dim > 0.05 ? 0 : NEW_EFFECT_LOD.starSlots[tier];
        m.uniforms.uChance.value = NEW_EFFECT_LOD.starChance[tier];
      }
      if (debrisPts.current) debrisPts.current.visible = detail > 0.01;
    },
  });

  return (
    <group>
      <mesh geometry={tail} raycast={() => null} renderOrder={3} frustumCulled={false}>
        <shaderMaterial ref={matTail} uniforms={uniforms.tail} vertexShader={STAR_TAIL_VERTEX} fragmentShader={STAR_TAIL_FRAGMENT} side={2} {...GLOW} />
      </mesh>
      <points ref={debrisPts} geometry={debris} raycast={() => null} renderOrder={3} frustumCulled={false} visible={false}>
        <shaderMaterial ref={matDebris} uniforms={uniforms.debris} vertexShader={STAR_DEBRIS_VERTEX} fragmentShader={SOFT_POINT_FRAGMENT} {...GLOW} />
      </points>
      <points geometry={head} raycast={() => null} renderOrder={4} frustumCulled={false}>
        <shaderMaterial ref={matHead} uniforms={uniforms.head} vertexShader={STAR_HEAD_VERTEX} fragmentShader={STAR_HEAD_FRAGMENT} {...GLOW} />
      </points>
    </group>
  );
}

/** 신규 3종 갈래(planet-effects.tsx SpecialEffect 가 부른다) */
export function NewSpecialEffect(props: EffectProps & { type: NewSpecialType }) {
  switch (props.type) {
    case 'celestial_ring':
      return <CelestialRing {...props} />;
    case 'orbiting_moons':
      return <OrbitingMoons {...props} />;
    case 'shooting_stars':
      return <ShootingStars {...props} />;
  }
}
