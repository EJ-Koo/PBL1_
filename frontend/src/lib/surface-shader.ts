// [NEW FILE 2026-11-21] 표면 스타일 GLSL. 참고: 파스텔 오팔 5종 쇼케이스 HTML(Three.js)의 셰이더를 오늘의별일 행성 셰이더에 맞게 옮겼다.
//
// 기존 행성 셰이더(universe-scene.tsx PLANET_FRAGMENT_SHADER)는 두 단계다.
//   1) 감정 본체: 감정 색 줄(uStrip, AI 감정 분석으로 만든 색·비율)을 무늬로 읽어 col 을 만든다.
//   2) 조명: col 에 빛·하이라이트·가장자리 대기를 더해 lit 을 만든다. 그 뒤 먼 행성·선택·별자리 어둡게를 곱한다.
// 표면 스타일은 1)의 col 을 입력으로 받아 2)의 조명 구간만 스타일 재질로 바꾼다. 1)과 마지막 곱셈들은 그대로다.
// 스타일이 없으면 buildSurfaceFragmentShader 가 원래 문자열을 그대로 돌려준다(기존 행성과 완전히 같다).
//
// 참고 HTML과 다른 점
//  - 색: 감정 프리셋 4색·파스텔 고정색 대신 감정 색 줄(sEmotion)·대표색 계열 밝은 색(uLight)·보조 감정 색(uAccentA)만 쓴다.
//    (무지갯빛 광택은 재질 성질이라 남기되 uLight 쪽으로 물들인다.)
//  - 노이즈: 심플렉스 노이즈 대신 기존 행성 셰이더의 값 노이즈(fbm, OCTAVES)를 다시 쓴다(셰이더 크기·컴파일 시간).
//  - 단계(LOD): uSurfaceTier(0~2, 부드럽게 바뀜). 0이면 추가 노이즈 없이 광택만, 1부터 무늬·움직임, 2부터 가는 결·반짝임.
//  - 조명: 기존 빛 방향(LIGHT_DIR)과 어두운 면을 유지한다(참고 HTML처럼 밤면까지 밝히지 않음 → 다른 행성과 어울리게).
import type { SurfaceStyle } from './surface-style';

/** 기존 셰이더에서 스타일 조명으로 바꿀 구간(시작·끝 줄). 기존 셰이더가 바뀌면 테스트가 알려 준다. */
export const SURFACE_LIGHTING_START = '    float diff = smoothstep(-0.12, 0.95, ndl);';
export const SURFACE_LIGHTING_END = '    lit += col * uEmissive;\n';
const MAIN = '  void main() {';

const DECLS = /* glsl */ `
  // ---- 표면 스타일(2026-11-21) ----
  uniform float uTime;
  uniform float uSurfaceTier;
  uniform float uSurfaceAmount;
  uniform vec3 uAccentA;
  // 감정 색 줄에서 색을 읽는다(감정 본체와 같은 색·같은 비율). 스타일의 색은 모두 여기·uLight·uAccentA 에서 온다.
  vec3 sEmotion(float t) {
    return srgbToLinear(texture2D(uStrip, vec2(clamp(t, 0.002, 0.998), 0.5)).rgb);
  }
  float sMax(vec3 c) { return max(c.r, max(c.g, c.b)); }
  // 얇은 막 무지갯빛(비눗방울·오팔). 감정 밝은 색 쪽으로 물들여 고정 무지개색이 감정 색을 덮지 않게 한다.
  vec3 sIrid(float a, float shift) {
    vec3 s = 0.72 + 0.28 * cos(6.28318 * (a * 1.232 + shift * 0.28 + vec3(0.02, 0.34, 0.62)));
    return mix(s, uLight / max(sMax(uLight), 0.001), 0.6);
  }
  // 유리·진주 조명: 부드러운 감싸는 빛 + 속에서 번지는 빛 + 두 겹 하이라이트 + 무지갯빛 가장자리
  vec3 sLighting(vec3 base, vec3 glow, vec3 nn, vec3 vv, float ndl1, float clearcoat, float irid, float sss) {
    vec3 L2 = normalize(vec3(-0.85, -0.42, 0.72));
    float ndv = max(dot(nn, vv), 0.0);
    float wrap = smoothstep(-0.3, 1.0, ndl1);
    vec3 lit = mix(base * 0.12, base * 1.0, wrap) + base * smoothstep(-0.6, 0.9, dot(nn, L2)) * 0.08;
    float sssF = pow(clamp(1.0 - abs(ndl1 * 0.65), 0.0, 1.0), 2.0) * 0.35 + (1.0 - ndv) * 0.25;
    lit += (glow + base * sssF * sss) * 0.4 * mix(0.25, 1.0, wrap);
    float nh1 = max(dot(nn, normalize(LIGHT_DIR + vv)), 0.0);
    float nh2 = max(dot(nn, normalize(L2 + vv)), 0.0);
    lit += vec3(pow(nh1, 22.0) * 0.2 + pow(nh1, 115.0) * 0.8 * clearcoat);
    vec3 rim = sIrid(1.0 - ndv, uTime * 0.14 + dot(vObj, vec3(0.5, 0.7, 0.4)));
    lit += mix(vec3(1.0), rim, 0.5) * pow(nh2, 56.0) * 0.22 * clearcoat;
    lit += rim * pow(1.0 - ndv, 2.55) * 0.38 * irid * mix(0.3, 1.0, wrap);
    // 밝은 곳이 하얗게 날아가지 않게 부드럽게 눌러 준다
    return mix(lit, lit / (lit + vec3(0.95)) * 1.82, 0.28);
  }
`;

