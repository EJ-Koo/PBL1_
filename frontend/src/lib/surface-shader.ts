// [NEW FILE 2026-11-21] 표면 스타일 GLSL. 참고: 파스텔 오팔 5종 쇼케이스 HTML(Three.js)의 셰이더를 오늘의별일 행성 셰이더에 맞게 옮겼다.
// [REWRITE 2026-11-25] 스타일마다 조명 모델을 따로 둔다(예전: 다섯 스타일이 같은 sLighting — 같은 감싸는 빛·같은 두 겹
//   하이라이트·같은 무지갯빛 가장자리·같은 톤 압축 — 을 쓰고 계수 3개만 달라서 모두 '광택 나는 파스텔 구슬'로 보였다).
//
// 기존 행성 셰이더(universe-scene.tsx PLANET_FRAGMENT_SHADER)는 두 단계다.
//   1) 감정 본체: 감정 색 줄(uStrip, AI 감정 분석으로 만든 색·비율)을 무늬로 읽어 col 을 만든다.
//   2) 조명: col 에 빛·하이라이트·가장자리 대기를 더해 lit 을 만든다. 그 뒤 먼 행성·선택·별자리 어둡게를 곱한다.
// 표면 스타일은 1)의 col 을 입력으로 받아 2)의 조명 구간만 스타일 재질로 바꾼다. 1)과 마지막 곱셈들은 그대로다.
// 스타일이 없으면 buildSurfaceFragmentShader 가 원래 문자열을 그대로 돌려준다(기존 행성과 완전히 같다).
//
// 스타일별로 따로 정하는 것(공통 공식을 일괄 적용하지 않는다)
//              광택(거칠기)        투명·속 굴절        반사광 모양            표면 무늬                 가장자리
//  opal_glass   매끈(아주 날카로움)  있음(색층 시차·집광)  창 반사 + 프레넬        속 오팔 불꽃(작은 조각)     얇은 막 무지갯빛
//  pastel_cloud 무광(넓은 확산광)     없음               없음(빛 머금은 가장자리)  흐린 감정 색·옅은 솜 입자    큰 구름 덩어리로 부푼 곡면 + 안개
//  pearl_silk   새틴(이방성)         없음(불투명)        결 방향으로 늘어난 빛     길고 가는 실크 결          부드러운 진주 광
//  crystal_prism 면마다 다름         약함               면 전체가 번쩍(면 반사)   결정면(면마다 감정 색)       다면체(별도 지오메트리)
//  aurora_ribbon 은은한 유리         있음(속 빛 커튼)     넓고 약하게             넓은 오로라 커튼 2~3개      어두운 밤빛
//
// 색: 감정 색 줄(sEmotion)·대표색 계열 밝은 색(uLight)·보조 감정 색(uAccentA)만 쓴다(참고 HTML의 감정 프리셋·고정 파스텔 없음).
//     재질 자체의 빛(유리 반사의 흰빛, 진주 결의 아주 옅은 따뜻한 빛, 프리즘 분광)만 흰색·무지갯빛을 섞는다.
// 단계(LOD): uSurfaceTier(0~2, 부드럽게 바뀜). 0이어도 스타일의 재질(조명 모델)은 그대로라 멀리서도 구분된다.
//   추가 노이즈(fbm)는 1부터, 가는 결·반짝임은 2부터.
import type { SurfaceStyle } from './surface-style';

/** 기존 셰이더에서 스타일 조명으로 바꿀 구간(시작·끝 줄). 기존 셰이더가 바뀌면 테스트가 알려 준다. */
export const SURFACE_LIGHTING_START = '    float diff = smoothstep(-0.12, 0.95, ndl);';
export const SURFACE_LIGHTING_END = '    lit += col * uEmissive;\n';
const MAIN = '  void main() {';

