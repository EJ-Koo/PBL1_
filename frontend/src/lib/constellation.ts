// [NEW FILE 2026-11-12] 주제 기반 별자리(Constellation) — 설정·템플릿·해금·행성 선택·배치 계산.
//
// 원칙
//  - 별자리는 '화면 표시용'이다. 행성의 원래 좌표(bge-m3 기반, 서버 stars 표)는 바꾸지 않고 저장하지도 않는다.
//    여기서 계산한 목표 좌표는 우주 화면이 잠깐 옮겨 그릴 때만 쓴다(components/universe-scene.tsx).
//  - 해금 여부는 저장하지 않고 '지금 그 주제의 일기 개수'로 매번 계산한다.
//    → 일기를 지우면 개수가 줄어 해금도 함께 줄어든다(일기 삭제 정책과 같은 기준, 따로 지울 데이터가 없음).
//  - 주제는 일기 작성 화면의 선택지(DIARY_TOPICS, 서버 Topic)를 그대로 쓴다. 주제가 없는 일기는 어느 별자리에도 넣지 않는다.
//  - 새 AI 모델·학습 없음. 템플릿은 미리 정해 둔 좌표(정규화 좌표, 대략 -1~1)를 화면 크기에 맞춰 늘리고 줄인다.
//
// 이 파일은 React/three 를 쓰지 않는 순수 TS 라 `npm test`(node --test)로 바로 확인한다(tests/constellation.test.mjs).
import type { ApiPersonalConstellation } from './api';
import type { DiaryTopic } from './special-planet';

/** 1~3 = 고정형 템플릿, 4 = [2026-11-15] 나만의 별자리(LLM 개인화 생성, 서버 저장) */
export type ConstellationLevel = 1 | 2 | 3 | 4;
export type Point3 = [number, number, number];

export type ConstellationTemplate = {
  /** 예: travel_airplane */
  id: string;
  topic: DiaryTopic;
  level: ConstellationLevel;
  /** 예: 비행기 별자리 */
  name: string;
  /** 짧은 모양 이름(목록·칩에 쓰는 이름). 예: 비행기 */
  shape: string;
  description: string;
  /** 해금에 필요한 이 주제의 일기(행성) 수 = points.length (설정 CONSTELLATION_CONFIG.thresholds 와 같다) */
  requiredPlanets: number;
  /** 정규화 좌표(가로·세로 중 긴 쪽이 -1~1). y 가 위. 화면에서는 이 비율 그대로 크기만 바뀐다. */
  points: Point3[];
  /** 연결선 [i, j] (points 번호). 배열 순서 = 선이 그려지는 순서. */
  connections: [number, number][];
  /** 오각별처럼 모양 자체가 선의 교차로 이루어진 경우만 true (검사에서 교차 허용) */
  allowCrossings?: boolean;
  /** Group shapes contain three times the stars, so need more line segments. */
  lineLimit?: number;
};

// ---------------------------------------------------------------- 설정
/**
 * 별자리 설정. 해금 기준(thresholds)은 여기서 바꾼다.
 * 템플릿의 점 개수는 이 값과 같아야 한다(테스트가 확인). 기준을 바꾸면 해당 레벨 템플릿의 점 개수도 함께 맞춘다.
 */
export const GROUP_CONSTELLATION_MAX_LINES = 120;

export const CONSTELLATION_CONFIG = {
  thresholds: { 1: 5, 2: 10, 3: 20, 4: 30 } as Record<ConstellationLevel, number>,
  /** 행성 사이 최소 간격: 두 행성 중심 거리 ≥ 두 반지름 합 × spacing (겹침 방지) */
  spacing: 1.7,
  /** 별자리 최소 크기(긴 쪽 반폭, 월드 단위). 작은 별자리가 너무 작게 모이지 않게. */
  minHalfSize: 1.5,
  /** 별자리 평면을 다른 행성들보다 얼마나 카메라 쪽으로 띄울지(가려짐 방지, 월드 단위) */
  frontMargin: 0.6,
  /** 화면 가장자리 여백(행성 반지름의 배수) */
  edgePadding: 1.6,
  /** 연결선 최대 개수(성능) */
  maxLines: 40,
  /** 애니메이션 시간(초). 보이기 전체 ≈ move + stagger×n + 선 그리기 ≈ 2.5~3초 */
  timing: {
    move: 1.5,
    /** 행성마다 출발을 조금씩 늦춘다(한꺼번에 움직이지 않게) */
    stagger: 0.035,
    /** 연결선 한 개가 그려지는 시간 */
    lineDraw: 0.32,
    /** 다음 선이 시작되는 간격(앞 선과 조금 겹친다). 선이 많으면 linesTotal 안에 끝나도록 줄인다 */
    lineGap: 0.08,
    /** 모든 선을 그리는 데 쓰는 최대 시간 */
    linesTotal: 1.25,
    /** 숨길 때 선이 사라지는 시간 */
    lineFade: 0.35,
    /** 숨길 때 원래 자리로 돌아가는 시간 */
    returnMove: 1.3,
  },
  /** 별자리가 아닌 행성의 눈에 보이는 밝기(0~1, 1=그대로). 셰이더에는 선형 값으로 바꿔 넣는다 */
  dimOthers: 0.3,
} as const;

