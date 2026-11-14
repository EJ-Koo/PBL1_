// 행성 외형 규칙(프론트 쪽).
// - 색·무늬·고리·대기광: AI 서비스가 감정 분석으로 정한 값(PlanetVisual)을 그대로 그린다.
//   계산 규칙과 대표색 표: ai/src/emotion/planet_visual.py, ai/reports/planet_visual_v02_ko.md
// - 크기: 일기 분량(공백 제외 글자 수)만으로 정한다. 감정 점수·사진 수는 크기에 쓰지 않는다.
// - 위치: 서버가 정한 좌표(일기 의미) 그대로. 여기서 바꾸지 않는다.
import { Platform } from 'react-native';

export type PlanetState = 'clear' | 'soft' | 'muted' | 'none';
export type PlanetPattern = 'storm' | 'bands' | 'soft' | 'mist';

export type PlanetAccent = {
  group: string;
  name: string;
  label: string;
  score: number;
  color: string;
  /** 행성 표면에서 차지하는 최대 비율(0~0.26). 주 감정 색이 항상 가장 넓다. */
  weight: number;
  /** main: 기준값 대비 여유 순 보조 감정 / rare: 남은 판정 감정 중 가장 드문 그룹(작은 면적). 화면에서는 둘 다 가는 층으로 그린다. */
  slot: 'main' | 'rare';
};

/** AI 서비스 compute_visual()의 출력. 백엔드 GET /stars 의 planet 필드. */
export type PlanetVisual = {
  version: string;
  state: PlanetState;
  primary: { group: string; name: string; label: string; score: number; passed: boolean };
  none_prob: number;
  base_color: string;
  tone_color: string;
  accents: PlanetAccent[];
  pattern: PlanetPattern;
  turbulence: number;
  glow: number;
  ring: { visible: boolean; color: string | null };
  atmosphere: { visible: boolean; color: string | null };
  valence: number;
};

// ---------------------------------------------------------------- 크기 (일기 분량)
/**
 * 기본 표시 반지름. 배율(0.8~1.3)을 곱한 최대 반지름 0.39 × 2 = 0.78이 AI 배치의 최소 간격(min_dist 0.8)보다 작아
 * 큰 행성 둘이 3D 공간에서 서로 파고들지 않는다(0.35였을 때는 0.91이라 가능했다). 좌표는 바꾸지 않는다.
 */
export const PLANET_BASE_RADIUS = 0.3;
export const PLANET_SCALE_MIN = 0.8;
export const PLANET_SCALE_MAX = 1.3;
/** 이 글자 수(공백 제외) 이상이면 최대 크기. */
export const PLANET_CHARS_FOR_MAX = 600;
const PLANET_CHARS_CURVE = 50;

