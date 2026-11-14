// [NEW FILE 2026-09-29] front 브랜치 frontend/src/app/index.jsx의 FloatingStar/UniverseScene을
// mockup 구조(TypeScript, expo-router)에 맞게 분리·이식한 파일.
// [MODIFIED] 원본은 화면 전체를 <View onResponderMove>로 감싸서 드래그를 잡는 방식이었는데,
// 이게 웹 브라우저 마우스 드래그를 못 받는 문제가 있어서, react-three-fiber 자체 포인터
// 이벤트(DragPlane, 아래)로 교체함 — 모바일 터치/웹 마우스 둘 다 이 방식으로 통일해서 받음.
// 자세한 이유는 mockup/CHANGES_FRONTEND.md 참고.
// [MODIFIED 2026-11-06] AI 감정 행성 디자인(feature/ai-service-draft)에 test 브랜치의 조작 개선을 합침:
//  - 휠 줌: 앱 전체에서 리스너 1번만 등록, deltaMode 보정, 우주 화면 위에서만, 거리 비례(배율) 줌
//  - 회전 민감도: 메뉴 설정값(lib/settings.ts)을 드래그 회전에 곱함
//  - 화면 복귀: 상세·검색에 갔다 오면 보던 각도·거리 그대로(처음 맞춘 화면 위치는 화면별로 기억)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber/native';
import { Platform, View, useWindowDimensions } from 'react-native';
import {
  AddEquation,
  BackSide,
  ClampToEdgeWrapping,
  Color,
  CustomBlending,
  DataTexture,
  DoubleSide,
  LinearFilter,
  OneFactor,
  RGBAFormat,
  Vector2,
  Vector3,
  ZeroFactor,
  type Group,
  type Mesh,
  type Points,
  type ShaderMaterial,
} from 'three';

import {
  BAND_TEXELS,
  PATTERN_STYLE,
  PLANET_BASE_RADIUS,
  QUALITY_SETTINGS,
  choosePlanetQuality,
  harmonizeAccent,
  planetBandStrip,
  planetPalette,
  planetScaleForText,
  seededRandoms,
  type PlanetQuality,
  type PlanetVisual,
} from '@/lib/planet-visual';
import { SPECIAL_EFFECT_SETTINGS, effectToDraw, type EffectTier, type SpecialType } from '@/lib/special-planet';
import { getRotateSensitivity, loadSettings } from '@/lib/settings';
import type { DiaryEntry } from '@/store/diary-context';

import { EFFECT_TIERS, LIGHT_DIR_GLSL, SpecialEffect, type SharedUniforms } from './planet-effects';

// pointsMaterial은 텍스처가 없으면 각 점을 네모로 그린다. 중심은 불투명, 가장자리는
// 투명한 작은 원형 텍스처를 입혀서 동그란 별점으로 보이게 한다.
function createDotTexture() {
  const size = 16;
  const center = size / 2;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dist = Math.hypot(x - center + 0.5, y - center + 0.5) / center;
      const alpha = Math.max(0, 1 - dist);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(alpha, 1.5) * 255);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  // DataTexture는 기본 필터가 NearestFilter라 확대하면 각지게 보인다. 부드럽게 보간되도록 바꾼다.
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const DOT_TEXTURE = createDotTexture();

// pointsMaterial의 size는 점 전체에 하나의 값만 적용돼서 크기를 점마다 다르게 못 준다.
// 그래서 점마다 다른 aSize 속성을 읽어 gl_PointSize를 정하는 셰이더로 대체한다.
const STARFIELD_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aBright;
  attribute float aTint;
  varying float vBright;
  varying float vTint;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    vBright = aBright;
    vTint = aTint;
  }
`;
// 별마다 밝기와 색온도(푸른 흰색 ~ 따뜻한 흰색)를 조금씩 다르게. 반짝임(시간에 따른 변화)은 넣지 않는다.
const STARFIELD_FRAGMENT_SHADER = `
  uniform sampler2D map;
  varying float vBright;
  varying float vTint;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    if (tex.a < 0.3) discard;
    vec3 tint = mix(vec3(0.82, 0.88, 1.0), vec3(1.0, 0.94, 0.84), vTint);
    gl_FragColor = vec4(tint, tex.a * vBright);
  }