/**
 * 주제별 별자리 콘셉트 이름·연결선 색. 주제 id·라벨은 DIARY_TOPICS(lib/special-planet.ts)와 같다.
 * 연결선 색은 채도를 낮춘 옅은 빛(행성의 감정 색이 주인공이고 선은 모양만 보조한다).
 */
export const TOPIC_CONCEPTS: Record<DiaryTopic, { label: string; title: string; color: string }> = {
  travel: { label: '여행', title: '여행의 기억', color: '#C7DAFF' },
  relationship: { label: '인간관계', title: '소중한 인연', color: '#FFD3E2' },
  study_achievement: { label: '학업·성취', title: '성장의 기록', color: '#FFE7B8' },
  rest_daily: { label: '휴식·일상', title: '평온한 순간', color: '#CDEFE6' },
  challenge_activity: { label: '도전·활동', title: '도전의 여정', color: '#FFD0B5' },
  other: { label: '기타', title: '자유로운 기억', color: '#DED4FF' },
};

export const CONSTELLATION_TOPICS = Object.keys(TOPIC_CONCEPTS) as DiaryTopic[];

// ---------------------------------------------------------------- 템플릿 작성 도우미
type P2 = [number, number];

function rotate(points: P2[], degrees: number): P2[] {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return points.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** 곡선 fn(t), t∈[t0,t1] 위에 같은 길이 간격으로 n개(양 끝 포함). */
function sampleCurve(fn: (t: number) => P2, n: number, t0: number, t1: number): P2[] {
  const steps = 800;
  const pts: P2[] = [];
  for (let i = 0; i <= steps; i++) pts.push(fn(t0 + ((t1 - t0) * i) / steps));
  const acc: number[] = [0];
  for (let i = 1; i <= steps; i++) {
    acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = acc[steps];
  const out: P2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < steps - 1 && acc[j + 1] < target) j++;
    const seg = acc[j + 1] - acc[j] || 1;
    const f = Math.min(Math.max((target - acc[j]) / seg, 0), 1);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return out;
}

/** 가로·세로 중 긴 쪽 반폭이 1이 되도록 가운데 맞춤(비율 유지). 소수 셋째 자리로 반올림. */
function normalize(points: P2[]): Point3[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 || 1;
  const r = (v: number) => Math.round(v * 1000) / 1000 + 0; // +0: -0 → 0
  return points.map(([x, y]) => [r((x - cx) / half), r((y - cy) / half), 0]);
}

function chain(indices: number[], closed = false): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < indices.length; i++) out.push([indices[i], indices[i + 1]]);
  if (closed && indices.length > 2) out.push([indices[indices.length - 1], indices[0]]);
  return out;
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

function make(
  topic: DiaryTopic,
  level: ConstellationLevel,
  key: string,
  shape: string,
  description: string,
  points: P2[],
  connections: [number, number][],
  extra: Partial<ConstellationTemplate> = {}
): ConstellationTemplate {
  return {
    id: `${topic}_${key}`,
    topic,
    level,
    name: `${shape} 별자리`,
    shape,
    description,
    requiredPlanets: CONSTELLATION_CONFIG.thresholds[level],
    points: normalize(points),
    connections,
    ...extra,
  };
}

// ---------------------------------------------------------------- 여행
// L1 나침반: 마름모 테두리 + 가운데에서 네 방향으로 뻗은 바늘. 북쪽(위)이 조금 더 길다.
const COMPASS: P2[] = [[0, 1], [0.62, 0], [0, -0.86], [-0.62, 0], [0, 0.04]];

// L2 비행기(위에서 본 모습): 기수(위) — 동체 — 폭이 있는 뒤로 젖힌 양 날개(앞전·뒷전) — 꼬리 날개.
const AIRPLANE: P2[] = [
  [0, 1.0], //        0 기수
  [0, 0.36], //       1 날개 뿌리 앞(앞 동체)
  [-1.0, -0.04], //   2 왼쪽 날개 끝 앞
  [-0.88, -0.32], //  3 왼쪽 날개 끝 뒤
  [1.0, -0.04], //    4 오른쪽 날개 끝 앞
  [0.88, -0.32], //   5 오른쪽 날개 끝 뒤
  [0, -0.2], //       6 날개 뿌리 뒤(뒤 동체)
  [0, -0.7], //       7 꼬리 뿌리
  [-0.42, -0.98], //  8 왼쪽 꼬리 날개
  [0.42, -0.98], //   9 오른쪽 꼬리 날개
];