const DECLS = /* glsl */ `
  // ---- 표면 스타일(2026-11-21, 2026-11-25 스타일별 조명) ----
  uniform float uTime;
  uniform float uSurfaceTier;
  uniform float uSurfaceAmount;
  uniform vec3 uAccentA;
  // 감정 색 줄에서 색을 읽는다(감정 본체와 같은 색·같은 비율). 스타일의 색은 모두 여기·uLight·uAccentA 에서 온다.
  vec3 sEmotion(float t) {
    return srgbToLinear(texture2D(uStrip, vec2(clamp(t, 0.002, 0.998), 0.5)).rgb);
  }
  float sMax(vec3 c) { return max(c.r, max(c.g, c.b)); }
  // 얇은 막 무지갯빛(유리·프리즘 분광). 감정 밝은 색 쪽으로 물들여 고정 무지개색이 감정 색을 덮지 않게 한다.
  vec3 sIrid(float a, float shift, float tint) {
    vec3 s = 0.62 + 0.38 * cos(6.28318 * (a * 1.232 + shift * 0.28 + vec3(0.02, 0.34, 0.62)));
    return mix(s, uLight / max(sMax(uLight), 0.001), tint);
  }
  // 가짜 주변 반사(유리·결정): 위는 감정 밝은 색으로 물든 하늘, 아래는 어둡게, 빛 쪽에 부드러운 창(소프트박스)
  vec3 sEnv(vec3 r) {
    float up = r.y * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.015), mix(uLight, vec3(1.0), 0.45) * 0.5, smoothstep(0.3, 1.0, up));
    float win = smoothstep(0.84, 0.97, dot(r, LIGHT_DIR));
    float win2 = smoothstep(0.9, 0.99, dot(r, normalize(vec3(-0.7, 0.55, 0.45)))) * 0.35;
    return sky + vec3(win * 1.3 + win2);
  }
  // 밝은 곳이 하얗게 날아가지 않게 부드럽게 눌러 준다(스타일마다 양이 다르다)
  vec3 sSoft(vec3 c, float k) { return mix(c, c / (c + vec3(0.9)) * 1.9, k); }
`;

const CRYSTAL_DECLS = /* glsl */ `
  varying vec3 vBary;
  float sHash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`;

/**
 * [2026-11-26] 솜사탕 구름 몸통: 구 표면을 낮은 주파수 노이즈로 바깥쪽으로만 부풀려 큰 구름 덩어리 2~4개 + 보조 덩어리가
 * 둥글게 이어지는 실루엣. 조각(별도 메시)이 없어 경계선이 생기지 않는다. 덩어리는 아주 천천히 흐르고 숨 쉬듯 조금 부푼다.
 * vObj(감정 무늬 좌표)는 원래 방향 그대로라 감정 무늬·색 배치는 같다. 클릭 판정은 CPU 의 원래 구(크기 그대로).
 * 법선은 이웃 두 점을 같은 식으로 부풀려 다시 계산한다(매끈한 곡면).
 */
