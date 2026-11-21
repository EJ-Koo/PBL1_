// [NEW FILE 2026-11-21] 신규 특수 효과 3종: 천상의 고리(celestial_ring) · 공전하는 위성(orbiting_moons) · 별똥별(shooting_stars).
//
// 기존 5종(planet-effects.tsx)과 같은 규칙을 따른다.
//  - 행성 본체(감정 색·무늬·크기·위치)는 건드리지 않는다. Planet 의 위치·기울기 그룹 안에 둔 독립 메시라 행성이 움직이면(별자리 포함) 함께 움직인다.
//  - 색은 고정하지 않는다: 행성의 감정 대표색 계열(밝은 색·대표색·보조 감정 색)에서 고르고, 하이라이트만 흰빛을 섞는다.
//  - 클릭: 모든 메시가 광선 검사에서 빠진다(raycast = null) → 고리·위성·별똥별을 눌러도 행성 클릭과 겹치지 않는다.
//  - 단계(LOD): EFFECT_TIERS(0 멀리 / 1 가까이 / 2 선택). 별자리 밖으로 어둡게 한 행성은 고리 단순화·위성 궤도선 숨김·별똥별 끔.
//  - 크기: 행성 반지름에 비례하되 표면 바깥 거리는 최소·최대로 묶는다(special-planet.ts NEW_EFFECT_LAYOUT·effectReach).
//  - 지오메트리는 효과마다 하나씩만 만들고(고리 3개 = 메시 1개, 위성 = 인스턴스 1개, 별똥별 = 메시 1개 + 점 1개),
//    컴포넌트가 사라지면(효과 해제·변경·행성 삭제) 직접 정리한다. 매 프레임 바꾸는 값은 시간·강조·어둡게 정도뿐이다.
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

import { seededRandoms } from '@/lib/planet-visual';
import {
  NEW_EFFECT_LAYOUT,
  SPECIAL_EFFECT_SETTINGS,
  effectReach,
  moonLayout,
  ringRadii,
  type EffectTier,
  type NewSpecialType,
} from '@/lib/special-planet';

import { EFFECT_TIERS, FADE_GLSL, LIGHT_DIR_GLSL, NO_DIM, effectColors, type EffectProps } from './planet-effects-shared';

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

/** 단계별 설정(조절용). particles: 고리 위 빛 입자 수, moons: 보이는 위성 수 상한, stars: 동시에 날 수 있는 별똥별 수·등장 비율 */
export const NEW_EFFECT_LOD = {
  ringParticles: [0, 10, 24] as const,
  moonsVisible: [2, 3, 3] as const,
  starSlots: [1, 2, 3] as const,
  /** 주기마다 별똥별이 실제로 나타날 비율(멀리서는 드물게) */
  starChance: [0.35, 0.75, 1] as const,
};

/** 행성마다 고정된 값(같은 행성은 늘 같은 기울기·색 배치·위성 구성) */
function useSeeds(id: string, tag: string, n: number) {
  return useMemo(() => seededRandoms(`${id}:${tag}`, n), [id, tag, n]);
}

/** 효과 공통: 단계·시간·강조·어둡게 값을 매 프레임 재질에 넣는다. 멀리(0)에서는 시간을 멈춘다(alwaysRun 이면 계속). */
function useEffectClock(
  id: string,
  props: Pick<EffectProps, 'highlight' | 'dim' | 'fixedTier' | 'speed'>,
  mats: { current: ShaderMaterial | null }[],
  opts: { alwaysRun?: boolean; onTier?: (tier: EffectTier, dim: number) => void } = {}
) {
  const time = useRef(0);
  const dim = props.dim ?? NO_DIM;
  useFrame((_, delta) => {
    const sel = props.highlight.current > 0.5;
    const tier: EffectTier = props.fixedTier ?? (sel ? 2 : (EFFECT_TIERS.get(id) ?? 0));
    if (tier > 0 || opts.alwaysRun) time.current += Math.min(delta, 0.1) * props.speed * SPECIAL_EFFECT_SETTINGS.speed;
    for (const ref of mats) {
      const m = ref.current;
      if (!m) continue;
      m.uniforms.uTime.value = time.current;
      m.uniforms.uHighlight.value = props.highlight.current;
      m.uniforms.uDim.value = dim.current;
      if (m.uniforms.uTier) m.uniforms.uTier.value = tier;
    }
    opts.onTier?.(tier, dim.current);
  });
}

