// [NEW FILE 2026-11-12] 별자리 보기의 3D 연출: 행성 이동 경로, 빛나는 연결선(순서대로 그려짐), 이동 중 빛의 잔상.
//
// 행성의 원래 좌표(일기 의미로 정한 bge-m3 좌표)는 건드리지 않는다. 이동 중·별자리 상태의 '화면 위치'만
// ConstellationRuntime.positions 에 따로 두고, Planet 은 거기에 값이 있을 때만 그 위치에 그린다.
// 값이 없어지면(원래 자리로 돌아오면) Planet 은 원래 좌표(props)로 되돌아간다. DB에는 아무것도 저장하지 않는다.
//
// 연결선: 화면에서 일정한 두께(픽셀)로 보이도록 선분마다 얇은 사각형 두 개를 셰이더에서 화면 방향으로 펼친다.
// (WebGL 기본 선은 1px 고정이라 고해상도 휴대폰에서 거의 안 보인다.) 지오메트리는 최대 개수로 한 번만 만들고
// 매 프레임 끝점 값만 바꾼다(다시 만들지 않음). 컴포넌트가 사라지면 지오메트리·재질을 정리한다.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber/native';
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  OneFactor,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Mesh,
  type Points,
} from 'three';

import { CONSTELLATION_CONFIG, lineGapFor } from '@/lib/constellation';

/** 행성 하나의 이동(출발 → 도착). 시간은 런타임 시계(초) 기준. */
export type MotionTrack = {
  from: Vector3;
  to: Vector3;
  start: number;
  duration: number;
  /** 이동 중 카메라 쪽으로 살짝 떠오르는 높이(행성마다 달라 경로가 겹쳐도 부딪히지 않게) */
  lift: number;
  /** true 면 원래 자리로 돌아가는 중(도착하면 화면 위치를 지워 원래 좌표로 그린다) */
  home: boolean;
};

export type LineSet = {
  /** 선분 = [행성 id, 행성 id] (그리는 순서) */
  pairs: [string, string][];
  /** 첫 선이 그려지기 시작하는 시각 */
  drawStart: number;
  /** 사라지기 시작한 시각(없으면 보이는 중) */
  fadeStart: number | null;
  color: string;
};

export type ConstellationRuntime = {
  /** 런타임 시계(초). UniverseScene 이 매 프레임 올린다. */
  now: number;
  /** 별자리 때문에 원래 자리를 벗어난 행성의 지금 화면 위치(우주 그룹 안쪽 좌표) */
  positions: Map<string, Vector3>;
  tracks: Map<string, MotionTrack>;
  /** 지금 보이는(또는 사라지는 중인) 선 묶음. 사라지는 동안 다음 묶음은 next 에서 기다린다. */
  lines: LineSet | null;
  next: LineSet | null;
  /** 원래 좌표 조회(선 끝점·복귀용) */
  origin: (id: string) => Vector3 | undefined;
};

/** 화면(UniverseScene)마다 하나. useRef 로 들고 있다가 자식에게 ref 째로 넘긴다(매 프레임 값만 바뀜). */
export type RuntimeRef = { readonly current: ConstellationRuntime };

export function createRuntime(): ConstellationRuntime {
  return { now: 0, positions: new Map(), tracks: new Map(), lines: null, next: null, origin: () => undefined };
}