const CRYSTAL_DECLS = /* glsl */ `
  vec3 sHash33(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
    return fract(sin(p) * 43758.5453123);
  }
  // 3D 보로노이: 가장 가까운·두 번째로 가까운 거리와 칸 번호(결정면)
  vec3 sVoronoi(vec3 x, float tm) {
    vec3 cn = floor(x);
    vec3 cf = fract(x);
    float md1 = 8.0;
    float md2 = 8.0;
    float id = 0.0;
    for (int k = -1; k <= 1; k++) {
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec3 g = vec3(float(i), float(j), float(k));
          vec3 o = 0.5 + 0.38 * sin(tm + 6.2831 * sHash33(cn + g));
          vec3 r = g + o - cf;
          float d = dot(r, r);
          if (d < md1) {
            md2 = md1;
            md1 = d;
            id = fract(dot(cn + g, vec3(0.37, 0.71, 0.19)));
          } else if (d < md2) {
            md2 = d;
          }
        }
      }
    }
    return vec3(sqrt(md1), sqrt(md2), id);
  }
`;

// 각 스타일: surf(표면색)·glow(속빛)·cc/ir/ss(유리 광택·무지갯빛·속빛 세기)를 정한다.
// 쓸 수 있는 값: col(감정 본체 색), p·vObj(표면 위치), w1·w2(감정 무늬가 이미 계산한 노이즈), u(무늬 흐름 좌표), mu(정면일수록 1)
const STYLE_BODIES: Record<SurfaceStyle, string> = {
  // 광택만(finish): 감정 무늬는 그대로, 유리 광택·무지갯빛 막·속에 떠다니는 빛결만 더한다
  opal_glass: /* glsl */ `
    float ow2 = 0.0;
    if (sD1 > 0.001) {
      float ow1 = fbm(vObj * 1.9 + vec3(sT * 0.07, -sT * 0.056, sT * 0.04) + uSeed);
      float owb = fbm(vObj * 3.1 + vec3(ow1 * 1.2, sT * 0.048, -ow1) + uSeed.zxy);
      float wisp = smoothstep(0.28, 0.82, 0.5 + 0.5 * sin((ow1 - 0.5) * 13.0 + (owb - 0.5) * 9.0 + sT * 0.22));
      glow = mix(sEmotion(owb * 1.6 - 0.3), uLight, 0.4) * wisp * (0.22 + 0.12 * sD2) * sD1 * sAmt;
      ow2 = (owb - 0.5) * 2.0 * sD1;
    }
    vec3 milky = mix(col, uLight, 0.1 * sAmt);
    vec3 opal = sIrid(1.0 - mu + ow2 * 0.32, sT * 0.1) * (0.45 + 0.55 * sMax(col));
    surf = mix(milky, opal, (0.07 + (1.0 - mu) * 0.24) * sAmt);
    cc = 1.0; ir = 1.22; ss = 0.85;
  `,
  // 광택만(finish): 진주 광택 + 감정 무늬 흐름(u)을 따라가는 실크 빛줄기(색 = 대표색 계열 밝은 색)
  pearl_silk: /* glsl */ `
    float pn1 = 0.5;
    float pn2 = 0.5;
    if (sD1 > 0.001) {
      pn1 = mix(0.5, fbm(vObj * 1.95 + vec3(sT * 0.03, -sT * 0.02, 0.0) + uSeed), sD1);
      pn2 = mix(0.5, fbm(vObj * 3.6 + vec3(pn1 * 1.6, 2.4, -sT * 0.025) + uSeed.zxy), sD1);
    }
    float phase = dot(vObj, vec3(2.1, 2.8, -1.6)) * 0.6 + u * 2.2 + (pn1 - 0.5) * 6.8 + (pn2 - 0.5) * 3.2;
    float vein = exp(-abs(sin(phase * 2.1 + 0.4)) * 14.0);
    float fineV = exp(-abs(sin(phase * 4.2 - (pn2 - 0.5) * 4.0)) * 22.0) * 0.55 * sD2;
    vec3 pearl = mix(col, mix(uLight, vec3(1.0), 0.3), 0.1 * sAmt);
    vec3 veinCol = mix(uLight, vec3(1.0), 0.25);
    surf = mix(pearl, veinCol, clamp(vein * 0.45 + fineV * 0.4, 0.0, 0.5) * sAmt);
    glow = (veinCol * (vein * 0.35 + fineV * 0.25) + pearl * 0.1) * sAmt;
    cc = 0.88; ir = 0.78; ss = 0.65;
  `,
  // 겹침(overlay): 감정 색으로 물든 구름결. 멀리서는 감정 무늬가 이미 만든 노이즈(w1·w2)를 그대로 써서 추가 계산이 없다.
  pastel_cloud: /* glsl */ `
    float cA = w1;
    float cB = w2;
    if (sD1 > 0.001) {
      vec3 cp = vObj * 1.85 + uSeed * 0.1;
      vec3 q = vec3(fbm(cp + vec3(0.0, sT * 0.044, 0.0)), fbm(cp + vec3(4.3, -sT * 0.038, 1.7)), 0.5);
      float a2 = fbm(cp + 2.9 * (q - 0.5) + vec3(sT * 0.027, 0.0, -sT * 0.022));
      float b2 = sD2 > 0.001 ? mix(w2, fbm(cp * 1.7 - 2.3 * (q - 0.5) + vec3(3.2, -sT * 0.024, 2.4)), sD2) : w2;
      cA = mix(cA, a2, sD1);
      cB = mix(cB, b2, sD1);
    }
    float field = clamp((mix(cA, cB, 0.44) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
    vec3 water = sEmotion(field);
    float puff = smoothstep(0.4, 0.6, cA * 0.65 + cB * 0.35);
    vec3 fluffy = mix(water * 0.92, mix(water, uLight, 0.6), puff);
    surf = mix(col, fluffy, OVERLAY_MAX * sAmt * (0.6 + 0.4 * puff));
    // 구름 덩어리가 속에서 은은하게 빛난다(감정 밝은 색). 무늬를 덮지 않고 밝기만 더한다.
    glow = mix(water, uLight, 0.55) * (0.1 + 0.45 * puff) * sAmt;
    cc = 0.48; ir = 0.88; ss = 1.05;
  `,
  // 겹침(overlay): 결정면마다 감정 색 줄의 다른 색(보석) + 결정 경계 빛 + 프리즘 반짝임. 멀리서는 광택만.
  crystal_prism: /* glsl */ `
    float edgeGlow = 0.0;
    float cellId = 0.5;
    float f1 = 0.5;
    vec3 gem = col;
    if (sD1 > 0.001) {
      vec3 vor = sVoronoi(vObj * 2.85 + uSeed * 0.1, sT * 0.24);
      f1 = mix(0.5, vor.x, sD1);
      cellId = vor.z;
      edgeGlow = smoothstep(0.14, 0.015, vor.y - vor.x) * sD1;
      gem = mix(col, sEmotion(cellId), sD1);
    }
    vec3 body = mix(col, gem, OVERLAY_MAX * sAmt);
    body = mix(body, uLight, (0.05 + (1.0 - f1) * 0.08) * sAmt);
    float glint = pow(max(sin(mu * 10.0 + cellId * 18.0 + sT * 0.65), 0.0), 14.0) * 0.55 * sD2;
    vec3 prism = sIrid(cellId + mu, sT * 0.25);
    surf = body;
    glow = mix(prism, vec3(1.0), 0.55) * (edgeGlow * 0.45 + glint * 0.6) * sAmt;
    cc = 1.05; ir = 1.02; ss = 0.78;
  `,
  // 겹침(overlay): 감정 색 줄에서 고른 색의 오로라 리본 세 줄기. 세 번째 줄기(보조 감정 색)는 선택했을 때만.
  aurora_ribbon: /* glsl */ `
    float warp = w1;
    if (sD1 > 0.001) warp = mix(w1, fbm(vObj * 1.85 + vec3(0.0, sT * 0.075, 0.0) + uSeed), sD1);
    float sw = (warp - 0.5) * 2.0;
    float at = sT * 0.34;
    float a1 = sin(vObj.x * 4.2 + vObj.y * 3.8 + sw * 3.6 + at);
    float a2 = sin(vObj.y * 4.8 - vObj.z * 4.4 + sw * 3.2 - at * 0.85);
    float a3 = sin((vObj.z + vObj.x) * 3.9 + sw * 4.1 + at * 0.7);
    float r1 = exp(-abs(a1) * 2.8);
    float r2 = exp(-abs(a2) * 3.1);
    float r3 = exp(-abs(a3) * 3.5) * sD2;
    vec3 c1 = sEmotion(0.18 + 0.35 * (0.5 + 0.5 * a2));
    vec3 c2 = sEmotion(0.55 + 0.4 * (0.5 + 0.5 * a3));
    vec3 c3 = mix(col, uAccentA, 0.5 + 0.5 * sin(at + sw * 2.5));
    vec3 ribbons = c1 * r1 * 0.72 + c2 * r2 * 0.68 + c3 * r3 * 0.55;
    surf = mix(col, uLight, 0.06 * sAmt) + ribbons * OVERLAY_MAX * sAmt;
    glow = (ribbons * 0.95 + uLight * (r1 * r2) * 0.45) * sAmt;
    cc = 1.0; ir = 0.96; ss = 0.82;
  `,
};