// L3 지구: 둥근 테두리 12점 + 위도선 3개 + 가운데 경선(타원) + 자전축. 23.5도 기울였다.
function globe(): { points: P2[]; connections: [number, number][] } {
  const ring: P2[] = range(0, 12).map((k) => {
    const a = Math.PI / 2 - (k * Math.PI) / 6; // 0=북극, 3=동, 6=남극, 9=서
    return [Math.cos(a), Math.sin(a)];
  });
  const mx = (y: number) => 0.48 * Math.sqrt(1 - y * y); // 경선 타원(반폭 0.48)
  const inner: P2[] = [
    [-mx(0.5), 0.5], [mx(0.5), 0.5], // 12, 13 북위선 × 경선
    [-mx(0), 0], [0, 0], [mx(0), 0], // 14, 15, 16 적도
    [-mx(-0.5), -0.5], [mx(-0.5), -0.5], // 17, 18 남위선 × 경선
  ];
  const axis: P2 = [0, 1.3]; // 19 자전축(북극 위)
  return {
    points: rotate([...ring, ...inner, axis], -23.5),
    connections: [
      [19, 0],
      ...chain(range(0, 12), true), // 테두리
      [11, 12], [12, 13], [13, 1], // 북위선
      [9, 14], [14, 15], [15, 16], [16, 3], // 적도
      [7, 17], [17, 18], [18, 5], // 남위선
      [0, 12], [12, 14], [14, 17], [17, 6], // 경선 왼쪽
      [0, 13], [13, 16], [16, 18], [18, 6], // 경선 오른쪽
    ],
  };
}

// ---------------------------------------------------------------- 인간관계
// L1 리본(인연의 매듭): 가운데 매듭 + 양쪽 고리(나비 모양). 점 5개로는 알아보기 쉬운 하트가 나오지 않아
// 하트는 L3(큰 하트)에 두고, L1은 '인연을 맺는다'는 뜻의 매듭으로 했다.
const RIBBON: P2[] = [[0, 0.04], [-1, 0.58], [-0.92, -0.52], [1, 0.58], [0.92, -0.52]];

// L2 꽃: 가운데 꽃술 + 꽃잎 5장(방사선) + 줄기 + 잎 두 장.
function flower(): P2[] {
  const c: P2 = [0, 0.32];
  const petals: P2[] = range(0, 5).map((k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return [c[0] + 0.58 * Math.cos(a), c[1] + 0.58 * Math.sin(a)];
  });
  return [c, ...petals, [0, -0.44], [0, -1.04], [-0.54, -0.64], [0.52, -0.86]];
}