/** 부드러운 가속·감속 */
function ease(t: number) {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** 경로 위의 점: 직선 보간 + 카메라 쪽(+z)으로 둥글게 떠오름. e = 0~1(이미 감속 적용된 값) */
export function pathPoint(track: MotionTrack, e: number, out: Vector3) {
  out.lerpVectors(track.from, track.to, e);
  out.z += track.lift * Math.sin(Math.PI * e);
  return out;
}

export function trackProgress(track: MotionTrack, now: number) {
  return ease((now - track.start) / track.duration);
}

/** 행성의 지금 화면 위치(별자리로 옮겨졌으면 그 위치, 아니면 원래 좌표) */
export function livePosition(rt: ConstellationRuntime, id: string): Vector3 | undefined {
  return rt.positions.get(id) ?? rt.origin(id);
}

// ---------------------------------------------------------------- 연결선
const LINE_VERTEX_SHADER = `
  attribute vec3 aA;
  attribute vec3 aB;
  attribute float aT;
  attribute float aSide;
  attribute float aSeg;
  uniform vec2 uResolution;
  uniform float uWidth;
  varying float vT;
  varying float vSide;
  varying float vSeg;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
    vec2 sa = a.xy / a.w * uResolution;
    vec2 sb = b.xy / b.w * uResolution;
    vec2 dir = sb - sa;
    float len = length(dir);
    dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);
    vec4 p = mix(a, b, aT);
    // 화면에서 uWidth 픽셀만큼 옆으로 펼친다(원근과 무관하게 같은 두께)
    p.xy += normal * aSide * uWidth / uResolution * p.w;
    gl_Position = p;
    vT = aT;
    vSide = aSide;
    vSeg = aSeg;
  }
`;

const LINE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uElapsed;
  uniform float uGap;
  uniform float uDraw;
  uniform float uTime;
  varying float vT;
  varying float vSide;
  varying float vSeg;
  void main() {
    // 이 선분이 지금까지 그려진 비율(앞 선분부터 차례로)
    float f = clamp((uElapsed - vSeg * uGap) / uDraw, 0.0, 1.0);
    if (vT > f || f <= 0.0) discard;
    // 가운데 가는 심 + 바깥으로 퍼지는 은은한 빛
    float s = abs(vSide);
    float core = smoothstep(0.42, 0.0, s);
    float halo = (1.0 - s) * (1.0 - s) * 0.45;
    // 그려지는 머리 부분은 조금 더 밝게(빛이 선을 따라가는 느낌), 다 그린 뒤에는 천천히 숨 쉬듯 반짝임
    float head = (1.0 - step(0.999, f)) * smoothstep(f - 0.22, f, vT) * 1.4;
    float shimmer = 0.85 + 0.15 * sin(uTime * 1.6 + vSeg * 0.9);
    float alpha = (core + halo) * (shimmer + head) * uOpacity;
    gl_FragColor = vec4(uColor * alpha, 1.0);
    #include <colorspace_fragment>
    // 빛의 세기만큼 캔버스 알파도 올린다(빈 우주 위에서도 선이 보이도록).
    gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
  }
`;

const VERTS_PER_LINE = 4;

/** 별자리 연결선. 행성이 도착한 뒤 선이 하나씩 이어지고, 숨길 때는 서서히 사라진다. */
export function ConstellationLines({ runtimeRef }: { runtimeRef: RuntimeRef }) {
  const max = CONSTELLATION_CONFIG.maxLines;
  const size = useThree((s) => s.size);

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const n = max * VERTS_PER_LINE;
    const t = new Float32Array(n);
    const side = new Float32Array(n);
    const seg = new Float32Array(n);
    const index: number[] = [];
    for (let i = 0; i < max; i++) {
      const v = i * VERTS_PER_LINE;
      // 0: A 왼쪽, 1: A 오른쪽, 2: B 왼쪽, 3: B 오른쪽
      t.set([0, 0, 1, 1], v);
      side.set([-1, 1, -1, 1], v);
      seg.set([i, i, i, i], v);
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3)); // 사용하지 않지만 three 가 요구
    g.setAttribute('aA', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aB', new BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aT', new BufferAttribute(t, 1));
    g.setAttribute('aSide', new BufferAttribute(side, 1));
    g.setAttribute('aSeg', new BufferAttribute(seg, 1));
    g.setIndex(index);
    g.setDrawRange(0, 0);
    return g;
  }, [max]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uResolution: { value: new Vector2(1, 1) },
          uWidth: { value: 2.6 },
          uColor: { value: new Color('#CFDcFF') },
          uOpacity: { value: 0 },
          uElapsed: { value: 0 },
          uGap: { value: CONSTELLATION_CONFIG.timing.lineGap },
          uDraw: { value: CONSTELLATION_CONFIG.timing.lineDraw },
          uTime: { value: 0 },
        },
        vertexShader: LINE_VERTEX_SHADER,
        fragmentShader: LINE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        // 색을 더하고, 알파도 빛 세기만큼 더한다(셰이더에서 a = 가장 밝은 색 성분).
        // [2026-11-19] 예전에는 알파를 더하지 않아(ZeroFactor) 빈 우주(알파 0) 위의 선이 '알파 0인데 색은 있는' 픽셀이 됐다.
        // 이런 픽셀은 브라우저·GPU에 따라 화면 합성 때 버려져서, 선이 행성 위를 지나는 부분만 보이고 끊겨 보였다.
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
      }),
    []
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );

  const meshRef = useRef<Mesh>(null);
  const shownColor = useRef<string | null>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const rt = runtimeRef.current;
    const geo = mesh.geometry as BufferGeometry;
    const u = (mesh.material as ShaderMaterial).uniforms;
    // 화면 크기(반폭 기준 픽셀): 셰이더에서 클립 좌표 → 픽셀
    u.uResolution.value.set(size.width / 2, size.height / 2);
    u.uTime.value = rt.now;

    // 사라지는 중인 선이 다 사라지면 다음 선 묶음으로 바꾼다
    let set = rt.lines;
    if (set?.fadeStart != null && rt.now - set.fadeStart >= CONSTELLATION_CONFIG.timing.lineFade) {
      rt.lines = rt.next;
      rt.next = null;
      set = rt.lines;
    }
    if (!set || set.pairs.length === 0) {
      geo.setDrawRange(0, 0);
      u.uOpacity.value = 0;
      return;
    }

    // 끝점 = 두 행성의 지금 화면 위치(행성 중심). 지오메트리는 그대로 두고 값만 바꾼다.
    const count = Math.min(set.pairs.length, max);
    const aA = geo.getAttribute('aA') as BufferAttribute;
    const aB = geo.getAttribute('aB') as BufferAttribute;
    for (let i = 0; i < count; i++) {
      const [ia, ib] = set.pairs[i];
      const pa = livePosition(rt, ia);
      const pb = livePosition(rt, ib);
      if (!pa || !pb) continue;
      for (let k = 0; k < VERTS_PER_LINE; k++) {
        aA.setXYZ(i * VERTS_PER_LINE + k, pa.x, pa.y, pa.z);
        aB.setXYZ(i * VERTS_PER_LINE + k, pb.x, pb.y, pb.z);
      }
    }
    aA.needsUpdate = true;
    aB.needsUpdate = true;
    geo.setDrawRange(0, count * 6);

    if (shownColor.current !== set.color) {
      u.uColor.value.set(set.color);
      shownColor.current = set.color;
    }
    u.uGap.value = lineGapFor(count);
    u.uElapsed.value = rt.now - set.drawStart;
    // 기본 세기는 낮게(행성이 주인공). 사라질 때는 서서히 0으로.
    const base = 0.55;
    u.uOpacity.value =
      set.fadeStart == null
        ? base
        : base * Math.max(0, 1 - (rt.now - set.fadeStart) / CONSTELLATION_CONFIG.timing.lineFade);
  });

  // frustumCulled=false: 끝점을 셰이더에서 정하므로 three 가 범위를 모른다
  return (
    <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={2} />
  );
}

// ---------------------------------------------------------------- 이동 중 빛의 잔상
const TRAIL_STEPS = 5;
const TRAIL_SPACING = 0.035;

const TRAIL_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
  }
`;
const TRAIL_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(0.0, 1.0 - d), 2.2) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
    // 빛의 세기만큼 캔버스 알파도 올린다(빈 우주 위에서도 선이 보이도록).
    gl_FragColor.a = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
  }