function bodyFor(style: SurfaceStyle) {
  return /* glsl */ `
    // ---- 표면 스타일: ${style} (감정 본체 색 col 을 입력으로 재질만 바꾼다) ----
    const float OVERLAY_MAX = OVERLAY_MAX_VALUE;
    float sT = uTime;
    float sD1 = clamp(uSurfaceTier, 0.0, 1.0);
    float sD2 = clamp(uSurfaceTier - 1.0, 0.0, 1.0);
    float sAmt = uSurfaceAmount;
    vec3 surf = col;
    vec3 glow = vec3(0.0);
    float cc = 1.0;
    float ir = 1.0;
    float ss = 0.8;
${STYLE_BODIES[style]}
    vec3 lit = sLighting(surf, glow, n, v, ndl, cc, ir, ss) * uExposure;
    // 기존 가장자리 대기(행성마다 세기 다름)와 발광은 그대로 더한다
    float fr = pow(1.0 - mu, 5.0);
    lit += uAtmoColor * fr * (0.05 + 0.6 * smoothstep(-0.25, 0.5, ndl)) * uAtmo * (1.0 + 1.5 * uHighlight);
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
  const decls = DECLS + (style === 'crystal_prism' ? CRYSTAL_DECLS : '');
  return (
    base.slice(0, main) +
    decls +
    base.slice(main, start) +
    bodyFor(style).replace('OVERLAY_MAX_VALUE', Math.min(Math.max(overlayMax, 0), 1).toFixed(3)) +
    base.slice(end + SURFACE_LIGHTING_END.length)
  );
}