// L3 큰 하트: 하트 곡선 위 16점 + 안쪽 작은 하트 4점(큰 하트 안에 작은 하트).
function bigHeart(): P2[] {
  const f = (t: number): P2 => [
    (16 * Math.sin(t) ** 3) / 17,
    (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
  ];
  const right = sampleCurve(f, 9, 0, Math.PI); // 위 오목점(0) → 오른쪽 → 아래 꼭짓점(8)
  const left = right.slice(1, 8).reverse().map(([x, y]) => [-x, y] as P2); // 아래 → 왼쪽 → 위(좌우 대칭)
  const inner: P2[] = [[-0.32, 0.06], [0, -0.1], [0.32, 0.06], [0, -0.5]];
  return [...right, ...left, ...inner];
}

// ---------------------------------------------------------------- 학업·성취
// L1 책(펼친 책): 바깥 모서리가 높고 가운데(책등)가 내려간 윗변 + 양옆 + 아랫변.
const BOOK: P2[] = [[-1, 0.42], [0, 0.16], [1, 0.42], [1, -0.5], [-1, -0.5]];

// L2 별: 오각별 테두리(바깥 꼭짓점 5 + 안쪽 꼭짓점 5).
function star10(): P2[] {
  return range(0, 10).map((k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? 1 : 0.44;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

// L3 왕관: 다섯 봉우리(지그재그) + 띠(사각형) + 띠 안 보석 3개 + 봉우리 위 구슬 3개.
const CROWN: P2[] = [
  [-1, 0.48], [-0.75, -0.04], [-0.5, 0.64], [-0.25, 0.02], [0, 0.86], [0.25, 0.02], [0.5, 0.64], [0.75, -0.04], [1, 0.48], // 0~8 봉우리
  [-0.92, -0.44], [0.92, -0.44], [0.92, -0.96], [0, -0.96], [-0.92, -0.96], // 9~13 띠
  [-0.46, -0.7], [0, -0.7], [0.46, -0.7], // 14~16 보석
  [-0.5, 1.0], [0, 1.24], [0.5, 1.0], // 17~19 구슬
];

// ---------------------------------------------------------------- 휴식·일상
// L1 초승달: 바깥 호(왼쪽으로 볼록) + 안쪽 호 한 점(오목).
const CRESCENT: P2[] = [[0.36, 1.0], [-0.58, 0.56], [-0.58, -0.56], [0.36, -1.0], [-0.08, 0]];

// L2 구름: 위가 몽글몽글한 테두리(봉우리 사이 오목한 곳 두 개) + 평평한 아래.
const CLOUD: P2[] = [
  [-0.88, -0.46], [-1.12, -0.04], [-0.72, 0.2], [-0.5, 0.66], [0.02, 0.84],
  [0.36, 0.42], [0.84, 0.46], [1.12, 0.0], [0.88, -0.46], [0, -0.46],
];

// L3 나무: 줄기(밑동·가운데·갈림) + 뿌리 둘 + 둥근 수관 테두리 11점(갈림점에서 닫힘) + 안쪽 가지 4점.
const TREE: P2[] = [
  [0, -1.0], [0, -0.7], [0, -0.38], // 0~2 줄기
  [-0.4, -1.12], [0.4, -1.12], // 3,4 뿌리
  [-0.5, -0.2], [-0.92, 0.08], [-1.0, 0.48], [-0.76, 0.86], [-0.38, 1.06], [0, 1.12], [0.38, 1.06], [0.76, 0.86], [1.0, 0.48], [0.92, 0.08], [0.5, -0.2], // 5~15 수관
  [-0.46, 0.24], [0.48, 0.32], [0, 0.26], [0, 0.68], // 16~19 가지
];

// ---------------------------------------------------------------- 도전·활동
// L1 화살: 화살대 끝 → 촉 뿌리 → 마름모꼴 화살촉. 오른쪽 위를 향한다.
const ARROW: P2[] = rotate([[-1.3, 0], [0.32, 0], [0.12, 0.44], [0.98, 0], [0.12, -0.44]], 35);

// L2 산: 큰 봉우리(정상에 깃발) + 눈 덮인 선 + 작은 봉우리 + 바닥.
const MOUNTAIN: P2[] = [
  [-1.1, -0.7], [-0.6, 0.27], [-0.35, 0.75], [-0.13, 0.39], [0.05, 0.1], // 0~4 왼쪽 비탈·정상·오른쪽 비탈·안부
  [0.55, 0.42], [1.1, -0.7], [0, -0.7], // 5~7 작은 봉우리·바닥
  [-0.35, 1.18], [0.06, 1.04], // 8,9 깃대 끝·깃발
];

// L3 불꽃: 세 갈래 불길 테두리 13점 + 안쪽 불꽃 7점.
const FLAME: P2[] = [
  [0, -1.0], [-0.62, -0.84], [-0.92, -0.36], [-0.86, 0.16], [-0.66, 0.76], [-0.46, 0.32], [-0.24, 0.8], [0.06, 1.24],
  [0.34, 0.66], [0.68, 0.9], [0.9, 0.16], [0.84, -0.38], [0.56, -0.84], // 0~12 바깥
  [0, -0.6], [-0.4, -0.38], [-0.42, 0.0], [-0.15, 0.34], [0.05, 0.58], [0.32, 0.08], [0.4, -0.38], // 13~19 안쪽
];

// ---------------------------------------------------------------- 기타
// L1 작은 별: 다섯 점을 한 붓으로 잇는 오각별(선의 교차가 모양 자체).
function pentagram(): P2[] {
  return range(0, 5).map((k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return [Math.cos(a), Math.sin(a)];
  });
}

// L2 다이아몬드: 윗면(테이블) 4점 + 허리(거들) 5점 + 아래 꼭짓점. 윗면과 허리를 지그재그로 이어 면을 만든다.
const DIAMOND: P2[] = [
  [-1, 0.15], [-0.6, 0.62], [-0.4, 0.15], [-0.2, 0.62], [0, 0.15], [0.2, 0.62], [0.4, 0.15], [0.6, 0.62], [1, 0.15],
  [0, -1.0],
];

// L3 은하: 가운데 핵 + 두 갈래 나선 팔(10점·9점). 원반을 비스듬히 본 것처럼 세로를 조금 눌렀다.
function galaxy(): P2[] {
  const arm = (phase: number, n: number) =>
    sampleCurve((t) => {
      const r = 0.3 + 0.72 * t;
      const a = phase + 1.2 * Math.PI * t;
      return [r * Math.cos(a), r * Math.sin(a)];
    }, n, 0, 1);
  const pts: P2[] = [[0, 0], ...arm(0, 10), ...arm(Math.PI, 9)];
  return rotate(pts.map(([x, y]) => [x, y * 0.8] as P2), 18);
}

// ---------------------------------------------------------------- 템플릿 목록
const G = globe();

export const CONSTELLATION_TEMPLATES: Record<DiaryTopic, ConstellationTemplate[]> = {
  travel: [
    make('travel', 1, 'compass', '나침반', '어디로 갈지 가리키는 첫 여행의 바늘', COMPASS,
      [[4, 0], [4, 1], [4, 2], [4, 3], [0, 1], [1, 2], [2, 3], [3, 0]]),
    make('travel', 2, 'airplane', '비행기', '더 먼 곳으로 날아오른 기억들', AIRPLANE,
      [[0, 1], [1, 6], [1, 2], [2, 3], [3, 6], [1, 4], [4, 5], [5, 6], [6, 7], [7, 8], [7, 9]]),
    make('travel', 3, 'globe', '지구', '발자국이 모여 하나의 세계가 된 여행', G.points, G.connections),
  ],
  relationship: [
    make('relationship', 1, 'ribbon', '리본', '두 마음을 처음 묶은 인연의 매듭', RIBBON,
      [[0, 1], [1, 2], [2, 0], [0, 3], [3, 4], [4, 0]]),
    make('relationship', 2, 'flower', '꽃', '함께한 시간이 피워 낸 꽃', flower(),
      [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [6, 7], [6, 8], [6, 9]]),
    make('relationship', 3, 'big_heart', '큰 하트', '소중한 인연이 감싸 안은 큰 마음', bigHeart(),
      [...chain(range(0, 16), true), [16, 17], [17, 18], [18, 19], [19, 16]]),
  ],
  study_achievement: [
    make('study_achievement', 1, 'book', '책', '한 장씩 넘겨 온 배움의 첫 페이지', BOOK,
      chain([0, 1, 2, 3, 4], true)),
    make('study_achievement', 2, 'star', '별', '노력이 빛나기 시작한 별', star10(), chain(range(0, 10), true)),
    make('study_achievement', 3, 'crown', '왕관', '쌓아 올린 성취의 왕관', CROWN, [
      ...chain(range(0, 9)), [0, 9], [8, 10], [9, 10], [10, 11], [11, 12], [12, 13], [13, 9],
      [14, 15], [15, 16], [2, 17], [4, 18], [6, 19],
    ]),
  ],
  rest_daily: [
    make('rest_daily', 1, 'crescent', '초승달', '조용히 차오르는 쉼의 시간', CRESCENT, chain([0, 1, 2, 3, 4], true)),
    make('rest_daily', 2, 'cloud', '구름', '천천히 흘러가는 평범한 하루', CLOUD, chain(range(0, 10), true)),
    make('rest_daily', 3, 'tree', '나무', '일상이 뿌리내려 자란 나무', TREE, [
      [0, 1], [1, 2], [0, 3], [0, 4], [2, 5], ...chain(range(5, 16)), [15, 2],
      [2, 16], [2, 18], [18, 19], [2, 17],
    ]),
  ],
  challenge_activity: [
    make('challenge_activity', 1, 'arrow', '화살', '목표를 향해 쏘아 올린 첫 화살', ARROW,
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1]]),
    make('challenge_activity', 2, 'mountain', '산', '한 걸음씩 올라 꽂은 정상의 깃발', MOUNTAIN, [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [1, 3], [2, 8], [8, 9],
    ]),
    make('challenge_activity', 3, 'flame', '불꽃', '꺼지지 않는 도전의 불꽃', FLAME,
      [...chain(range(0, 13), true), ...chain(range(13, 20), true)]),
  ],
  other: [
    make('other', 1, 'small_star', '작은 별', '어디에도 속하지 않은 자유로운 반짝임', pentagram(),
      [[0, 2], [2, 4], [4, 1], [1, 3], [3, 0]], { allowCrossings: true }),
    make('other', 2, 'diamond', '다이아몬드', '저마다 다른 빛을 내는 기억의 결정', DIAMOND, [
      ...chain(range(0, 9)), [1, 3], [3, 5], [5, 7], [0, 2], [2, 4], [4, 6], [6, 8], [0, 9], [4, 9], [8, 9],
    ]),
    make('other', 3, 'galaxy', '은하', '흩어진 기억이 모여 도는 작은 은하', galaxy(), [
      ...chain([0, ...range(1, 11)]), ...chain([0, ...range(11, 20)]),
    ]),
  ],
};

export function findTemplate(id: string | null | undefined): ConstellationTemplate | null {
  if (!id) return null;
  for (const list of Object.values(CONSTELLATION_TEMPLATES)) {
    const t = list.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------- 해금
export type TopicEntry = { id: string; createdAt: number; topic?: DiaryTopic | null };

/** 주제별 일기 개수. 주제가 없는 일기는 세지 않는다. */
export function topicCounts(entries: readonly { topic?: DiaryTopic | null }[]): Record<DiaryTopic, number> {
  const out = Object.fromEntries(CONSTELLATION_TOPICS.map((t) => [t, 0])) as Record<DiaryTopic, number>;
  for (const e of entries) if (e.topic && e.topic in out) out[e.topic] += 1;
  return out;
}

export type LevelStatus = { template: ConstellationTemplate; unlocked: boolean; remaining: number };
export type TopicStatus = {
  topic: DiaryTopic;
  label: string;
  title: string;
  count: number;
  levels: LevelStatus[];
  /** 해금된 가장 높은 레벨 템플릿(기본 선택). 없으면 null */
  highest: ConstellationTemplate | null;
  /** 다음 단계와 남은 일기 수. 모두 해금했으면 null */
  next: LevelStatus | null;
};

export function topicStatus(topic: DiaryTopic, count: number): TopicStatus {
  const levels = CONSTELLATION_TEMPLATES[topic].map((template) => ({
    template,
    unlocked: count >= template.requiredPlanets,
    remaining: Math.max(0, template.requiredPlanets - count),
  }));
  const unlocked = levels.filter((l) => l.unlocked);
  return {
    topic,
    ...TOPIC_CONCEPTS[topic],
    count,
    levels,
    highest: unlocked.length ? unlocked[unlocked.length - 1].template : null,
    next: levels.find((l) => !l.unlocked) ?? null,
  };
}

export function allTopicStatus(entries: readonly { topic?: DiaryTopic | null }[]): TopicStatus[] {
  const counts = topicCounts(entries);
  return CONSTELLATION_TOPICS.map((t) => topicStatus(t, counts[t]));
}

// ---------------------------------------------------------------- 별자리에 넣을 행성 고르기
/**
 * 그 주제의 일기 중 별자리를 이룰 행성 n개. 오래된 기록부터, 같은 시각이면 id 순(결정적).
 * 같은 별자리를 다시 열어도 구성 행성이 바뀌지 않는다. 나머지 행성은 원래 자리에 그대로 둔다.
 * 반환 순서 = 템플릿 점 번호 순서(i번째 행성 → points[i]).
 */
export function selectMembers<T extends TopicEntry>(entries: readonly T[], topic: DiaryTopic, count: number): T[] {
  return entries
    .filter((e) => e.topic === topic)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, count);
}

// ---------------------------------------------------------------- 화면 배치
export type LayoutView = {
  /** 화면 가로/세로 */
  aspect: number;
  fovDeg: number;
  /** 화면 위·아래를 가리는 UI 높이(화면 높이에 대한 비율 0~1) */
  insetTop: number;
  insetBottom: number;
  /** 화면 왼쪽·오른쪽을 가리는 UI 폭(화면 폭에 대한 비율 0~1). 넓은 화면에서는 패널이 왼쪽에 붙는다. */
  insetLeft: number;
  insetRight: number;
};

export type ConstellationLayout = {
  /** 월드 좌표(우주 회전이 0일 때 카메라 기준). i번째 = i번째 행성 */
  targets: Point3[];
  /** 별자리 평면에서 카메라까지 거리 */
  cameraDistance: number;
  /** 정규화 좌표 1 = 월드 몇 단위 */
  scale: number;
};

/**
 * 템플릿을 실제 행성 크기·화면 크기에 맞춰 배치한다.
 *  1) 크기: 연결 여부와 상관없이 모든 행성 쌍이 (반지름 합 × spacing) 이상 떨어지도록 하는 최소 배율.
 *     → 큰 행성이 섞여도 서로 겹치지 않고 모양 비율은 그대로(배율만 커짐).
 *  2) 카메라 거리: 위·아래 UI를 뺀 영역에 별자리 전체(가장자리 행성 포함)가 들어오는 거리.
 *  3) 위·아래(또는 왼쪽·오른쪽) UI 크기가 다르면 남은 영역 가운데에 오도록 옮긴다.
 */
export function layoutConstellation(
  template: Pick<ConstellationTemplate, 'points'>,
  radii: readonly number[],
  view: LayoutView,
  planeZ = 0
): ConstellationLayout {
  const pts = template.points;
  const n = pts.length;
  const rMax = Math.max(...radii.slice(0, n), 0.01);
  let scale: number = CONSTELLATION_CONFIG.minHalfSize;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      const need = ((radii[i] ?? rMax) + (radii[j] ?? rMax)) * CONSTELLATION_CONFIG.spacing;
      if (d > 1e-6) scale = Math.max(scale, need / d);
    }
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = rMax * CONSTELLATION_CONFIG.edgePadding;
  const halfW = ((Math.max(...xs) - Math.min(...xs)) / 2) * scale + pad;
  const halfH = ((Math.max(...ys) - Math.min(...ys)) / 2) * scale + pad;
  const cx = ((Math.max(...xs) + Math.min(...xs)) / 2) * scale;
  const cy = ((Math.max(...ys) + Math.min(...ys)) / 2) * scale;

  const tanV = Math.tan(((view.fovDeg / 2) * Math.PI) / 180);
  const freeV = Math.max(0.2, 1 - view.insetTop - view.insetBottom);
  const freeH = Math.max(0.3, 1 - view.insetLeft - view.insetRight);
  const aspect = Math.max(view.aspect, 0.1);
  const cameraDistance = Math.max(halfH / (tanV * freeV), halfW / (tanV * aspect * freeH));
  // 남은 영역의 가운데(NDC y = insetBottom - insetTop, x = insetLeft - insetRight)로 옮긴다
  const yShift = (view.insetBottom - view.insetTop) * cameraDistance * tanV;
  const xShift = (view.insetLeft - view.insetRight) * cameraDistance * tanV * aspect;

  const targets = pts.map(
    ([x, y, z]) => [x * scale - cx + xShift, y * scale - cy + yShift, planeZ + z * scale] as Point3
  );
  return { targets, cameraDistance, scale };
}

/** 연결선 그리는 순서(템플릿 순서, 최대 maxLines 개, 잘못된 번호·중복 제거) */
export function drawableConnections(template: ConstellationTemplate): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const [a, b] of template.connections) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key) || !template.points[a] || !template.points[b]) continue;
    seen.add(key);
    out.push([a, b]);
    if (out.length >= Math.min(GROUP_CONSTELLATION_MAX_LINES, template.lineLimit ?? CONSTELLATION_CONFIG.maxLines)) break;
  }
  return out;
}