`;
const STARFIELD_UNIFORMS = { map: { value: DOT_TEXTURE } };

/**
 * 별이 드물게 흩뿌려진 배경 하늘. 우주 그룹에 같이 속해서 드래그하면 별들과 함께 돈다.
 * 대부분은 작고 어두운 별, 소수만 조금 크고 밝은 별이라 깊이감만 더한다(개수는 품질 설정 stars).
 * 위치는 고정 난수라 화면을 다시 열어도 같은 하늘이다.
 */
function Starfield({ count }: { count: number }) {
  const pointsRef = useRef<Points>(null);

  const { positions, sizes, brights, tints } = useMemo(() => {
    const rnd = seededRandoms('starfield', count * 6);
    const pos = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    const bri = new Float32Array(count);
    const tin = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const [a, b, c, d, e, f] = rnd.slice(i * 6, i * 6 + 6);
      // 카메라를 완전히 감싸는 구 껍질 위에. 카메라가 멀리 물러나도(최대 약 26) 별이 행성 앞으로 오지 않게 30~90
      const radius = 30 + a * 60;
      const theta = b * Math.PI * 2;
      const phi = Math.acos(2 * c - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = radius * Math.cos(phi);
      // 세제곱 분포: 대부분 작고 어둡고, 드물게 크고 밝다
      // Slightly enlarge the warm/yellow background glints without changing
      // their positions, density or the colder distant stars.
      siz[i] = (0.45 + 1.2 * d ** 3) * (f > 0.65 ? 1.18 : 1);
      bri[i] = 0.3 + 0.7 * e ** 2;
      tin[i] = f;
    }
    return { positions: pos, sizes: siz, brights: bri, tints: tin };
  }, [count]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry key={count}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aBright" args={[brights, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[tints, 1]} />
      </bufferGeometry>
      <shaderMaterial
        uniforms={STARFIELD_UNIFORMS}
        vertexShader={STARFIELD_VERTEX_SHADER}
        fragmentShader={STARFIELD_FRAGMENT_SHADER}
        transparent
        depthWrite={false}
      />
    </points>
  );
}

// 손가락으로 민 거리를 기억해서 우주 전체 회전 각도에 반영하는 값
let targetRotX = 0;
let targetRotY = 0;
// 두 손가락 핀치(또는 웹 마우스 휠)로 조절하는 카메라 거리. 작을수록 확대, 클수록 축소.
let targetCameraZ = 5;

// ---------------------------------------------------------------- 행성
// 표면 = 대표색 계열 색 줄(planetBandStrip)을 '흐르는 좌표'로 읽어 만든 가는 구름층·광물층.
//  - 흐르는 좌표: 위도(y)에 노이즈를 두 번 겹쳐 휘게 하고(도메인 워핑), 일부 행성에는 부드러운 소용돌이 하나를 넣는다.
//  - 조명: 한쪽에서 오는 빛. 빛 받는 면은 부드럽게 밝고, 반대쪽은 어둡지만 표면색이 조금 보이게(약한 반사광).
//  - 하이라이트·대기광은 아주 약하게, 가장자리 몇 픽셀에만. 발광은 거의 없다.
//  - 먼 행성은 조금 어둡게 그려 겹쳤을 때 앞뒤가 구별되게 한다(좌표는 그대로).
// 톤 매핑을 쓰지 않아 대표색의 색상이 바뀌지 않는다. 규칙: ai/reports/planet_visual_v02_ko.md
// 빛 방향(화면 기준): 오른쪽 위, 옆에서 비스듬히. 왼쪽 아래 가장자리에 어두운 면이 보여 둥근 형태가 드러난다.
// (LIGHT_DIR_GLSL은 특수 효과와 함께 쓰려고 planet-effects.tsx에 둔다)

/** 모든 행성이 함께 쓰는 값. 카메라 거리에 따라 '멀리 있는 행성' 기준을 매 프레임 갱신한다. */
const SCENE_UNIFORMS = {
  uDepthFade: { value: new Vector2(4, 10) },
  /** 어떤 행성이든 선택(마우스 올림·누름) 중이면 1로 서서히 바뀐다. 선택되지 않은 행성을 조금 어둡게 하는 데 쓴다. */
  uFocus: { value: 0 },
};

const PLANET_VERTEX_SHADER = `
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;
  void main() {
    vObj = normalize(position);
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const PLANET_FRAGMENT_SHADER = `
  ${LIGHT_DIR_GLSL}
  uniform sampler2D uStrip;
  uniform vec3 uLight;
  uniform float uFlow;
  uniform float uSwirl;
  uniform vec3 uVortex;
  uniform float uCloud;
  uniform float uAtmo;
  uniform vec3 uAtmoColor;
  uniform float uEmissive;
  uniform float uExposure;
  uniform float uHighlight;
  uniform float uFocus;
  uniform vec2 uDepthFade;
  uniform vec3 uSeed;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;

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
  float fbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    float norm = 0.0;
    for (int i = 0; i < OCTAVES; i++) {
      s += a * vnoise(p);
      norm += a;
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return s / norm;
  }

  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }

  void main() {
    // 부드러운 소용돌이: 표면의 한 점(uVortex) 주변을 그 점을 축으로 조금 비튼다(가운데일수록 많이)
    vec3 p = vObj;
    float ang = uSwirl * pow(max(0.0, 1.0 - length(p - uVortex) / 0.45), 2.0);
    float ca = cos(ang);
    float sa = sin(ang);
    p = p * ca + cross(uVortex, p) * sa + uVortex * dot(uVortex, p) * (1.0 - ca);

    // 흐르는 층: 위도에 노이즈를 두 번 겹쳐 휘게 한다. 노이즈 계산 = OCTAVES × 2 + 1번
    // (많으면 Windows(ANGLE/D3D11) 셰이더 컴파일이 매우 오래 걸린다)
    float w1 = fbm(p * vec3(1.6, 4.5, 1.6) + uSeed);
    float w2 = fbm(p * vec3(3.2, 10.0, 3.2) + uSeed.zxy + w1 * 1.8);
    float u = p.y + uFlow * ((w1 - 0.5) * 0.9 + (w2 - 0.5) * 0.3);
    // 색 줄 텍스처는 sRGB 값이라 조명 계산 전에 선형으로 바꾼다.
    // 가는 층이 픽셀 계단처럼 보이지 않게, 한 픽셀이 덮는 좌표 폭(fwidth)만큼 세 번 읽어 평균한다.
    float t0 = clamp(u * 0.5 + 0.5, 0.0, 1.0);
    float dt = fwidth(t0) * 0.75;
    vec3 col = (srgbToLinear(texture2D(uStrip, vec2(t0 - dt, 0.5)).rgb)
              + 2.0 * srgbToLinear(texture2D(uStrip, vec2(t0, 0.5)).rgb)
              + srgbToLinear(texture2D(uStrip, vec2(t0 + dt, 0.5)).rgb)) * 0.25;
    // 흐릿한 구름: 대표색 계열의 밝은 색을 엷게
    col = mix(col, uLight, smoothstep(0.58, 0.85, w2) * uCloud * 0.3);
    // 아주 가는 결: 흐르는 방향을 따라
    float fine = vnoise(vec3(p.x * 2.5, u * 45.0, p.z * 2.5) + uSeed.yzx);
    col *= 0.96 + 0.08 * fine;
    // 선택한 행성: 색을 조금 더 선명하게(채도 +15%)
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(luma), col, 1.0 + 0.15 * uHighlight), 0.0);

    vec3 n = normalize(vNormalV);
    vec3 v = normalize(-vViewPos);
    float ndl = dot(n, LIGHT_DIR);
    float mu = max(dot(n, v), 0.0);
    // 한 방향에서 오는 부드러운 빛. 경계(터미네이터)는 넓게 번진다
    float diff = smoothstep(-0.12, 0.95, ndl);
    // 어두운 면에도 표면색이 조금 보이도록 반대쪽에서 오는 약한 반사광(색은 표면색 그대로)
    float fill = 0.07 + 0.06 * smoothstep(0.2, -0.6, ndl);
    // 둥근 형태: 빛 받는 면도 가장자리로 갈수록 조금 어둡게
    float limb = 0.72 + 0.28 * mu;
    vec3 lit = col * (fill + diff * limb) * uExposure;
    // 은은한 하이라이트(넓고 약하게)
    vec3 h = normalize(LIGHT_DIR + v);
    lit += mix(col, vec3(1.0), 0.5) * pow(max(dot(n, h), 0.0), 24.0) * 0.12;
    // 가장자리 대기: 아주 얇게(가장자리 몇 픽셀), 빛 받는 쪽 위주. 색은 대표색과 어울리는 밝은 색.
    // 세기(uAtmo)는 행성마다 다르다.
    float fr = pow(1.0 - mu, 5.0);
    lit += uAtmoColor * fr * (0.05 + 0.6 * smoothstep(-0.25, 0.5, ndl)) * uAtmo * (1.0 + 1.5 * uHighlight);
    lit += col * uEmissive;
    // 먼 행성은 조금 어둡게(겹쳤을 때 앞뒤 구별)
    lit *= 1.0 - 0.45 * smoothstep(uDepthFade.x, uDepthFade.y, -vViewPos.z);
    // 선택한 행성은 조금 밝게, 다른 행성은 조금 어둡게(겹쳐 있어도 어느 행성인지 보이게)
    lit *= (1.0 + 0.18 * uHighlight) * (1.0 - 0.25 * uFocus * (1.0 - uHighlight));
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

const RING_VERTEX_SHADER = `
  varying vec2 vLocal;
  varying vec3 vViewPos;
  varying vec3 vCenter;
  void main() {
    vLocal = position.xy;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vCenter = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const RING_FRAGMENT_SHADER = `
  ${LIGHT_DIR_GLSL}
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  uniform float uInner;
  uniform float uOuter;
  uniform float uRadius;
  uniform float uGap;
  uniform float uSeed;
  uniform float uHighlight;
  uniform float uFocus;
  uniform vec2 uDepthFade;
  varying vec2 vLocal;
  varying vec3 vViewPos;
  varying vec3 vCenter;
  float h1(float x) { return fract(sin(x * 127.1 + uSeed * 311.7) * 43758.5453); }
  float n1(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h1(i), h1(i + 1.0), f);
  }
  void main() {
    float t = (length(vLocal) - uInner) / (uOuter - uInner);
    // 여러 겹의 가는 고리: 주기가 다른 노이즈 세 개로 밀도를 정하고, 한 군데에 빈 틈을 둔다
    float dens = 0.5 * n1(t * 14.0) + 0.3 * n1(t * 40.0 + 7.0) + 0.2 * n1(t * 85.0 + 3.0);
    dens = smoothstep(0.22, 0.72, dens);
    float gap = smoothstep(0.015, 0.04, abs(t - uGap));
    float edge = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.85, t);
    // 색: 대표색 계열(밝은 색 ↔ 대표색) + 두 번째 보조 감정 색을 약하게
    vec3 col = mix(uC2, uC1, n1(t * 9.0 + 20.0));
    col = mix(col, uC3, 0.35 * smoothstep(0.5, 0.9, n1(t * 6.0 + 40.0)));
    // 행성 그림자: 고리의 점에서 빛 쪽으로 가는 선이 행성을 지나면 어둡게
    vec3 toC = vCenter - vViewPos;
    float along = dot(toC, LIGHT_DIR);
    float perp = length(toC - LIGHT_DIR * along);
    float shadow = along > 0.0 ? smoothstep(uRadius * 0.92, uRadius * 1.05, perp) : 1.0;
    col *= (0.2 + 0.8 * shadow) * 1.15;
    col *= 1.0 - 0.45 * smoothstep(uDepthFade.x, uDepthFade.y, -vViewPos.z);
    col *= (1.0 + 0.18 * uHighlight) * (1.0 - 0.25 * uFocus * (1.0 - uHighlight));
    gl_FragColor = vec4(col, dens * gap * edge * 0.8);
    #include <colorspace_fragment>
  }
`;

const ATMOSPHERE_VERTEX_SHADER = `
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const ATMOSPHERE_FRAGMENT_SHADER = `
  ${LIGHT_DIR_GLSL}
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uHighlight;
  uniform float uFocus;
  uniform vec2 uDepthFade;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    // 뒷면만 그린다: 행성 가장자리 바로 바깥이 가장 밝고 막 바깥쪽 끝에서 0이 된다. 빛 받는 쪽 위주.
    // 막이 얇아(반지름 1.05배) 보이는 범위의 d는 0~0.3이라, 그 범위로 나눠 0~1로 맞춘다.
    vec3 n = normalize(vNormalV);
    float d = -dot(n, normalize(-vViewPos));
    float f = pow(clamp(d / 0.3, 0.0, 1.0), 2.0) * smoothstep(-0.3, 0.6, dot(n, LIGHT_DIR));
    f *= 1.0 - 0.45 * smoothstep(uDepthFade.x, uDepthFade.y, -vViewPos.z);
    // 선택한 행성만 대기막을 더 밝게(전체 Bloom 대신 이 행성에만)
    f *= (1.0 + 1.8 * uHighlight) * (1.0 - 0.4 * uFocus * (1.0 - uHighlight));
    gl_FragColor = vec4(uColor * f * uStrength, 1.0);
    #include <colorspace_fragment>
  }
`;

function createBandTexture(visual: PlanetVisual, rand: number[]) {
  const texture = new DataTexture(planetBandStrip(visual, rand), BAND_TEXELS, 1, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 일기 한 개 = 행성 하나. 색·결은 visual(감정), 크기는 radius(일기 분량), 위치는 position(일기 의미). */
function Planet({
  id,
  position,
  radius,
  visual,
  brightness = 1,
  quality,
  selected = false,
  special = null,
  effectIntensity = SPECIAL_EFFECT_SETTINGS.intensity,
  effectSpeed = 1,
  effectTier,
  shared = SCENE_UNIFORMS,
  onPress,
  onPressStart,
  registerMesh,
}: {
  id: string;
  position: [number, number, number];
  radius: number;
  visual: PlanetVisual;
  /** stars.brightness (0.5~1.5, 1이 기본). 발광 세기를 아주 약간 바꾼다. */
  brightness?: number;
  quality: PlanetQuality;
  /** 마우스를 올렸거나 누르고 있는 행성 */
  selected?: boolean;
  /** 사용자가 적용한 특수 효과(상점에서 산 효과). null이면 일반 행성. 본체(색·무늬·크기)는 같고 바깥 효과만 더한다. */
  special?: SpecialType | null;
  effectIntensity?: number;
  effectSpeed?: number;
  /** 효과 단계를 고정한다(미리보기: 2 = 전부). 없으면 우주 화면의 거리별 단계(LOD)를 따른다. */
  effectTier?: EffectTier;
  /** 화면 공통 값(선택 중 어둡게, 먼 행성 어둡게). 미리보기는 자기 값을 따로 쓴다. */
  shared?: SharedUniforms;
  onPress?: () => void;
  onPressStart?: () => void;
  /** 웹 마우스 올림 판정(UniverseScene의 광선 검사)에 쓸 본체 메시를 알려 준다 */
  registerMesh?: (mesh: Mesh | null) => void;
}) {
  const bodyRef = useRef<Group>(null);
  const bodyMat = useRef<ShaderMaterial>(null);
  const ringMat = useRef<ShaderMaterial>(null);
  const atmoMat = useRef<ShaderMaterial>(null);
  const spinRef = useRef<Group>(null);
  const q = QUALITY_SETTINGS[quality];
  const rand = useMemo(() => seededRandoms(id, 16), [id]);
  const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = rand;
  const palette = useMemo(() => planetPalette(visual), [visual]);
  // 특수 효과 색: 대표색 계열 + 첫 보조 감정 색(대표색과 어울리게 조정). 고정 색(바다=파랑 등)은 쓰지 않는다.
  const effectPalette = useMemo(
    () => ({ ...palette, accent: harmonizeAccent(visual.accents[0]?.color ?? palette.light, palette.base) }),
    [palette, visual.accents]
  );

  // 색 줄(일기마다 고정): 층 배치·보조 감정 층 위치. 보조 감정 층 면적 = 서버가 정한 weight
  const bandTexture = useMemo(() => createBandTexture(visual, rand.slice(9)), [visual, rand]);
  useEffect(() => () => bandTexture.dispose(), [bandTexture]);

  // 대기광: 대표색과 어울리는 색(밝은 색 쪽), 세기는 행성마다 다르게.
  // 서버 glow(밝고 강한 감정일수록 큼, '없음'은 0)를 따르고, 같은 감정끼리도 똑같지 않게 일기별 고정 난수를 조금 더한다.
  const atmo = 0.3 + 0.5 * Math.min(Math.max(visual.glow, 0), 1) + 0.15 * rand[15];
  const atmoColor = useMemo(
    () => '#' + new Color(palette.light).lerp(new Color(palette.base), 0.35).getHexString(),
    [palette]
  );

  const bodyUniforms = useMemo(() => {
    const style = PATTERN_STYLE[visual.pattern];
    // 소용돌이 위치: 중위도(위도 ±12~35도)의 한 점. 절반 정도의 행성은 소용돌이를 약하게만 둔다(행성마다 변화).
    const lat = (0.2 + r6 * 0.4) * (r7 < 0.5 ? -1 : 1);
    const lon = r8 * Math.PI * 2;
    return {
      uStrip: { value: bandTexture },
      uLight: { value: new Color(palette.light) },
      // 각성이 높을수록(소용돌이 무늬) 층이 더 휘어 흐른다
      uFlow: { value: style.flow * (0.85 + 0.3 * Math.min(Math.max(visual.turbulence, 0), 1)) },
      uSwirl: { value: style.swirl * (r6 < 0.5 ? 1 : 0.35) },
      uVortex: { value: new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)) },
      uCloud: { value: style.cloud },
      uAtmo: { value: atmo },
      uAtmoColor: { value: new Color(atmoColor) },
      uEmissive: { value: 0.02 + 0.05 * Math.min(Math.max(brightness - 0.5, 0), 1) },
      // 행성마다 전체 밝기를 조금 다르게(서버 밝기 0.5~1.5 → 0.9~1.1배). 색상은 바꾸지 않는다.
      uExposure: { value: 0.9 + 0.2 * Math.min(Math.max(brightness - 0.5, 0), 1) },
      uHighlight: { value: 0 },
      uFocus: shared.uFocus,
      uDepthFade: shared.uDepthFade,
      uSeed: { value: new Vector3(r0 * 40, r1 * 40, r2 * 40) },
    };
  }, [visual, palette, bandTexture, brightness, atmo, atmoColor, shared, r0, r1, r2, r6, r7, r8]);

  const ringUniforms = useMemo(
    () => ({
      uC1: { value: new Color(palette.light) },
      uC2: { value: new Color(palette.base).lerp(new Color(palette.light), 0.4) },
      uC3: { value: new Color(harmonizeAccent(visual.ring.color ?? palette.base, palette.base)) },
      uInner: { value: radius * 1.35 },
      uOuter: { value: radius * 2.15 },
      uRadius: { value: radius },
      uGap: { value: 0.45 + r3 * 0.25 },
      uSeed: { value: r3 },
      uHighlight: { value: 0 },
      uFocus: shared.uFocus,
      uDepthFade: shared.uDepthFade,
    }),
    [visual.ring.color, palette, radius, shared, r3]
  );

  const atmosphereUniforms = useMemo(
    () => ({
      uColor: { value: new Color(atmoColor) },
      uStrength: { value: 0.22 * atmo },
      uHighlight: { value: 0 },
      uFocus: shared.uFocus,
      uDepthFade: shared.uDepthFade,
    }),
    [atmoColor, atmo, shared]
  );

  // 매우 느린 자전: 한 바퀴 약 90~210초. 행성마다 속도가 다르다(감정과 무관한 고정 난수).
  const spinSpeed = 0.03 + r4 * 0.04;
  // 선택 강조(0~1): 약 0.3초에 걸쳐 서서히 켜지고 꺼진다
  const highlight = useRef(0);
  useFrame((_, delta) => {
    if (spinRef.current) spinRef.current.rotation.y += delta * spinSpeed;
    const target = selected ? 1 : 0;
    if (Math.abs(highlight.current - target) > 0.001) {
      highlight.current += (target - highlight.current) * Math.min(1, delta * 8);
      const h = highlight.current;
      for (const m of [bodyMat.current, ringMat.current, atmoMat.current]) {
        if (m) m.uniforms.uHighlight.value = h;
      }
      // 화면에서만 조금 크게(좌표·크기 규칙은 그대로)
      bodyRef.current?.scale.setScalar(1 + 0.06 * h);
    }
  });

  const handleClick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onPress?.();
  };
  // 겹쳐 있으면 카메라에 가장 가까운 행성만 선택한다(뒤 행성까지 함께 켜지지 않게)
  const isFrontmost = (e: ThreeEvent<PointerEvent>) => e.intersections[0]?.object === e.object;

  // 바깥 얇은 대기막: 모든 행성(세기는 행성마다 다름). 저품질(low)에서는 빼고 표면 가장자리 빛만 남긴다.
  const showAtmosphere = q.atmosphere;
  return (
    // 자전축 기울기는 일기마다 고정된 값(감정과 무관). 북극 쪽을 카메라로 13~20도만 기울여
    // 층은 거의 가로로 흐르고, 고리는 정면에서 얇은 타원으로 보인다.
    <group ref={bodyRef} position={position} rotation={[0.22 + r5 * 0.13, 0, (r4 - 0.5) * 0.5]}>
      <group ref={spinRef}>
        <mesh
          ref={registerMesh}
          onClick={handleClick}
          // 누를 때는 전파를 막지 않는다(행성 위에서 시작한 드래그로도 우주를 돌릴 수 있게)
          onPointerDown={(e) => {
            if (isFrontmost(e)) onPressStart?.();
          }}
        >
          <sphereGeometry args={[radius, q.segments, Math.round(q.segments * 0.75)]} />
          <shaderMaterial
            ref={bodyMat}
            key={quality}
            uniforms={bodyUniforms}
            vertexShader={PLANET_VERTEX_SHADER}
            fragmentShader={PLANET_FRAGMENT_SHADER}
            defines={{ OCTAVES: q.octaves }}
          />
        </mesh>
      </group>
      {visual.ring.visible && (
        // 고리는 적도면에 둔다 → 층과 나란하다. 행성 뒤쪽은 행성에 가려지고 앞쪽은 행성 위로 지나간다(깊이 판정).
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[radius * 1.35, radius * 2.15, q.ringSegments, 1]} />
          <shaderMaterial
            ref={ringMat}
            uniforms={ringUniforms}
            vertexShader={RING_VERTEX_SHADER}
            fragmentShader={RING_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      )}
      {showAtmosphere && (
        <mesh raycast={() => null}>
          <sphereGeometry args={[radius * 1.05, q.segments, Math.round(q.segments * 0.75)]} />
          <shaderMaterial
            ref={atmoMat}
            uniforms={atmosphereUniforms}
            vertexShader={ATMOSPHERE_VERTEX_SHADER}
            fragmentShader={ATMOSPHERE_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            side={BackSide}
            // 색만 더하고 캔버스 알파는 그대로 둔다. (AdditiveBlending은 알파도 더해서, 투명 캔버스에서는
            // 빛이 약한 가장자리가 페이지 배경보다 검은 테두리로 보였다.)
            blending={CustomBlending}
            blendEquation={AddEquation}
            blendSrc={OneFactor}
            blendDst={OneFactor}
            blendSrcAlpha={ZeroFactor}
            blendDstAlpha={OneFactor}
          />
        </mesh>
      )}
      {special && (
        // 효과를 바꾸면 이전 효과의 메시·재질을 통째로 내리고(정리) 새로 만든다
        <SpecialEffect
          key={special}
          id={id}
          type={special}
          fixedTier={effectTier}
          radius={radius}
          palette={effectPalette}
          intensity={effectIntensity}
          speed={effectSpeed}
          quality={quality}
          highlight={highlight}
          shared={shared}
        />
      )}
    </group>
  );
}

/**
 * 화면 전체를 덮는 투명 평면. 별이 없는 빈 공간을 드래그하면 여기서 잡아서
 * 우주 전체 회전에 반영한다. RN의 View/onPointerMove로 감싸는 방식은 웹에서
 * react-three-fiber 캔버스와 조합했을 때 이벤트가 올라오지 않는 문제가 있어서,
 * r3f가 별 클릭(onClick)에 쓰는 것과 같은 자체 포인터 이벤트 시스템으로 통일함.
 */
const CAMERA_FOV = 50;
const ZOOM_MIN = 1.2;
// [MODIFIED 2026-11-03] 최대 축소 거리 10 → 25 (휠·핀치로 더 멀리 볼 수 있게)
const ZOOM_MAX_DEFAULT = 25;
// 행성이 넓게 퍼져 있으면 처음 화면 거리가 10보다 멀 수 있어 최대 축소 거리도 함께 늘린다(아래 UniverseScene)
let zoomMax = ZOOM_MAX_DEFAULT;

function pointerDistance(points: Map<number, { x: number; y: number }>) {
  const [a, b] = Array.from(points.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function DragPlane() {
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  // 동시에 눌려 있는 포인터(손가락/마우스)를 id별로 추적 — 2개가 되면 핀치 줌으로 전환
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);

  return (
    <mesh
      position={[0, 0, -20]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.set(e.pointerId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
        if (activePointers.current.size >= 2) {
          dragging.current = false;
          lastPinchDist.current = pointerDistance(activePointers.current);
        } else {
          dragging.current = true;
          lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!activePointers.current.has(e.pointerId)) return;
        activePointers.current.set(e.pointerId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

        if (activePointers.current.size >= 2) {
          const currentDist = pointerDistance(activePointers.current);
          if (lastPinchDist.current !== null) {
            const distDelta = currentDist - lastPinchDist.current;
            targetCameraZ = Math.min(Math.max(targetCameraZ - distDelta * 0.015, ZOOM_MIN), zoomMax);
          }
          lastPinchDist.current = currentDist;
          return;
        }

        if (!dragging.current) return;
        const deltaX = e.nativeEvent.pageX - lastPoint.current.x;
        const deltaY = e.nativeEvent.pageY - lastPoint.current.y;
        const speed = 0.01 * getRotateSensitivity();
        targetRotX += deltaX * speed;
        targetRotY += deltaY * speed;
        lastPoint.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.delete(e.pointerId);
        lastPinchDist.current = null;
        if (activePointers.current.size === 1) {
          const [remaining] = Array.from(activePointers.current.values());
          lastPoint.current = remaining;
          dragging.current = true;
        } else {
          dragging.current = false;
        }
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        activePointers.current.delete(e.pointerId);
        lastPinchDist.current = null;
        dragging.current = false;
      }}
    >
      <planeGeometry args={[400, 400]} />
      {/* 보이지 않는 판이라 깊이도 쓰지 않는다(쓰면 이 판보다 먼 배경 별이 모두 가려진다) */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// @react-three/fiber/native의 포인터 이벤트는 터치/드래그는 잘 잡지만(DragPlane 참고),
// 웹 마우스 휠(wheel) 이벤트는 전달하지 않는다 — RN용 이벤트 매니저라 DOM wheel을 안 다룸.
// 그래서 window에 직접 wheel 리스너를 붙여서 웹 줌을 구현한다.
// [MODIFIED 2026-11-05] 휠 줌이 가끔 안 먹던 문제 대응:
//  1) 화면(컴포넌트)마다 붙였다 떼던 리스너 → 앱 전체에서 한 번만 붙이고 떼지 않는다.
//  2) 브라우저·마우스에 따라 deltaY가 줄(1)·페이지(2) 단위로 오면 값이 작아 거의 안 움직였다 → 픽셀로 환산.
//  3) 우주 화면(UniverseCanvas, data-universe-zoom) 위에서 굴린 휠만 줌으로 쓴다. 메뉴·목록 스크롤과 분리.
//  4) 현재 거리에 비례해 움직인다(휠 한 칸에 약 16%) — 가까이서도 멀리서도 같은 느낌.
const WHEEL_PIXELS_PER_LINE = 16;
const WHEEL_STEP_LIMIT = 300;
let wheelZoomInstalled = false;

function installWheelZoom() {
  if (Platform.OS !== 'web' || wheelZoomInstalled || typeof window === 'undefined') return;
  wheelZoomInstalled = true;
  window.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      // 캔버스 위에는 r3f가 이벤트용 div를 덧씌우므로 대상이 캔버스 자체가 아닐 수 있다.
      if (!(e.target as Element | null)?.closest?.('[data-universe-zoom]')) return;
      const unit =
        e.deltaMode === 1 ? WHEEL_PIXELS_PER_LINE : e.deltaMode === 2 ? window.innerHeight : 1;
      const dy = Math.min(Math.max(e.deltaY * unit, -WHEEL_STEP_LIMIT), WHEEL_STEP_LIMIT);
      const next = targetCameraZ * Math.exp(dy * 0.0015);
      targetCameraZ = Math.min(Math.max(next, ZOOM_MIN), zoomMax);
    },
    { passive: true }
  );
}

type Framing = { center: [number, number, number]; spread: number; distance: number };

/** 행성 무리의 중심과, 75%의 행성이 화면(가로·세로 중 좁은 쪽)에 들어오는 카메라 거리. */
// 화면별로 처음 맞춘 화면 위치를 기억한다(홈 우주, 그룹 우주마다 따로).
// 상세·검색 화면에 갔다 돌아와 우주 화면이 다시 만들어져도 처음 위치로 되돌아가지 않게 하기 위함.
const framingCache = new Map<string, Framing>();

function computeFraming(entries: DiaryEntry[], aspect: number): Framing {
  const n = entries.length;
  const center = [0, 1, 2].map((k) => entries.reduce((s, e) => s + e.position[k], 0) / n) as [number, number, number];
  const dists = entries
    .map((e) => Math.hypot(e.position[0] - center[0], e.position[1] - center[1], e.position[2] - center[2]))
    .sort((a, b) => a - b);
  const spread = dists[Math.min(n - 1, Math.floor(n * 0.75))];
  const halfV = (CAMERA_FOV / 2) * (Math.PI / 180);
  const half = Math.min(halfV, Math.atan(Math.tan(halfV) * aspect));
  const distance = Math.max((spread + PLANET_BASE_RADIUS * 1.3) / Math.sin(half), 3);
  return { center, spread: Math.max(spread, 1), distance };
}

export function UniverseScene({
  entries,
  onStarPress,
  sceneKey = 'home',
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
  /** 화면 위치를 기억할 이름 (홈 'home', 그룹 우주는 그룹 id) */
  sceneKey?: string;
}) {
  const groupRef = useRef<Group>(null);
  // 화면이 다시 만들어졌을 때 첫 프레임은 저장된 각도·거리로 바로 맞춘다(서서히 돌아가며 초기화되는 것처럼 보이지 않게).
  const synced = useRef(false);
  const { width } = useWindowDimensions();
  const quality = choosePlanetQuality(entries.length, width);
  const size = useThree((s) => s.size);

  useEffect(() => {
    installWheelZoom();
    loadSettings();
  }, []);

  // 처음 화면 맞추기: 행성들의 중심을 회전 중심으로 삼고, 대부분의 행성이 화면에 들어오는 거리에서 시작한다.
  // 좌표(일기 의미로 정한 위치)는 그대로이고, 전체를 함께 옮겨 '카메라가 행성 무리를 보게' 할 뿐이다.
  // (전에는 원점 기준이라 행성이 카메라 바로 앞이나 뒤에 놓여 크게 가리거나 안 보이는 일이 있었다.)
  // 처음 일기 목록이 들어왔을 때 한 번만 정한다(일기를 추가해도 화면이 갑자기 옮겨 가지 않게).
  const [framing, setFraming] = useState<Framing | null>(() => framingCache.get(sceneKey) ?? null);
  if (!framing && entries.length > 0) setFraming(computeFraming(entries, size.width / Math.max(size.height, 1)));
  useEffect(() => {
    if (!framing) return;
    zoomMax = Math.max(ZOOM_MAX_DEFAULT, framing.distance * 1.6);
    // 이 화면을 처음 열 때만 카메라 거리를 맞춘다. 다시 돌아온 경우에는 사용자가 확대·축소한 거리를 유지한다.
    if (!framingCache.has(sceneKey)) {
      framingCache.set(sceneKey, framing);
      targetCameraZ = framing.distance;
    }
  }, [framing, sceneKey]);

  // 선택: 웹은 마우스를 올린 행성, 터치는 누른 행성. 누른 강조는 잠깐 보였다가(일기 화면으로 넘어가는 동안) 서서히 꺼진다.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pressId, setPressId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);
  const selectedId = pressId ?? hoverId;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.cursor = hoverId ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hoverId]);

  // 웹 마우스 올림: r3f native 이벤트는 웹에서 누르고 있을 때만 포인터 이동을 전달해서,
  // 마우스 이동을 직접 받아 카메라에서 광선을 쏴 가장 가까운 행성을 고른다(한 프레임에 한 번).
  const planetMeshes = useRef(new Map<string, Mesh>());
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  const glElement = useThree((s) => s.gl.domElement);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    // expo-gl(웹)에서는 gl.domElement가 실제 DOM 캔버스가 아닐 수 있어, 아니면 문서의 캔버스를 쓴다(이 화면의 캔버스는 하나)
    const canvas =
      typeof HTMLCanvasElement !== 'undefined' && glElement instanceof HTMLCanvasElement
        ? glElement
        : document.querySelector('canvas');
    if (!canvas) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const pick = () => {
      frame = 0;
      if (!last) return;
      let id: string | null = null;
      // 캔버스 위에는 r3f가 깐 투명한 겹 div가 있어 target이 그 div다. 캔버스이거나 캔버스 옆의 그 겹이면 우주 화면 위로 본다
      // (메뉴 버튼 같은 다른 UI 위에서는 행성을 고르지 않는다).
      const t = last.target as Element | null;
      if (t === canvas || t?.parentElement?.contains(canvas)) {
        const r = canvas.getBoundingClientRect();
        const ndc = new Vector2(((last.clientX - r.left) / r.width) * 2 - 1, -((last.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects([...planetMeshes.current.values()], false)[0];
        id = (hit?.object.userData.diaryId as string | undefined) ?? null;
      }
      setHoverId((cur) => (cur === id ? cur : id));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(pick);
    };
    const onLeave = () => setHoverId(null);
    window.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [camera, raycaster, glElement]);

  // 특수 효과 단계(LOD): 0.3초마다 카메라와 특수 행성 사이 거리를 재서, 가까운 순서로 maxNear개까지만 '가까이'(1).
  // 나머지는 '멀리'(0, 바탕 층만 멈춘 채). 선택한 행성(2)은 효과 쪽에서 바로 판단한다. 좌표는 바꾸지 않는다.
  const specialEntries = useMemo(() => entries.filter((e) => effectToDraw(e.effect)), [entries]);
  const lodClock = useRef(0);
  const centerRef = useRef<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    centerRef.current = framing?.center ?? [0, 0, 0];
  }, [framing]);
  useEffect(() => () => EFFECT_TIERS.clear(), []);

  useFrame((state, delta) => {
    if (!synced.current && groupRef.current) {
      groupRef.current.rotation.y = targetRotX;
      groupRef.current.rotation.x = targetRotY;
      state.camera.position.z = targetCameraZ;
      synced.current = true;
    }
    lodClock.current += delta;
    if (lodClock.current > 0.3 && groupRef.current) {
      lodClock.current = 0;
      const [cx, cy, cz] = centerRef.current;
      const m = groupRef.current.matrixWorld;
      const tmp = new Vector3();
      const ranked = specialEntries
        .map((e) => {
          tmp.set(e.position[0] - cx, e.position[1] - cy, e.position[2] - cz).applyMatrix4(m);
          return { id: e.id, d: tmp.distanceTo(state.camera.position) };
        })
        .sort((a, b) => a.d - b.d);
      const maxNear = SPECIAL_EFFECT_SETTINGS.maxNear[quality];
      EFFECT_TIERS.clear();
      ranked.forEach((r, i) => {
        const tier: EffectTier = i < maxNear && r.d < SPECIAL_EFFECT_SETTINGS.nearDistance ? 1 : 0;
        EFFECT_TIERS.set(r.id, tier);
      });
    }
    if (groupRef.current) {
      groupRef.current.rotation.y += (targetRotX - groupRef.current.rotation.y) * 0.1;
      groupRef.current.rotation.x += (targetRotY - groupRef.current.rotation.x) * 0.1;
    }
    const focus = SCENE_UNIFORMS.uFocus;
    focus.value += ((selectedId ? 1 : 0) - focus.value) * Math.min(1, delta * 8);
    state.camera.position.z += (targetCameraZ - state.camera.position.z) * 0.1;
    // 무리 중심보다 먼 행성일수록 조금 어둡게(셰이더 uDepthFade)
    const camZ = state.camera.position.z;
    SCENE_UNIFORMS.uDepthFade.value.set(camZ, camZ + (framing?.spread ?? 3) * 1.2);
  });

  const center = framing?.center ?? [0, 0, 0];
  return (
    <>
      <DragPlane />
      <group ref={groupRef}>
        <Starfield count={QUALITY_SETTINGS[quality].stars} />

        <group position={[-center[0], -center[1], -center[2]]}>
          {entries.map((entry) => (
            <Planet
              key={entry.id}
              id={entry.id}
              position={entry.position}
              radius={PLANET_BASE_RADIUS * planetScaleForText(entry.text)}
              visual={entry.planet}
              brightness={entry.brightness}
              quality={quality}
              selected={entry.id === selectedId}
              special={effectToDraw(entry.effect)}
              onPress={() => onStarPress(entry.id)}
              registerMesh={(mesh) => {
                if (mesh) {
                  mesh.userData.diaryId = entry.id;
                  planetMeshes.current.set(entry.id, mesh);
                } else {
                  planetMeshes.current.delete(entry.id);
                }
              }}
              onPressStart={() => {
                setPressId(entry.id);
                if (pressTimer.current) clearTimeout(pressTimer.current);
                pressTimer.current = setTimeout(() => setPressId(null), 700);
              }}
            />
          ))}
        </group>
      </group>
    </>
  );
}

/** 3D 우주 화면. 드래그 회전은 UniverseScene 안의 DragPlane이 처리한다. */
export function UniverseCanvas({
  entries,
  onStarPress,
  sceneKey,
}: {
  entries: DiaryEntry[];
  onStarPress: (id: string) => void;
  sceneKey?: string;
}) {
  return (
    // dataSet은 웹에서 data-universe-zoom 속성이 된다 (휠 줌 대상 판단용, installWheelZoom 참고).
    <View style={{ flex: 1 }} {...({ dataSet: { universeZoom: 'true' } } as object)}>
      {/* 시야각 50도(기본 75도): 화면 가장자리 행성이 타원처럼 늘어나는 왜곡과 가까운 행성만 크게 보이는 차이를 줄인다 */}
      <Canvas style={{ flex: 1 }} camera={{ fov: CAMERA_FOV, position: [0, 0, 5] }}>
        <UniverseScene entries={entries} onStarPress={onStarPress} sceneKey={sceneKey} />
      </Canvas>
    </View>
  );
}

// ---------------------------------------------------------------- 미리보기 (상점·행성 꾸미기)
// [ADDED 2026-11-12] 행성 하나 + 특수 효과를 작은 화면에 그린다. 우주 화면과 같은 Planet·SpecialEffect 코드를 쓴다.
// 우주 화면의 공통 값(선택 중 어둡게 등)에 영향을 받지 않도록 자기 값을 따로 쓴다.
const PREVIEW_UNIFORMS: SharedUniforms = { uFocus: { value: 0 }, uDepthFade: { value: new Vector2(100, 200) } };

function PreviewSpin({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  // 효과가 여러 방향에서 보이도록 천천히 돈다(행성 자전과 별개)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.25;
  });
  return <group ref={ref}>{children}</group>;
}

export function PlanetPreview({
  id,
  visual,
  radius = PLANET_BASE_RADIUS,
  effect,
  quality = 'medium',
}: {
  /** 행성 고정 난수(무늬 배치)의 기준. 실제 일기 id를 주면 우주 화면과 같은 모습이 된다. */
  id: string;
  visual: PlanetVisual;
  radius?: number;
  effect: SpecialType | null;
  quality?: PlanetQuality;
}) {
  // 행성 크기와 상관없이 화면을 비슷하게 채우도록 카메라 거리를 반지름에 맞춘다(성운 판·궤도까지 보이게)
  const distance = radius * 5.2;
  return (
    <Canvas style={{ flex: 1 }} camera={{ fov: CAMERA_FOV, position: [0, radius * 0.9, distance] }}>
      <PreviewSpin>
        <Planet
          id={id}
          position={[0, 0, 0]}
          radius={radius}
          visual={visual}
          quality={quality}
          special={effectToDraw(effect)}
          effectTier={2}
          shared={PREVIEW_UNIFORMS}
        />
      </PreviewSpin>
    </Canvas>
  );
}