export function countCharsNoSpace(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

/**
 * 공백 제외 글자 수 → 크기 배율(0.8~1.3). 로그 곡선이라 짧은 일기에서는 빠르게, 긴 일기에서는 천천히 커진다.
 * 예: 0자 0.80 · 50자 0.94 · 200자 1.11 · 600자 이상 1.30
 */
export function planetScaleForText(text: string): number {
  const n = Math.min(countCharsNoSpace(text), PLANET_CHARS_FOR_MAX);
  const ratio = Math.log1p(n / PLANET_CHARS_CURVE) / Math.log1p(PLANET_CHARS_FOR_MAX / PLANET_CHARS_CURVE);
  return PLANET_SCALE_MIN + (PLANET_SCALE_MAX - PLANET_SCALE_MIN) * ratio;
}

// ---------------------------------------------------------------- AI 분석이 없을 때
/** AI 분석 전(또는 AI 서비스 없음) 행성. 감정 색처럼 보이지 않도록 무채색 달빛 톤으로 그린다. */
export const UNANALYZED_COLOR = '#E4E1D8';

export function fallbackVisual(color: string | null): PlanetVisual {
  const analyzed = !!color && color.toLowerCase() !== '#ffffff';
  const base = analyzed ? (color as string) : UNANALYZED_COLOR;
  return {
    version: 'fallback',
    // 저장된 색은 있지만 상세 외형이 없으면(AI 서비스 꺼짐) 대표색만 무늬 없이 보여 준다.
    state: analyzed ? 'soft' : 'none',
    primary: { group: '', name: '', label: '', score: 0, passed: false },
    none_prob: 0,
    base_color: base,
    tone_color: base,
    accents: [],
    pattern: 'mist',
    turbulence: 0.2,
    glow: analyzed ? 0.4 : 0.1,
    ring: { visible: false, color: null },
    atmosphere: { visible: false, color: null },
    valence: 0,
  };
}

// ---------------------------------------------------------------- 품질 설정
export type PlanetQuality = 'low' | 'medium' | 'high';

export const QUALITY_SETTINGS: Record<
  PlanetQuality,
  { segments: number; octaves: number; atmosphere: boolean; ringSegments: number; stars: number }
> = {
  low: { segments: 20, octaves: 2, atmosphere: false, ringSegments: 40, stars: 250 },
  medium: { segments: 32, octaves: 3, atmosphere: true, ringSegments: 64, stars: 350 },
  high: { segments: 48, octaves: 4, atmosphere: true, ringSegments: 96, stars: 500 },
};

/**
 * 행성 품질. EXPO_PUBLIC_PLANET_QUALITY(low|medium|high)로 고정할 수 있고, 없으면 기기와 행성 수로 정한다.
 * 행성 하나당 그리기 호출: 본체 1 + 고리(있을 때) 1 + 바깥 대기막 1(low 제외).
 * atmosphere: 바깥 얇은 대기막(끄면 표면 가장자리 빛만), stars: 배경 별 개수.
 */
export function choosePlanetQuality(planetCount: number, screenWidth: number): PlanetQuality {
  const forced = process.env.EXPO_PUBLIC_PLANET_QUALITY;
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced;
  if (planetCount > 150) return 'low';
  if (Platform.OS !== 'web' || screenWidth < 600 || planetCount > 60) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------- 표면 색 (감정 대표색 계열)
// 행성 첫인상 = 주 감정 대표색. 표면 결은 대표색과 같은 색상 계열의 4색(어두운 색·대표색·무늬색·밝은 색)으로만 만든다.
// 보조 감정은 그 사이를 흐르는 가는 층(필라멘트)으로만 넣고, 명도·채도를 대표색 쪽으로 맞춰 무지개 줄무늬가 되지 않게 한다.
// 구에서 위도 띠의 면적은 높이(y, -1~1) 구간 길이에 비례하므로(아르키메데스), 보조 감정 층의 면적 ≈ weight × FILAMENT_FILL이다.

/** 무늬 종류별 표면 결. layers: 층 명암 대비, flow: 층이 흐르며 휘는 정도, swirl: 소용돌이 세기, cloud: 흐릿한 구름 양. */
export const PATTERN_STYLE: Record<
  PlanetPattern,
  { layers: number; flow: number; swirl: number; cloud: number }
> = {
  mist: { layers: 0.55, flow: 0.18, swirl: 0.0, cloud: 0.6 },
  soft: { layers: 0.9, flow: 0.22, swirl: 0.6, cloud: 0.45 },
  bands: { layers: 1.15, flow: 0.28, swirl: 1.2, cloud: 0.35 },
  storm: { layers: 1.3, flow: 0.4, swirl: 2.2, cloud: 0.3 },
};

type Rgb = [number, number, number];
type Hsl = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbToHsl([r, g, b]: Rgb): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: Hsl): Rgb {
  const hue = (p: number, q: number, t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.round(Math.min(Math.max(c, 0), 1) * 255).toString(16).padStart(2, '0')).join('');
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/**
 * 대표색 계열 팔레트. 색상(hue)은 대표색 그대로 두고 명도·채도만 바꾼다(반대색을 만들지 않음).
 * deep: 어두운 층(그늘진 결) · base: 대표색 · tone: 같은 그룹 무늬색(서버) · light: 밝은 파스텔 층(구름·대기광·고리)
 */
export function planetPalette(visual: PlanetVisual): { deep: string; base: string; tone: string; light: string } {
  const [h, s, l] = rgbToHsl(hexToRgb(visual.base_color));
  // 노랑 계열은 어둡게 하면 올리브·갈색(지침 색)처럼 보여서 그늘 색을 덜 어둡게, 주황 쪽으로 조금만 옮긴다
  const yellow = h > 0.08 && h < 0.2;
  const deepHue = yellow ? h - 0.02 : (h + 0.012) % 1;
  return {
    deep: rgbToHex(hslToRgb([(deepHue + 1) % 1, s * 0.85, l * (yellow ? 0.78 : 0.66)])),
    base: visual.base_color,
    tone: visual.tone_color,
    // 밝은 색도 채도를 남겨 둔다(너무 옅으면 '없음' 회청색처럼 보인다).
    // 파랑 계열은 밝게 하면 연보라(불안 색)처럼 보여서 하늘색 쪽으로 조금 옮긴다.
    light: rgbToHex(hslToRgb([(h + (h > 0.55 && h < 0.7 ? 0.97 : 0.99)) % 1, s * 0.85, l + (0.95 - l) * 0.4])),
  };
}

/**
 * 보조 감정 색을 대표색 팔레트에 맞춘다. 색상(감정 구별)은 그대로 두고, 채도는 낮추고 명도는 대표색 근처로 모은다.
 * → 보조 감정이 보이되 원색 줄무늬처럼 튀지 않는다.
 */
export function harmonizeAccent(accentHex: string, baseHex: string): string {
  const [ha, sa, la] = rgbToHsl(hexToRgb(accentHex));
  const [, sb, lb] = rgbToHsl(hexToRgb(baseHex));
  // 채도는 낮추되 0.4 아래로는 내리지 않는다(갈색 같은 낮은 채도 색이 회색 = '없음'처럼 보이지 않게)
  const s = Math.max(Math.min(sa, 0.8) * 0.75 * (0.6 + 0.4 * Math.min(sb / 0.6, 1)), Math.min(sa, 0.4));
  const l = Math.min(Math.max(la * 0.4 + (lb + 0.08) * 0.6, 0.32), 0.8);
  return rgbToHex(hslToRgb([ha, s, l]));
}

export type PlanetBand = { color: string; group: string; start: number; end: number };

/** 보조 감정 층이 퍼지는 구역 = 면적 × 이 배수. 구역 안에서 가는 층은 FILAMENT_FILL/배수만큼 차지한다. */
const FILAMENT_SPREAD = 1.8;
/**
 * 보조 감정 층이 실제로 차지하는 면적 = weight × 이 값. 층은 거의 불투명하게 그린다.
 * (반투명으로 섞으면 파랑 위 황갈색처럼 반대에 가까운 색이 회색이 되어 '없음'처럼 보였다.
 *  대신 면적을 줄여 대표색이 첫인상을 유지하게 한다.)
 */
const FILAMENT_FILL = 0.65;

/**
 * 보조 감정 → 가는 층이 모인 구역의 위치(y, -1~1). rand는 일기마다 고정된 난수로, 감정과 무관한 배치 변화에만 쓴다.
 * 구역 사이와 양 극에는 주 감정 바탕을 둔다(극 쪽을 더 넓게 → 보조 층은 중위도).
 */
export function planetBands(accents: PlanetAccent[], rand: number[]): PlanetBand[] {
  let k = 0;
  const next = () => rand[k++ % rand.length];
  const pieces = accents
    .filter((a) => a.weight > 0)
    .map((a) => ({ color: a.color, group: a.group, h: 2 * a.weight * FILAMENT_SPREAD }));
  if (!pieces.length) return [];
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  const free = Math.max(2 - pieces.reduce((s, p) => s + p.h, 0), 0.2);
  const gapW = Array.from({ length: pieces.length + 1 }, (_, i) =>
    i === 0 || i === pieces.length ? 1.4 + next() * 0.6 : 0.5 + next() * 0.8
  );
  const gapSum = gapW.reduce((s, w) => s + w, 0);
  const bands: PlanetBand[] = [];
  let y = -1 + (free * gapW[0]) / gapSum;
  pieces.forEach((p, i) => {
    bands.push({ color: p.color, group: p.group, start: y, end: y + p.h });
    y += p.h + (free * gapW[i + 1]) / gapSum;
  });
  return bands;
}

/** 일기 id 난수 → 결정적 난수열(mulberry32). */
function makeRng(seed01: number) {
  let a = Math.floor(seed01 * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1차원 값 노이즈(0~1, 부드러운 보간). */
function makeNoise1D(rng: () => number) {
  const table = Array.from({ length: 256 }, rng);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return table[i & 255] + (table[(i + 1) & 255] - table[i & 255]) * u;
  };
}

function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * t) as Rgb;

export const BAND_TEXELS = 512;

/**
 * 위도(y) → 표면 색 한 줄(RGBA, sRGB 0~255). 셰이더가 이 줄을 흐르는 좌표로 읽어 구름층·광물층 같은 결을 만든다.
 * 1) 여러 주기의 노이즈를 겹친 '층 값' → 대표색 계열 4색. 대표색이 가운데 넓은 구간을 차지하고, 양 끝 일부만 어두운 색·무늬색·밝은 색
 * 2) 보조 감정: 구역 안에서 가는 층으로만, 대표색 쪽으로 맞춘 색을 거의 불투명하게(면적은 weight의 65%)
 */
export function planetBandStrip(visual: PlanetVisual, rand: number[]): Uint8Array {
  const pal = planetPalette(visual);
  const [deep, base, tone, light] = [pal.deep, pal.base, pal.tone, pal.light].map(hexToRgb);
  // 층 값 → 색. 가운데 넓은 구간은 대표색 그대로(첫인상), 높은 쪽 일부만 무늬색·밝은 색, 낮은 쪽 일부만 어두운 색.
  const ramp = (v: number): Rgb => {
    let c = mixRgb(base, tone, smoothstep(0.55, 0.72, v) * 0.8);
    c = mixRgb(c, light, smoothstep(0.74, 0.95, v) * 0.7);
    return mixRgb(c, deep, smoothstep(0.3, 0.08, v) * 0.75);
  };
  const { layers } = PATTERN_STYLE[visual.pattern];
  const rng = makeRng(rand[0]);
  const noise = makeNoise1D(rng);
  const off = Array.from({ length: 5 }, () => rng() * 200);

  // 보조 감정 층: 노이즈가 문턱값을 넘는 곳만. 문턱값 = 넘는 비율이 FILAMENT_FILL/FILAMENT_SPREAD 가 되는 표본 분위수
  const FIL_FREQ = 28;
  const bands = planetBands(visual.accents, rand.slice(1)).map((b, i) => {
    const o = off[4] + i * 57;
    const samples = Array.from({ length: 600 }, (_, s) => noise(s * 0.37 + o)).sort((x, y) => x - y);
    const th = samples[Math.floor(samples.length * (1 - FILAMENT_FILL / FILAMENT_SPREAD))];
    return { ...b, rgb: hexToRgb(harmonizeAccent(b.color, visual.base_color)), th, o };
  });

  const out = new Uint8Array(BAND_TEXELS * 4);
  for (let i = 0; i < BAND_TEXELS; i++) {
    const y = -1 + (2 * (i + 0.5)) / BAND_TEXELS;
    // 층 값: 넓은 층 + 중간 층 + 가는 층. 대비(layers)가 낮을수록 대표색 근처에 머문다.
    let v = 0.55 * noise(y * 3 + off[0]) + 0.3 * noise(y * 9 + off[1]) + 0.15 * noise(y * 26 + off[2]);
    v = 0.47 + (v - 0.5) * 1.35 * layers + (noise(y * 40 + off[3]) - 0.5) * 0.12 * layers;
    let col = ramp(clamp01(v));
    for (const b of bands) {
      const e = Math.min(0.06, (b.end - b.start) * 0.25);
      const zone = smoothstep(b.start - e, b.start + e, y) * (1 - smoothstep(b.end - e, b.end + e, y));
      if (zone <= 0) continue;
      const fil = smoothstep(b.th - 0.09, b.th + 0.09, noise(y * FIL_FREQ + b.o));
      col = mixRgb(col, b.rgb, zone * fil * 0.92);
    }
    col.forEach((c, j) => (out[i * 4 + j] = Math.round(clamp01(c) * 255)));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// ---------------------------------------------------------------- 행성별 고정 난수
/** 일기 id → 0~1 난수 여러 개. 무늬 위치·기울기 같은 '감정과 무관한 변화'에만 쓴다(같은 일기는 항상 같은 모양). */
export function seededRandoms(id: string, count: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    out.push((h >>> 0) / 4294967296);
  }
  return out;
}