/** 부드러운 가속·감속 */
export function easeInOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** 선 사이 시작 간격(초). 선이 많아도 전체가 linesTotal 안에 끝나게 줄인다. */
export function lineGapFor(lineCount: number): number {
  const t = CONSTELLATION_CONFIG.timing;
  if (lineCount <= 1) return t.lineGap;
  return Math.min(t.lineGap, (t.linesTotal - t.lineDraw) / (lineCount - 1));
}

/** 행성들이 모두 도착하는 시간(초) */
export function arriveDuration(planetCount: number): number {
  const t = CONSTELLATION_CONFIG.timing;
  return t.move + t.stagger * Math.max(0, planetCount - 1);
}

/** 보이기 전체 시간(초): 마지막 행성 도착 + 모든 선 그리기 */
export function showDuration(template: ConstellationTemplate): number {
  const t = CONSTELLATION_CONFIG.timing;
  const lines = drawableConnections(template).length;
  return arriveDuration(template.points.length) + (lines ? lineGapFor(lines) * (lines - 1) + t.lineDraw : 0);
}

// ---------------------------------------------------------------- Level 4: 나만의 별자리 [ADDED 2026-11-15]
// 같은 주제 일기가 30개 이상이면 '나만의 별자리 생성하기'로 서버(LLM)가 만든다. 결과(좌표·연결선)는 서버
// personal_constellations 표에 저장되고, 여기서는 그 값을 고정형 템플릿과 같은 모양(ConstellationTemplate)으로 바꿔
// 기존 별자리 렌더러(행성 이동·선 그리기·원위치 복귀)를 그대로 쓴다. 볼 때마다 LLM 을 부르지 않는다.