`;

/** 움직이는 행성 뒤로 남는 옅은 빛(경로 위 지난 위치 몇 개). 움직이는 동안만 보인다. */
export function ConstellationTrails({ runtimeRef, maxPlanets }: { runtimeRef: RuntimeRef; maxPlanets: number }) {
  const capacity = Math.max(1, maxPlanets) * TRAIL_STEPS;
  const pixelRatio = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3));
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(capacity), 1));
    g.setAttribute('aAlpha', new BufferAttribute(new Float32Array(capacity), 1));
    g.setDrawRange(0, 0);
    return g;
  }, [capacity]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color('#DCE6FF') }, uPixelRatio: { value: 1 } },
        vertexShader: TRAIL_VERTEX_SHADER,
        fragmentShader: TRAIL_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor, // 선과 같은 이유로 알파도 더한다
        blendDstAlpha: OneFactor,
      }),
    []
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  const pointsRef = useRef<Points>(null);
  const tmp = useRef(new Vector3());

  useFrame(() => {
    const pts = pointsRef.current;
    if (!pts) return;
    const rt = runtimeRef.current;
    const geo = pts.geometry as BufferGeometry;
    (pts.material as ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio;
    const pos = geo.getAttribute('position') as BufferAttribute;
    const sizeAttr = geo.getAttribute('aSize') as BufferAttribute;
    const alpha = geo.getAttribute('aAlpha') as BufferAttribute;
    let n = 0;
    for (const track of rt.tracks.values()) {
      const raw = (rt.now - track.start) / track.duration;
      if (raw <= 0 || raw >= 1) continue;
      const strength = Math.sin(Math.PI * raw) * 0.5;
      for (let k = 1; k <= TRAIL_STEPS && n < capacity; k++) {
        const e = ease(raw - k * TRAIL_SPACING);
        pathPoint(track, e, tmp.current);
        pos.setXYZ(n, tmp.current.x, tmp.current.y, tmp.current.z);
        sizeAttr.setX(n, 0.55 * (1 - k / (TRAIL_STEPS + 1)));
        alpha.setX(n, strength * (1 - k / (TRAIL_STEPS + 1)));
        n++;
      }
    }
    pos.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alpha.needsUpdate = true;
    geo.setDrawRange(0, n);
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={1} />
  );
}