const CLOUD_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSeed;
  uniform float uCloudLift;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vObj;
  varying float vCloudH;
  varying float vLimb;
  float cHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float cNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // 방향 d 의 부푼 높이(0~1): 큰 덩어리(낮은 주파수) + 보조 덩어리. smoothstep 으로 둥근 봉우리.
  float cloudLift(vec3 d) {
    vec3 drift = vec3(uTime * 0.012, uTime * 0.02, -uTime * 0.01);
    float big = cNoise(d * 1.35 + uSeed * 0.05 + drift);
    float small = cNoise(d * 2.9 + uSeed.zxy * 0.05 - drift * 1.3);
    return clamp(smoothstep(0.38, 0.72, big) * 0.78 + smoothstep(0.48, 0.8, small) * 0.4, 0.0, 1.0);
  }
  vec3 cloudPoint(vec3 d, float r, float breathe) {
    return d * r * (1.0 + uCloudLift * (0.12 + 0.88 * cloudLift(d)) * breathe);
  }
  void main() {
    float r = length(position);
    vec3 d = position / max(r, 1e-6);
    vObj = d;
    float breathe = 1.0 + 0.05 * sin(uTime * 0.45);
    vec3 pos = cloudPoint(d, r, breathe);
    vCloudH = cloudLift(d);
    // 법선: 접선 두 방향으로 조금 옮긴 점도 같은 식으로 부풀려 외적
    vec3 t1 = normalize(cross(abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), d));
    vec3 t2 = cross(d, t1);
    float e = 0.035;
    vec3 pa = cloudPoint(normalize(d + t1 * e), r, breathe);
    vec3 pb = cloudPoint(normalize(d + t2 * e), r, breathe);
    vec3 nrm = normalize(cross(pa - pos, pb - pos));
    if (dot(nrm, d) < 0.0) nrm = -nrm;
    vNormalV = normalize(normalMatrix * nrm);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vViewPos = mv.xyz;
    // 원래 구 기준으로 이 점이 행성의 바깥 외곽 쪽인지(0 = 외곽, 1 = 정면). 덩어리 사이 안쪽 주름은 외곽이 아니다.
    vLimb = max(dot(normalize(normalMatrix * d), normalize(-mv.xyz)), 0.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const CLOUD_DECLS = /* glsl */ `
  varying float vCloudH;
  varying float vLimb;
  const float CLOUD_EDGE_SOFT = CLOUD_EDGE_SOFT_VALUE;
`;
/** 기존 셰이더의 마지막 색 쓰기. 솜사탕 구름만 가장자리 투명도를 넣은 줄로 바꾼다. */
export const FINAL_WRITE = 'gl_FragColor = vec4(lit, 1.0);';
const CLOUD_FINAL_WRITE = 'gl_FragColor = vec4(lit * cloudAlpha, cloudAlpha);';

/**
 * [2026-11-25] 크리스탈만 정점 셰이더에 면 안 무게중심 좌표(aBary → vBary)를 더한다(모서리 빛줄용).
 * [2026-11-26] 솜사탕 구름은 부풀린 표면 정점 셰이더(CLOUD_VERTEX)를 쓴다.
 * 다른 스타일·기본 행성은 base 를 그대로 돌려준다. 바꿀 자리를 못 찾으면 base 그대로.
 */
export function buildSurfaceVertexShader(base: string, style: SurfaceStyle | null): string {
  if (style === 'pastel_cloud') return CLOUD_VERTEX;
  if (style !== 'crystal_prism') return base;
  const i = base.indexOf('void main() {');
  if (i < 0) return base;
  const head = 'attribute vec3 aBary;\n  varying vec3 vBary;\n  ';
  const at = i + 'void main() {'.length;
  return base.slice(0, i) + head + base.slice(i, at) + '\n    vBary = aBary;' + base.slice(at);
}

// 각 스타일은 lit(조명까지 끝낸 색)을 직접 만든다. atmoK = 기존 가장자리 대기를 얼마나 남길지.
// 쓸 수 있는 값: col(감정 본체 색), p·vObj(표면 위치), w1·w2(감정 무늬가 이미 계산한 노이즈), u(무늬 흐름 좌표),
//              n·v(화면 기준 법선·시선), ndl(빛), mu(정면일수록 1)
const STYLE_BODIES: Record<SurfaceStyle, string> = {
  // 유리: 매끈하고 반투명. 속에 굴절된 감정 색층(보는 방향에 따라 어긋나 보이는 시차) + 반대편에 모이는 빛(집광)
  //       + 프레넬 반사(가장자리일수록 주변이 비친다) + 아주 날카로운 창 반사 + 얇은 막 무지갯빛. 구름결은 없다.
  opal_glass: /* glsl */ `
    float ndv = mu;
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    vec3 rv = refract(-v, n, 0.68);
    // 속 색층 두 겹: 굴절 방향으로 깊이만큼 밀린 자리의 감정 색(얕은 층은 감정 무늬 흐름 그대로, 깊은 층은 더 흐리게)
    vec3 q1 = p + rv * 0.32;
    vec3 q2 = p + rv * 0.85;
    float t1 = clamp((q1.y + uFlow * ((w1 - 0.5) * 0.9 + (w2 - 0.5) * 0.3)) * 0.5 + 0.5, 0.0, 1.0);
    float t2 = clamp((q2.y + uFlow * (w1 - 0.5) * 0.6) * 0.5 + 0.5, 0.0, 1.0);
    vec3 inner = mix(col, sEmotion(t1), 0.5 * sAmt);
    inner = mix(inner, sEmotion(t2) * 0.8, 0.28 * sAmt);
    // 오팔 불꽃: 속에 떠 있는 작은 무지갯빛 조각(보는 각도에 따라 색이 바뀐다). 가까이부터.
    vec3 fire = vec3(0.0);
    if (sD1 > 0.001) {
      vec3 fq = (p + rv * 0.5) * 15.0 + uSeed;
      float fl = vnoise(fq);
      float fl2 = vnoise(fq * 1.9 + 7.3);
      float patchM = smoothstep(0.68, 0.84, fl) * smoothstep(0.35, 0.75, fl2) * (0.5 + 0.5 * sD2);
      fire = sIrid(fl2 * 3.1 + ndv * 1.6, sT * 0.04, 0.2) * patchM * 0.2 * sD1 * sAmt;
    }
    float wrap = smoothstep(-0.25, 1.0, ndl);
    // 유리는 빛을 흩뜨리지 않아 몸통 확산광이 약하고, 속을 지나온 빛이 반대편(왼쪽 아래 안쪽)에 모인다
    float caustic = pow(max(dot(n, normalize(vec3(-LIGHT_DIR.xy * 0.75, 0.66))), 0.0), 10.0);
    vec3 body = inner * (0.16 + 0.5 * wrap) + inner * caustic * 0.75 * mix(1.3, 1.0, wrap) + fire;
    // 반사: 프레넬로 가장자리에 주변이 비치고, 빛 쪽에 작고 또렷한 창 반사
    vec3 refl = sEnv(reflect(-v, n));
    float nh = max(dot(n, normalize(LIGHT_DIR + v)), 0.0);
    float spec = pow(nh, 320.0) * 1.8 + pow(nh, 46.0) * 0.12;
    vec3 film = sIrid(1.0 - ndv, sT * 0.06 + dot(vObj, vec3(0.5, 0.7, 0.4)), 0.25);
    lit = body * (1.0 - fres * 0.7) + refl * fres * 0.95 + vec3(spec) + film * pow(1.0 - ndv, 3.0) * 0.34 * sAmt;
    lit = sSoft(lit * uExposure, 0.18);
    atmoK = 0.45;
  `,
  // [2026-11-26] 솜사탕 구름: 작은 조각을 붙이지 않고, 몸통 표면을 낮은 주파수로 부풀려 큰 구름 덩어리 몇 개가 자연스럽게
  //   겹친 모양(정점 셰이더 CLOUD_VERTEX — 조각 경계가 없다).
  // [2026-11-26 2차] 실제 솜사탕 질감(참고 사진): 가는 설탕 실이 감기고, 외곽은 보송보송 반투명.
  // [2026-11-27] 색은 감정 본체 그대로(기본 행성과 같은 색·무늬). 덩어리 없음(3차). 바뀌는 것은 표면 질감뿐.
  //   - 색: 감정 본체 색(col)·감정 무늬 그대로. 흐림·파스텔·흰빛 섞기 없음.
  //   - 실 결: 한 방향으로 길게 늘인 노이즈 3겹. 덩어리 높이(vCloudH)를 따라 휘어 덩어리마다 실이 감긴다(소용돌이).
  //     실이 픽셀보다 가늘어지는 먼 거리에서는 결을 흐려 깜빡이지 않는다.
  //   - 빛: 넓은 확산광 + 밝은 실·어두운 틈 + 빛을 받은 실의 은은한 밝음. 유리·진주 같은 반사·무지갯빛은 없다.
  //   - 외곽: 행성 바깥 외곽에서만 실 모양으로 들쭉날쭉 옅어진다(보송보송한 실루엣).
  pastel_cloud: /* glsl */ `
    // [2026-11-27] 색: 감정 본체 색(col)·감정 무늬를 그대로 쓴다(흐리거나 파스텔로 바꾸지 않음). 질감만 설탕 실 결.
    // 설탕 실 질감: 한 방향으로 길게 늘인 노이즈 세 겹(방향이 조금씩 달라 엉킨 느낌)을 겹친 촘촘하고 부드러운 결.
    // 결은 덩어리 모양(vCloudH)을 따라 조금 휘어 덩어리마다 감긴다. 결이 픽셀보다 가늘어지면 흐려서 깜빡이지 않는다.
    vec3 fp = vObj + uSeed * 0.02;
    float wa = vnoise(fp * 3.1 + uSeed);
    float wb = vnoise(fp * 3.7 + uSeed.zxy + 4.0);
    if (sD1 > 0.001) wa = mix(wa, fbm(fp * 2.4 + uSeed + vec3(0.0, sT * 0.012, 0.0)), sD1);
    float sA = fp.y * 62.0 + (wa - 0.5) * 12.0 + vCloudH * 6.0;
    float sB = dot(fp, vec3(0.6, 0.75, -0.28)) * 76.0 + (wb - 0.5) * 10.0;
    float sC = dot(fp, vec3(-0.52, 0.68, 0.52)) * 90.0 + (wa - 0.5) * 9.0 + (wb - 0.5) * 5.0;
    float n1 = vnoise(vec3(fp.x * 5.0, sA, fp.z * 5.0));
    float n2 = vnoise(vec3(fp.z * 6.0 + 2.0, sB, fp.x * 6.0));
    float n3 = vnoise(vec3(fp.x * 7.0 + 5.0, sC, fp.y * 7.0));
    float aa = 1.0 - smoothstep(0.7, 2.0, max(fwidth(sA), fwidth(sC)));
    float streak = mix(0.5, (n1 * 0.45 + n2 * 0.33 + n3 * 0.22), aa * sAmt);
    float silk = smoothstep(0.28, 0.78, streak);
    // 드문드문 빛을 받은 실 한 가닥(아주 옅게)
    float thread = pow(1.0 - abs(sin(sA * 0.5)), 24.0) * smoothstep(0.55, 0.8, n2) * aa * sAmt;
    // 빛: 기존 행성과 같은 방식(반대쪽 약한 채움광 + 부드러운 확산광 × 가장자리 감쇠) → 감정 색이 기본 행성과 같은 밝기로 보인다.
    //   여기에 실 결의 밝고 어두운 차이만 곱한다(세기는 겹침 상한 기준: 약 ±13%). 광택·반사 없음.
    float diffC = smoothstep(-0.12, 0.95, ndl);
    float fillC = 0.07 + 0.06 * smoothstep(0.2, -0.6, ndl);
    float limbC = 0.72 + 0.28 * mu;
    float tex = 1.0 - OVERLAY_MAX * 0.38 + OVERLAY_MAX * 0.75 * silk;
    lit = col * (fillC + diffC * limbC) * tex;
    // 빛을 받은 실 꼭대기와 드문 실 한 가닥만 살짝 밝게(색은 감정 색 쪽으로, 흰빛은 조금만)
    lit += mix(col, vec3(1.0), 0.35) * pow(silk, 3.0) * 0.1 * diffC;
    lit += mix(col, vec3(1.0), 0.45) * thread * 0.14 * (0.3 + 0.7 * diffC);
    float fluff = streak;
    float threads = thread;
    lit *= uExposure;
    atmoK = 0.2;
    // 보송보송한 외곽: 행성 바깥 외곽(원래 구 기준 vLimb 작음)에서만, 실 모양으로 들쭉날쭉 옅어져 배경이 비친다.
    // 안쪽 덩어리 사이 주름은 불투명 그대로(뒤가 비쳐 검은 줄이 생기지 않게).
    float outer = 1.0 - smoothstep(0.03, 0.22, vLimb);
    float fuzz = clamp(smoothstep(0.0, 0.6, mu) * mix(0.45, 1.2, fluff) + threads * 0.5, 0.0, 1.0);
    cloudAlpha = 1.0 - (1.0 - fuzz) * outer * CLOUD_EDGE_SOFT;
  `,
  // 진주 실크: 불투명. 진주층(빛이 안쪽에서 은은하게 도는 광) + 감정 무늬 흐름(u)을 따라가는 길고 가는 실크 결
  //       + 결 방향으로 늘어난 새틴 하이라이트(이방성, Kajiya-Kay). 유리 같은 날카로운 반사·투명감은 없다.
  pearl_silk: /* glsl */ `
    float pn1 = w1;
    float pn2 = w2;
    if (sD1 > 0.001) {
      pn1 = mix(w1, fbm(vObj * vec3(1.2, 3.4, 1.2) + vec3(sT * 0.02, 0.0, -sT * 0.015) + uSeed), sD1);
    }
    // 실크 결: 흐름 좌표 u 를 따라 아주 길게, 가끔 휘며 갈라진다. 세 가닥(굵은 결·가는 결·실낱)
    float phase = u * 7.5 + (pn1 - 0.5) * 3.2 + (pn2 - 0.5) * 0.9;
    float vein = pow(0.5 + 0.5 * cos(phase * 6.2832), 40.0);
    float vein2 = pow(0.5 + 0.5 * cos(phase * 13.1 + 1.7 + (pn1 - 0.5) * 2.0), 70.0) * (0.45 + 0.55 * sD1);
    float thread = pow(0.5 + 0.5 * cos(phase * 29.0 + 0.4), 90.0) * sD2;
    float silk = clamp(vein * 0.8 + vein2 * 0.55 + thread * 0.4, 0.0, 1.0);
    // 진주 몸통: 감정 색을 진주처럼 맑고 밝게(대표색 계열 밝은 색 쪽으로 조금)
    vec3 pearl = mix(col, mix(uLight, vec3(1.0), 0.25), 0.24 * sAmt);
    // 결 색: 밝은 진주 빛(대표색 계열 밝은 색 + 흰빛, 아주 옅은 따뜻한 금빛)
    vec3 veinCol = mix(mix(uLight, vec3(1.0), 0.45), vec3(1.0, 0.9, 0.72), 0.22);
    vec3 surfC = mix(pearl, veinCol, silk * 0.55 * sAmt);
    float wrap = 0.22 + 0.78 * smoothstep(-0.35, 1.0, ndl);
    // 진주층의 깊은 광: 정면 가운데가 은은하게 밝고 가장자리로 부드럽게 어두워진다
    float nacre = 0.82 + 0.3 * pow(mu, 1.6);
    lit = surfC * wrap * nacre;
    // 새틴(이방성) 하이라이트: 결과 같은 가로 방향 접선 → 빛이 세로로 길게 늘어난 띠가 된다
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), n) + n * (pn1 - 0.5) * 0.7 + vec3(0.0, 0.001, 0.0));
    vec3 H = normalize(LIGHT_DIR + v);
    float th = dot(T, H);
    float aniso = pow(sqrt(max(1.0 - th * th, 0.0)), 70.0);
    float aniso2 = pow(sqrt(max(1.0 - pow(dot(T, normalize(H + n * 0.25)), 2.0), 0.0)), 24.0);
    float lightSide = smoothstep(-0.1, 0.6, ndl);
    lit += mix(uLight, vec3(1.0), 0.65) * aniso * 0.5 * lightSide * (0.6 + 0.4 * silk);
    lit += mix(pearl, vec3(1.0), 0.35) * aniso2 * 0.14 * lightSide;
    // 진주의 오리엔트(아주 약한 색 번짐)는 가장자리에만
    lit += sIrid(1.0 - mu, 0.3, 0.6) * pow(1.0 - mu, 2.5) * 0.12 * sAmt;
    lit = sSoft(lit * uExposure, 0.12);
    atmoK = 0.6;
  `,
  // 크리스탈: 다면체 결정(별도 지오메트리 — 깎은 면). 면 법선(화면 미분)으로 면마다 밝기·반사가 다르고,
  //       면마다 감정 색 줄의 다른 색이 비친다. 빛과 맞는 면은 통째로 번쩍이며 분광(프리즘), 모서리에 가는 빛줄.
  crystal_prism: /* glsl */ `
    // 면 법선: 화면 기준(조명용)·물체 기준(면 번호용). vObj 는 꼭짓점 값을 면 안에서 직선 보간 → 면마다 일정한 평면
    vec3 nf = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
    if (dot(nf, v) < 0.0) nf = -nf;
    vec3 nObj = normalize(cross(dFdx(vObj), dFdy(vObj)) + 1e-6);
    float faceId = sHash3(floor(nObj * 9.0 + 0.5));
    float ndv = max(dot(nf, v), 0.0);
    // 면 색: 감정 본체 색 + 면마다 감정 색 줄의 다른 위치(감정 비율대로 여러 감정 색 결정면이 섞인다)
    vec3 gem = mix(col, sEmotion(faceId), OVERLAY_MAX * 1.4 * sAmt);
    float fdiff = 0.12 + 0.88 * smoothstep(-0.15, 0.95, dot(nf, LIGHT_DIR));
    // 면마다 속 깊이가 다르게(어떤 면은 짙고 어떤 면은 맑다) → 단색 구슬처럼 보이지 않는다
    float depthV = 0.7 + 0.5 * fract(faceId * 7.31);
    vec3 body = gem * fdiff * depthV;
    // 면 반사: 면 전체가 같은 반사 → 각진 번쩍임. 빛과 맞는 면은 통째로 밝게
    vec3 refl = sEnv(reflect(-v, nf));
    float fres = 0.12 + 0.88 * pow(1.0 - ndv, 3.0);
    float flash = pow(max(dot(nf, normalize(LIGHT_DIR + v)), 0.0), 60.0);
    vec3 disp = sIrid(faceId * 3.0 + ndv * 2.0, sT * 0.08, 0.3);
    lit = body + refl * fres * 0.55 + mix(vec3(1.0), disp, 0.6) * flash * 0.75;
    // 모서리 빛줄: 면 안 무게중심 좌표(vBary)의 가장 작은 값이 0 이면 모서리 → 1~1.5픽셀 선 + 바로 옆 은은한 번짐
    float bmin = min(vBary.x, min(vBary.y, vBary.z));
    float edgeM = 1.0 - smoothstep(0.0, fwidth(bmin) * 1.5 + 1e-4, bmin);
    edgeM = max(edgeM, (1.0 - smoothstep(0.0, 0.08, bmin)) * 0.25);
    float edgeGlint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(faceId * 40.0 + sT * 0.9), 6.0) * sD1;
    lit += mix(vec3(1.0), disp, 0.6) * edgeM * edgeGlint * 0.5 * (0.4 + 0.6 * smoothstep(-0.3, 0.6, dot(nf, LIGHT_DIR)));
    // 가까이: 면 속 프리즘 반짝임이 천천히 옮겨 다닌다
    if (sD2 > 0.001) {
      float tw = pow(max(sin(faceId * 23.0 + sT * 0.55), 0.0), 18.0);
      lit += disp * tw * 0.5 * sD2 * sAmt;
    }
    lit = sSoft(lit * uExposure, 0.22);
    atmoK = 0.3;
  `,
  // 오로라 리본: 몸통은 밤처럼 어둡게 가라앉히고(감정 무늬는 그대로 보임), 속(굴절 시차)에서 넓고 부드러운 빛의 커튼
  //       2~3개가 천천히 흐른다. 커튼 아래 끝이 밝고 위로 엷게 퍼지며, 세로 결(빛살)이 있다.
  //       노이즈로 갈라지는 가는 선·맥동은 없다(용암과 구분). 표면은 은은한 유리 광택만.
  aurora_ribbon: /* glsl */ `
    vec3 rv = refract(-v, n, 0.75);
    vec3 q = p + rv * 0.45;
    float at = sT * 0.12;
    // 커튼 하나: 기울어진 큰 원을 따라가는 띠. 위치는 부드러운 사인으로만 휜다(갈라짐 없음)
    vec3 ax1 = normalize(vec3(0.25 * sin(at * 0.7), 1.0, 0.35));
    vec3 ax2 = normalize(vec3(-0.45, 0.85, -0.3 + 0.2 * cos(at * 0.5)));
    vec3 ax3 = normalize(vec3(0.6, 0.7, 0.2));
    float s1 = dot(q, ax1) - 0.18 + 0.12 * sin(q.x * 2.6 + q.z * 1.9 + at * 2.0);
    float s2 = dot(q, ax2) + 0.22 + 0.1 * sin(q.z * 2.2 - q.x * 1.7 - at * 1.6);
    float s3 = dot(q, ax3) + 0.02 + 0.1 * sin(q.y * 2.4 + at * 1.3);
    // 커튼 단면: 아래 끝은 또렷하게, 위로는 길게 엷어진다(넓은 리본)
    float c1 = s1 < 0.0 ? exp(-s1 * s1 * 160.0) : exp(-s1 * s1 * 26.0);
    float c2 = s2 < 0.0 ? exp(-s2 * s2 * 150.0) : exp(-s2 * s2 * 30.0);
    float c3 = (s3 < 0.0 ? exp(-s3 * s3 * 140.0) : exp(-s3 * s3 * 34.0)) * sD1;
    // 세로 빛살: 커튼을 따라 가는 결(가까이부터), 천천히 흐른다
    float rays = 1.0;
    if (sD1 > 0.001) {
      float along = atan(q.z, q.x);
      rays = mix(1.0, 0.82 + 0.18 * sin(along * 18.0 + sin(along * 4.0 + at * 3.0) * 1.5), sD1);
    }
    vec3 k1 = mix(sEmotion(0.3), sEmotion(0.55), clamp(s1 * 3.0 + 0.5, 0.0, 1.0));
    vec3 k2 = mix(sEmotion(0.7), uLight, clamp(s2 * 3.0 + 0.4, 0.0, 1.0));
    vec3 k3 = mix(uAccentA, uLight, 0.4);
    vec3 curtains = (k1 * c1 + k2 * c2 * 0.85 + k3 * c3 * 0.7) * rays;
    // 몸통: 밤빛으로 가라앉힘(감정 무늬는 그대로, 밝기만 낮춤). 커튼이 빛을 비춘다.
    float wrap = smoothstep(-0.2, 1.0, ndl);
    vec3 night = col * (0.1 + 0.42 * wrap);
    float fres = 0.04 + 0.96 * pow(1.0 - mu, 5.0);
    lit = night + curtains * (0.75 + 0.25 * (1.0 - mu)) * 1.15 * sAmt * (OVERLAY_MAX * 2.86);
    lit += sEnv(reflect(-v, n)) * fres * 0.35;
    lit += vec3(pow(max(dot(n, normalize(LIGHT_DIR + v)), 0.0), 120.0) * 0.45);
    lit = sSoft(lit * uExposure, 0.15);
    atmoK = 0.7;
  `,
};

// 솜사탕 구름만 쓰는 가장자리 투명도 변수(다른 스타일의 셰이더 문자열은 한 글자도 바뀌지 않게 구름일 때만 넣는다)
const CLOUD_ALPHA_DECL = '    float cloudAlpha = 1.0;\n';

function bodyFor(style: SurfaceStyle) {
  return /* glsl */ `
    // ---- 표면 스타일: ${style} (감정 본체 색 col 을 입력으로 재질만 바꾼다) ----
    const float OVERLAY_MAX = OVERLAY_MAX_VALUE;
    float sT = uTime;
    float sD1 = clamp(uSurfaceTier, 0.0, 1.0);
    float sD2 = clamp(uSurfaceTier - 1.0, 0.0, 1.0);
    float sAmt = uSurfaceAmount;
    vec3 lit = vec3(0.0);
    float atmoK = 1.0;
${style === 'pastel_cloud' ? CLOUD_ALPHA_DECL : ''}${STYLE_BODIES[style]}
    // 기존 가장자리 대기(행성마다 세기 다름)는 스타일에 맞는 만큼만, 발광은 그대로 더한다
    float fr = pow(1.0 - mu, 5.0);
    lit += uAtmoColor * fr * (0.05 + 0.6 * smoothstep(-0.25, 0.5, ndl)) * uAtmo * (1.0 + 1.5 * uHighlight) * atmoK;
    lit += col * uEmissive;
`;
}

/**
 * 표면 스타일을 넣은 행성 셰이더. style 이 null 이면 base 를 그대로 돌려준다(기존 행성과 완전히 같다).
 * 기존 셰이더에서 바꿀 구간을 찾지 못하면(기존 셰이더가 바뀜) 안전하게 base 를 그대로 쓴다.
 * overlayMax: 겹치는 스타일이 감정 무늬를 덮는 최대 비율(surface-style.ts SURFACE_OVERLAY_MAX).
 */
export function buildSurfaceFragmentShader(base: string, style: SurfaceStyle | null, overlayMax: number): string {
  if (!style) return base;
  const start = base.indexOf(SURFACE_LIGHTING_START);
  const end = base.indexOf(SURFACE_LIGHTING_END);
  const main = base.indexOf(MAIN);
  if (start < 0 || end < start || main < 0 || main > start) return base;
  const decls = DECLS + (style === 'crystal_prism' ? CRYSTAL_DECLS : '') + (style === 'pastel_cloud' ? CLOUD_DECLS.replace('CLOUD_EDGE_SOFT_VALUE', CLOUD_SHAPE.edgeSoft.toFixed(3)) : '');
  let tail = base.slice(end + SURFACE_LIGHTING_END.length);
  // [2026-11-26] 솜사탕 구름만: 가장자리 투명도를 마지막 색 쓰기에 넣는다(재질도 transparent). 다른 스타일은 그대로(불투명).
  if (style === 'pastel_cloud' && tail.includes(FINAL_WRITE)) tail = tail.replace(FINAL_WRITE, CLOUD_FINAL_WRITE);
  return (
    base.slice(0, main) +
    decls +
    base.slice(main, start) +
    bodyFor(style).replace('OVERLAY_MAX_VALUE', Math.min(Math.max(overlayMax, 0), 1).toFixed(3)) +
    tail
  );
}

/**
 * [2026-11-25] 스타일별 몸통 모양. 크리스탈은 깎은 다면체(정이십면체를 한 번 나눔 = 80면), 나머지는 기존 구.
 * 크기(반지름)는 그대로다(꼭짓점이 같은 반지름 위). 구름은 구를 정점 셰이더에서 부풀린다(CLOUD_VERTEX, CLOUD_SHAPE).
 */
export const SURFACE_BODY_SHAPE: Record<SurfaceStyle, 'sphere' | 'faceted'> = {
  opal_glass: 'sphere',
  pastel_cloud: 'sphere',
  pearl_silk: 'sphere',
  crystal_prism: 'faceted',
  aurora_ribbon: 'sphere',
};

/**
 * [2026-11-26] 솜사탕 구름 모양 설정.
 *  - lift: 구름 덩어리가 표면 바깥으로 부푸는 높이(반지름 대비). [2026-11-26 3차] 0 = 덩어리 없는 매끈한 구(사용자 요청).
 *    덩어리 높이 값(vCloudH)은 계속 계산해 설탕 실 결이 소용돌이처럼 감기는 데만 쓴다.
 *  - segments: 부푼 곡면이 매끈하도록 몸통 구의 최소 분할(품질별). 저품질도 덩어리가 각지지 않을 만큼만.
 *  - edgeSoft: 덩어리 외곽이 안개처럼 옅어지는 정도. 별도 안개 막(구 모양이라 둥근 고리로 보였다) 대신 몸통 가장자리를
 *    반투명하게 해서 울퉁불퉁한 덩어리 외곽을 그대로 따라 부드럽게 번진다.
 */
export const CLOUD_SHAPE = {
  lift: 0,
  segments: { low: 32, medium: 40, high: 56 },
  /** 가장자리가 옅어지는 정도(0 = 불투명한 외곽, 1 = 외곽 끝이 완전히 투명). 몸통 자체라 덩어리 모양을 그대로 따라간다. */
  edgeSoft: 0.4, // [2026-11-26 3차] 덩어리가 없어 외곽은 살짝만 보송하게(뒤 대기막이 검은 테두리로 비치지 않게)
} as const;