export const PERSONAL_LEVEL = 4 as const;

export function personalTemplateId(topic: DiaryTopic): string {
  return `personal_${topic}`;
}

/** 서버 결과 → 템플릿. 완성(ready)이 아니거나 좌표가 이상하면 null(그리지 않는다). */
export function personalTemplate(data: ApiPersonalConstellation | null | undefined): ConstellationTemplate | null {
  if (!data || data.status !== 'ready' || !Array.isArray(data.points) || !Array.isArray(data.connections)) return null;
  const n = data.points.length;
  if (n < 3 || n !== data.required_planets) return null;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1.5;
  const points: Point3[] = [];
  for (const p of data.points) {
    if (!Array.isArray(p) || p.length < 2 || !finite(p[0]) || !finite(p[1])) return null;
    points.push([p[0], p[1], finite(p[2]) ? p[2] : 0]);
  }
  const connections = data.connections.filter(
    (c): c is [number, number] =>
      Array.isArray(c) &&
      Number.isInteger(c[0]) &&
      Number.isInteger(c[1]) &&
      c[0] >= 0 &&
      c[1] >= 0 &&
      c[0] < n &&
      c[1] < n &&
      c[0] !== c[1]
  );
  if (!connections.length) return null;
  const shape = data.shape_label || '나만의 별자리';
  return {
    id: personalTemplateId(data.topic),
    topic: data.topic,
    level: PERSONAL_LEVEL,
    name: data.name || `${shape} 별자리`,
    shape,
    description: data.description ?? '',
    requiredPlanets: n,
    points,
    connections,
  };
}