function commonUniforms(props: EffectProps) {
  return {
    uTime: { value: 0 },
    uTier: { value: 0 },
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
    // 행성 중심보다 카메라 쪽이면 1(앞쪽 고리를 조금 더 밝게 → 행성을 감싸는 입체감)
    vFront = clamp((mv.z - c.z) / uRadius * 0.5 + 0.5, 0.0, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// 천상의 고리: 가는 심 + 은은한 번짐, 둘레를 따라 천천히 흐르는 빛, 부드럽게 반짝이는 밝은 구간
const CELESTIAL_RING_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
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
    float core = exp(-e * e * 10.0);
    float halo = (1.0 - e) * (1.0 - e) * 0.55;
    vec3 col = vRing < 0.5 ? uC0 : (vRing < 1.5 ? uC1 : uC2);
    float flowOn = min(uTier, 1.0);
    // 둘레를 따라 흐르는 빛(고리마다 속도·방향이 다르다)
    float speed = (vRing < 0.5 ? 0.045 : (vRing < 1.5 ? -0.03 : 0.02));
    float flow = 0.62 + 0.38 * sin(6.2832 * (vU * 2.0 - uTime * speed) + vRing * 2.1);
    // 밝은 구간(하이라이트): 고리 한 바퀴에 두 군데, 천천히 이동
    float glint = pow(0.5 + 0.5 * sin(6.2832 * (vU * 2.0 + uTime * 0.025) + vRing * 1.7), 16.0);
    vec3 c = mix(col, uGlint, 0.5 * glint);
    float strength = (vRing < 0.5 ? 1.0 : (vRing < 1.5 ? 0.72 : 0.55));
    float lightAmt = (core + halo) * mix(0.75, flow, flowOn) + glint * core * 0.9 * (0.35 + 0.65 * flowOn);
    lightAmt *= 0.55 + 0.45 * vFront;
    // 별자리 밖으로 어둡게 한 행성: 바깥 두 고리를 지우고 안쪽 고리만(단순화)
    strength *= mix(1.0, step(vRing, 0.5), step(0.05, uDim));
    gl_FragColor = vec4(c * lightAmt * strength * 1.05 * uIntensity * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;

// 고리 위를 천천히 도는 작은 빛 입자(고리 기울기는 uniform 행렬로)
const RING_PARTICLE_VERTEX = `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uRingR;
  uniform mat3 uRot0;
  uniform mat3 uRot1;
  uniform mat3 uRot2;
  uniform float uSize;
  varying float vAlpha;
  varying float vViewZ;
  const float TAU = 6.2832;
  void main() {
    float k = floor(aSeed.x * 2.999);
    float r = k < 0.5 ? uRingR.x : (k < 1.5 ? uRingR.y : uRingR.z);
    float a = aSeed.y * TAU + uTime * (0.08 + 0.05 * aSeed.z) * (k < 0.5 ? 1.0 : -1.0);
    vec3 p = vec3(cos(a) * r, 0.0, sin(a) * r);
    p = k < 0.5 ? uRot0 * p : (k < 1.5 ? uRot1 * p : uRot2 * p);
    vAlpha = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed.w) + aSeed.z * 40.0), 3.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewZ = mv.z;
    gl_PointSize = uSize * (0.6 + 0.8 * aSeed.w) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const SPARK_FRAGMENT = `
  ${FADE_GLSL}
  uniform vec3 uC1;
  uniform float uIntensity;
  varying float vAlpha;
  varying float vViewZ;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q) * 2.0;
    // 둥근 빛 + 가는 십자 반짝임
    float glow = pow(max(1.0 - d, 0.0), 2.2);
    float cross = max(exp(-abs(q.x) * 40.0) * exp(-abs(q.y) * 5.0), exp(-abs(q.y) * 40.0) * exp(-abs(q.x) * 5.0)) * (1.0 - d);
    float a = (glow + cross * 0.8) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uC1, vec3(1.0), 0.5) * a * uIntensity * sceneFade(vViewZ), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
  }
`;

const RING_TILTS = [
  { tiltX: 0.02, tiltZ: -0.24 },
  { tiltX: 0.12, tiltZ: -0.16 },
  { tiltX: -0.07, tiltZ: -0.3 },
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
        // 행성마다 기울기가 조금씩 다르다(고정 난수)
        tiltX: RING_TILTS[i].tiltX + (rand[0] - 0.5) * 0.25,
        tiltZ: RING_TILTS[i].tiltZ + (rand[1] - 0.5) * 0.3,
      })),
    [radii, radius, L.width, rand]
  );
  const geometry = useMemo(() => buildRingGeometry(specs, quality === 'low' ? 64 : 128), [specs, quality]);
  const seeds = useMemo(() => new BufferAttribute(new Float32Array(seededRandoms(`${id}:ringp`, 24 * 4)), 4), [id]);
  const positions = useMemo(() => new BufferAttribute(new Float32Array(24 * 3), 3), []);
  useDisposeOnUnmount(geometry);

  const white = useMemo(() => new Color('#ffffff'), []);
  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
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
      spark: {
        ...c,
        uRingR: { value: new Vector3(radii[0], radii[1], radii[2]) },
        uRot0: { value: new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(specs[0].tiltX, 0, specs[0].tiltZ))) },
        uRot1: { value: new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(specs[1].tiltX, 0, specs[1].tiltZ))) },
        uRot2: { value: new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(specs[2].tiltX, 0, specs[2].tiltZ))) },
        uSize: { value: Math.max(radius, 0.2) * 0.16 },
        uC1: { value: colors.light },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, radii, specs, props.intensity, props.shared, white]);

  const matRing = useRef<ShaderMaterial>(null);
  const matSpark = useRef<ShaderMaterial>(null);
  const sparks = useRef<Points>(null);
  useEffectClock(id, props, [matRing, matSpark], {
    onTier: (tier, dim) => {
      const pts = sparks.current;
      if (!pts) return;
      const n = dim > 0.05 ? 0 : NEW_EFFECT_LOD.ringParticles[tier];
      pts.visible = n > 0;
      pts.geometry.setDrawRange(0, n);
    },
  });

  return (
    <group>
      <mesh geometry={geometry} raycast={() => null} renderOrder={2} frustumCulled={false}>
        <shaderMaterial ref={matRing} uniforms={uniforms.ring} vertexShader={RING_VERTEX} fragmentShader={CELESTIAL_RING_FRAGMENT} side={2} {...GLOW} />
      </mesh>
      <points ref={sparks} raycast={() => null} frustumCulled={false} renderOrder={3}>
        <bufferGeometry>
          <primitive attach="attributes-position" object={positions} />
          <primitive attach="attributes-aSeed" object={seeds} />
        </bufferGeometry>
        <shaderMaterial ref={matSpark} uniforms={uniforms.spark} vertexShader={RING_PARTICLE_VERTEX} fragmentShader={SPARK_FRAGMENT} {...GLOW} />
      </points>
    </group>
  );
}

// ---------------------------------------------------------------- 공전하는 위성
// 위성 = 인스턴스 메시 하나(구 지오메트리 하나를 함께 씀). 궤도 위치는 셰이더에서 시간으로 계산(DB 저장 없음).
// 위성은 불투명이라 깊이를 쓴다 → 행성 뒤로 가면 자연스럽게 가려지고 앞으로 오면 행성을 가린다.
const MOON_VERTEX = `
  attribute vec4 aOrbit;   // 궤도 반지름, 위성 크기, 처음 각도, 속도
  attribute vec4 aShape;   // 기울기 X, 기울기 Z, 종류(0 진주 / 1 수정 / 2 발광), 고정 난수
  uniform float uTime;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;
  varying float vKind;
  varying float vSeed;
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  void main() {
    float ang = aOrbit.z + uTime * aOrbit.w;
    mat3 tilt = rotX(aShape.x) * rotZ(aShape.y);
    vec3 center = tilt * vec3(cos(ang) * aOrbit.x, 0.0, sin(ang) * aOrbit.x);
    vObj = normalize(position);
    vKind = aShape.z;
    vSeed = aShape.w;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(center + position * aOrbit.y, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const MOON_FRAGMENT = `
  ${LIGHT_DIR_GLSL}
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
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
    float detail = clamp(uTier, 0.0, 1.0) * 0.5 + 0.5 * clamp(uTier - 1.0, 0.0, 1.0);
    vec3 col;
    if (vKind < 0.5) {
      // 진주: 부드러운 감싸는 빛 + 무지갯빛 가장자리 + 넓은 광택
      vec3 base = uPearl;
      vec3 lit = base * (0.45 + 0.6 * smoothstep(-0.4, 1.0, ndl));
      vec3 irid = 0.75 + 0.25 * cos(6.2832 * (rim * 1.2 + vSeed + vec3(0.0, 0.33, 0.67)));
      lit += mix(uSheen, irid, 0.5) * rim * (0.35 + 0.35 * detail);
      lit += vec3(1.0) * pow(max(dot(n, normalize(LIGHT_DIR + v)), 0.0), 18.0) * (0.25 + 0.3 * detail);
      col = lit;
    } else if (vKind < 1.5) {
      // 수정: 면이 각진 결정 반사(법선을 몇 단계로 끊어 면처럼) + 날카로운 반짝임
      vec3 fn = normalize(floor(vObj * 2.5 + 0.5));
      vec3 nv = normalize(mix(n, normalize(mat3(viewMatrix) * fn), 0.45));
      float f = 0.35 + 0.65 * smoothstep(-0.2, 1.0, dot(nv, LIGHT_DIR));
      vec3 lit = uCrystal * f;
      lit += vec3(1.0) * pow(max(dot(nv, normalize(LIGHT_DIR + v)), 0.0), 60.0) * (0.6 + 0.6 * detail);
      lit += uCrystal * rim * 0.6;
      col = lit;
    } else {
      // 발광: 은은하게 빛나는 작은 구슬(밤면도 밝다), 가장자리가 더 밝게 번진다
      col = uGlow * (0.7 + 0.3 * smoothstep(-0.5, 1.0, ndl)) + mix(uGlow, vec3(1.0), 0.5) * rim * 0.8;
    }
    gl_FragColor = vec4(col * sceneFade(vViewPos.z), 1.0);
    #include <colorspace_fragment>
  }
`;
// 위성 궤도선: 아주 희미한 가는 고리(가까이·선택일 때만)
const ORBIT_LINE_FRAGMENT = `
  ${FADE_GLSL}
  uniform float uTime;
  uniform float uTier;
  uniform float uIntensity;
  uniform vec3 uC0;
  varying float vRing;
  varying float vU;
  varying float vEdge;
  varying float vFront;
  varying vec3 vViewPos;
  void main() {
    float core = exp(-vEdge * vEdge * 10.0);
    float dash = 0.85 + 0.15 * sin(6.2832 * vU * 24.0);
    float show = clamp(uTier, 0.0, 1.0) * (1.0 - step(0.05, uDim));
    gl_FragColor = vec4(uC0 * core * dash * (0.5 + 0.5 * vFront) * 0.3 * show * uIntensity * sceneFade(vViewPos.z), 1.0);
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
  const orbitAttr = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(moons.flatMap((m) => [m.orbit, m.size, m.phase, m.speed])), 4),
    [moons]
  );
  const shapeAttr = useMemo(
    () => new InstancedBufferAttribute(new Float32Array(moons.flatMap((m, i) => [m.tiltX, m.tiltZ, m.kind, rand[i]])), 4),
    [moons, rand]
  );
  const orbitGeometry = useMemo(
    () =>
      buildRingGeometry(
        moons.map((m) => ({ radius: m.orbit, width: Math.max(m.size * 0.18, 0.004), tiltX: m.tiltX, tiltZ: m.tiltZ })),
        quality === 'low' ? 64 : 128
      ),
    [moons, quality]
  );
  // 위성 구: 효과마다 하나(위성별 궤도 값을 인스턴스 속성으로 붙이므로 다른 행성과 함께 쓰지 않는다). 정점 약 200개.
  const sphere = useMemo(() => {
    const g = new SphereGeometry(1, quality === 'low' ? 12 : 18, quality === 'low' ? 9 : 13);
    g.setAttribute('aOrbit', orbitAttr);
    g.setAttribute('aShape', shapeAttr);
    return g;
  }, [orbitAttr, shapeAttr, quality]);
  useDisposeOnUnmount(orbitGeometry, sphere);

  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
    return {
      moon: {
        ...c,
        // 진주 = 밝은 색 쪽(분홍·보라 계열이면 그대로), 수정 = 보조 감정 색을 맑게, 발광 = 밝은 파스텔
        uPearl: { value: colors.light.clone().lerp(white, 0.35) },
        uCrystal: { value: colors.accent.clone().lerp(white, 0.3) },
        uGlow: { value: colors.light.clone().lerp(colors.accent, 0.3).lerp(white, 0.2) },
        uSheen: { value: colors.accent.clone().lerp(white, 0.5) },
      },
      orbit: { ...c, uRadius: { value: radius }, uC0: { value: colors.light.clone().lerp(white, 0.5) } },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, props.intensity, props.shared, white]);

  const matMoon = useRef<ShaderMaterial>(null);
  const matOrbit = useRef<ShaderMaterial>(null);
  const mesh = useRef<InstancedMesh>(null);
  const orbitMesh = useRef<Mesh>(null);
  useEffectClock(id, props, [matMoon, matOrbit], {
    onTier: (tier, dim) => {
      // 멀리: 위성 2개까지, 별자리 밖(어둡게 함): 1개만 · 궤도선 숨김
      if (mesh.current) mesh.current.count = Math.min(moons.length, dim > 0.05 ? 1 : NEW_EFFECT_LOD.moonsVisible[tier]);
      if (orbitMesh.current) orbitMesh.current.visible = tier > 0 && dim <= 0.05;
    },
  });

  return (
    <group>
      <instancedMesh key={sphere.uuid} ref={mesh} args={[sphere, undefined, moons.length]} raycast={() => null} frustumCulled={false}>
        <shaderMaterial ref={matMoon} uniforms={uniforms.moon} vertexShader={MOON_VERTEX} fragmentShader={MOON_FRAGMENT} />
      </instancedMesh>
      <mesh ref={orbitMesh} geometry={orbitGeometry} raycast={() => null} renderOrder={2} frustumCulled={false}>
        <shaderMaterial ref={matOrbit} uniforms={uniforms.orbit} vertexShader={RING_VERTEX} fragmentShader={ORBIT_LINE_FRAGMENT} side={2} {...GLOW} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- 별똥별
// 이 행성 둘레(반지름 reach0~reach1 의 껍질)에서만 짧은 호를 그리며 지나간다. 별똥별 칸(slot) 최대 3개.
// 칸마다 주기가 다르고, 주기마다 지나가는 면·방향·위치를 고정 난수로 새로 고른다 → 같은 자리에서 반복되지 않는다.
// 꼬리 = 화면을 향해 펼친 가는 띠(머리 쪽이 굵고 밝고, 꼬리 끝으로 가늘고 희미하게), 머리 = 반짝이는 점.
const STAR_SLOTS = 3;
const TAIL_SEGMENTS = 14;
const STAR_PATH_GLSL = `
  uniform float uTime;
  uniform float uR0;
  uniform float uR1;
  uniform float uSlots;
  uniform float uChance;
  uniform vec3 uSeed;
  const float TAU = 6.2832;
  float h1(float n) { return fract(sin(n * 12.9898 + uSeed.x * 7.13) * 43758.5453); }
  // slot 의 지금 상태: life(0~1 지나가는 중, 그 밖이면 꺼짐), 호의 기저 u·w, 반지름, 시작 각도, 휩쓰는 각도
  void starState(float slot, out float life, out float on, out vec3 u, out vec3 w, out float rad, out float a0, out float sweep) {
    float period = 4.5 + 3.5 * h1(slot * 7.1 + 1.0);
    float tt = uTime + h1(slot * 3.3 + 2.0) * period;
    float cyc = floor(tt / period);
    float dur = slot < 0.5 ? 1.7 : (slot < 1.5 ? 1.1 : 1.4);
    life = (tt - cyc * period) / dur;
    float pick = h1(cyc * 5.7 + slot * 13.1 + 4.0);
    on = step(life, 1.0) * step(slot + 0.5, uSlots) * step(pick, uChance);
    float s1 = h1(cyc * 1.7 + slot * 11.0);
    float s2 = h1(cyc * 2.3 + slot * 5.0 + 3.0);
    float s3 = h1(cyc * 3.1 + slot * 2.0 + 7.0);
    float th = s1 * TAU;
    float ph = acos(2.0 * s2 - 1.0);
    vec3 nrm = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
    u = normalize(cross(nrm, abs(nrm.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    w = cross(nrm, u);
    rad = mix(uR0, uR1, s3);
    a0 = h1(cyc * 4.7 + slot * 1.9) * TAU;
    sweep = (0.9 + 0.5 * h1(cyc * 6.1 + slot)) * (h1(cyc * 8.3 + slot) < 0.5 ? 1.0 : -1.0);
  }
  vec3 starPoint(vec3 u, vec3 w, float rad, float a0, float s, float life) {
    float rr = rad * (1.0 - 0.1 * life);   // 살짝 안쪽으로 휘며 떨어진다(완만한 곡선)
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
    float life, on, rad, a0, sweep;
    vec3 u, w;
    starState(aSlot, life, on, u, w, rad, a0, sweep);
    float tail = aSlot < 0.5 ? 0.75 : (aSlot < 1.5 ? 0.4 : 0.55);   // 분홍 긴 잔광 · 파랑 짧고 선명 · 보라 중간
    float s = life * sweep - sign(sweep) * aT * tail * smoothstep(0.0, 0.25, life);
    vec3 p = starPoint(u, w, rad, a0, s, life);
    vec3 p2 = starPoint(u, w, rad, a0, s + sign(sweep) * 0.01, life);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 tv = (modelViewMatrix * vec4(p2, 1.0)).xyz - mv.xyz;
    vec3 side = normalize(cross(normalize(tv + 1e-5), vec3(0.0, 0.0, 1.0)));
    float wid = uWidth * (aSlot > 1.5 ? 1.3 : 1.0) * (1.0 - 0.9 * pow(aT, 0.7));
    mv.xyz += side * aSide * wid;
    // 나타날 때 밝아지고 사라질 때 서서히 어두워진다
    float fade = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.65, 1.0, life));
    vAlpha = on * fade * pow(1.0 - aT, 1.6);
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
    float core = exp(-vSide * vSide * (vSlot > 1.5 ? 2.5 : 4.5));
    vec3 col = vSlot < 0.5 ? uC0 : (vSlot < 1.5 ? uC1 : uC2);
    col = mix(col, vec3(1.0), pow(1.0 - vT, 6.0) * 0.7);   // 머리 쪽은 흰빛에 가깝게
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
    float life, on, rad, a0, sweep;
    vec3 u, w;
    starState(aSlot, life, on, u, w, rad, a0, sweep);
    vec3 p = starPoint(u, w, rad, a0, life * sweep, life);
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
    float glow = pow(max(1.0 - d, 0.0), 2.4);
    float cross = max(exp(-abs(q.x) * 36.0) * exp(-abs(q.y) * 4.0), exp(-abs(q.y) * 36.0) * exp(-abs(q.x) * 4.0)) * (1.0 - d);
    vec3 col = vSlot < 0.5 ? uC0 : (vSlot < 1.5 ? uC1 : uC2);
    float a = (glow + cross * 0.9) * vAlpha;
    gl_FragColor = vec4(mix(col, vec3(1.0), 0.6) * a * uIntensity * sceneFade(vViewZ), 1.0);
    #include <colorspace_fragment>
    ${ALPHA_FROM_LIGHT}
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

function buildStarHeadGeometry() {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(STAR_SLOTS * 3), 3));
  g.setAttribute('aSlot', new BufferAttribute(new Float32Array([0, 1, 2]), 1));
  return g;
}

function ShootingStars(props: EffectProps) {
  const { id, radius, palette } = props;
  const rand = useSeeds(id, 'stars', 2);
  const colors = useMemo(() => effectColors(palette), [palette]);
  const white = useMemo(() => new Color('#ffffff'), []);
  const tail = useMemo(() => buildStarTailGeometry(), []);
  const head = useMemo(() => buildStarHeadGeometry(), []);
  useDisposeOnUnmount(tail, head);
  const L = NEW_EFFECT_LAYOUT.stars;

  const uniforms = useMemo(() => {
    const c = commonUniforms(props);
    const path = {
      uR0: { value: effectReach(radius, L.reachMin) },
      uR1: { value: effectReach(radius, L.reachMax) },
      uSlots: { value: 1 },
      uChance: { value: NEW_EFFECT_LOD.starChance[0] },
      uSeed: { value: new Vector3(rand[0] * 50, rand[1] * 50, 0) },
      // 분홍(밝은 색 쪽)·파랑(보조 감정 색 쪽)·보라(대표색과 보조 감정 색 사이) — 모두 감정 색 계열에서
      uC0: { value: colors.light.clone().lerp(white, 0.25) },
      uC1: { value: colors.accent.clone().lerp(white, 0.35) },
      uC2: { value: colors.base.clone().lerp(colors.accent, 0.5).lerp(white, 0.3) },
    };
    return {
      tail: { ...c, ...path, uWidth: { value: Math.max(radius, 0.2) * 0.042 } },
      head: { ...c, ...path, uSize: { value: Math.max(radius, 0.2) * 0.5 } },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, radius, rand, props.intensity, props.shared, white]);

  const matTail = useRef<ShaderMaterial>(null);
  const matHead = useRef<ShaderMaterial>(null);
  useEffectClock(id, props, [matTail, matHead], {
    // 별똥별은 시간이 멈추면 공중에 멈춰 보이므로 멀리서도 흐르게 두고, 대신 드물게(등장 비율)·한 개만 나오게 한다
    alwaysRun: true,
    onTier: (tier, dim) => {
      for (const m of [matTail.current, matHead.current]) {
        if (!m) continue;
        // 별자리 밖으로 어둡게 한 행성은 끈다(최소화)
        m.uniforms.uSlots.value = dim > 0.05 ? 0 : NEW_EFFECT_LOD.starSlots[tier];
        m.uniforms.uChance.value = NEW_EFFECT_LOD.starChance[tier];
      }
    },
  });

  return (
    <group>
      <mesh geometry={tail} raycast={() => null} renderOrder={3} frustumCulled={false}>
        <shaderMaterial ref={matTail} uniforms={uniforms.tail} vertexShader={STAR_TAIL_VERTEX} fragmentShader={STAR_TAIL_FRAGMENT} side={2} {...GLOW} />
      </mesh>
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