/**
 * Level 4 카드 상태
 *  - locked: 일기가 아직 30개 미만 / available: 만들 수 있음(아직 안 만듦)
 *  - pending: 서버가 만드는 중 / ready: 완성(볼 수 있음)
 *  - short: 완성했지만 일기를 지워 지금 30개 미만(다시 30개가 되면 같은 별자리를 그대로 볼 수 있다)
 *  - failed: 실패(다시 시도 가능) / exhausted: 실패 + 다시 시도 횟수를 모두 씀
 */
export type PersonalState = 'locked' | 'available' | 'pending' | 'ready' | 'short' | 'failed' | 'exhausted';

export type PersonalStatus = {
  state: PersonalState;
  count: number;
  required: number;
  /** 필요 기록까지 남은 수 */
  remaining: number;
  template: ConstellationTemplate | null;
  data: ApiPersonalConstellation | null;
};

export function personalStatus(count: number, data: ApiPersonalConstellation | null | undefined): PersonalStatus {
  const required = data?.required_planets || CONSTELLATION_CONFIG.thresholds[PERSONAL_LEVEL];
  const remaining = Math.max(0, required - count);
  const base = { count, required, remaining, data: data ?? null, template: null };
  if (data?.status === 'ready') {
    const template = personalTemplate(data);
    if (template) return { ...base, template, state: remaining > 0 ? 'short' : 'ready' };
  }
  if (data?.status === 'pending') return { ...base, state: 'pending' };
  if (remaining > 0) return { ...base, state: 'locked' };
  if (data?.status === 'failed') return { ...base, state: data.attempts_left > 0 ? 'failed' : 'exhausted' };
  return { ...base, state: 'available' };
}

/**
 * 나만의 별자리의 행성. 서버가 저장한 순서(planet_ids, 생성 당시 오래된 순)를 그대로 쓰고,
 * 그 사이 지워진 일기 자리만 그 주제의 다음으로 오래된 일기로 채운다(나머지 행성 자리는 바뀌지 않는다).
 * 개수가 모자라면 count 보다 짧은 배열(화면은 그리지 않는다).
 */
export function selectPersonalMembers<T extends TopicEntry>(
  entries: readonly T[],
  topic: DiaryTopic,
  planetIds: readonly string[],
  count: number
): T[] {
  const pool = selectMembers(entries, topic, Number.MAX_SAFE_INTEGER);
  const byId = new Map(pool.map((e) => [e.id, e]));
  const used = new Set<string>();
  const slots: (T | null)[] = [];
  for (let i = 0; i < count; i++) {
    const e = byId.get(planetIds[i] ?? '');
    if (e && !used.has(e.id)) {
      used.add(e.id);
      slots.push(e);
    } else {
      slots.push(null);
    }
  }
  const rest = pool.filter((e) => !used.has(e.id));
  let k = 0;
  const out: T[] = [];
  for (const s of slots) {
    const e = s ?? rest[k++];
    if (!e) break;
    out.push(e);
  }
  return out;
}

/** 서버가 기록하는 실제 진행 단계(stage) — 이 순서대로 지나간다. queued 는 시작 전. */
export const PERSONAL_STAGES = [
  { key: 'analyzing', label: '기억 분석 중' },
  { key: 'designing', label: '별자리 모양 생성 중' },
  { key: 'validating', label: '별자리 완성 중' },
] as const;

/** 지금 단계 번호(0~2). 시작 전이면 -1, 끝났으면 단계 수. */
export function personalStageIndex(stage: string | null | undefined): number {
  if (stage === 'done') return PERSONAL_STAGES.length;
  return PERSONAL_STAGES.findIndex((s) => s.key === stage);
}

// ---------------------------------------------------------------- 그룹 별자리 (주제별 공유 일기, 별 수 3배)
export const GROUP_STAR_MULTIPLIER = 3;
/** Insert stars along the existing outline, preserving its shape and all original vertices. */
export function groupTemplate(base: ConstellationTemplate): ConstellationTemplate {
  const points: Point3[] = base.points.map(p => [...p]);
  const connections: [number, number][] = base.connections.map(pair => [...pair]);
  const target = points.length * GROUP_STAR_MULTIPLIER;
  while (points.length < target) {
    // Split the longest available edge first so extra stars do not bunch up.
    const candidates = connections.map(([a,b],index) => ({index,a,b,length:Math.hypot(...points[a].map((v,k)=>v-points[b][k]))})).sort((a,b)=>b.length-a.length || a.index-b.index);
    const edge = candidates.find(({a,b}) => {
      const midpoint = points[a].map((v,k)=>(v+points[b][k])/2);
      return points.every(p=>Math.hypot(...p.map((v,k)=>v-midpoint[k]))>0.025);
    });
    if (!edge) throw new Error(`Cannot expand group shape: ${base.id}`);
    const index = points.length;
    points.push(points[edge.a].map((v,k)=>(v+points[edge.b][k])/2) as Point3);
    connections.splice(edge.index,1,[edge.a,index],[index,edge.b]);
  }
  return { ...base, id:`group_${base.id}`, name:`함께 만드는 ${base.name}`, requiredPlanets:target,
    points, connections, lineLimit:GROUP_CONSTELLATION_MAX_LINES };
}
export const GROUP_CONSTELLATION_TEMPLATES = Object.fromEntries(CONSTELLATION_TOPICS.map(topic => [topic,CONSTELLATION_TEMPLATES[topic].map(groupTemplate)])) as Record<DiaryTopic,ConstellationTemplate[]>;
export function groupTopicStatuses(entries: readonly {topic?:DiaryTopic|null}[]): TopicStatus[] {
  const counts = topicCounts(entries);
  return CONSTELLATION_TOPICS.map(topic => {
    const count=counts[topic];
    const levels=GROUP_CONSTELLATION_TEMPLATES[topic].map(template=>({template,unlocked:count>=template.requiredPlanets,remaining:Math.max(0,template.requiredPlanets-count)}));
    return {topic,...TOPIC_CONCEPTS[topic],count,levels,highest:levels.filter(l=>l.unlocked).at(-1)?.template??null,next:levels.find(l=>!l.unlocked)??null};
  });
}
