// [2026-11-21] 행성 표면 스타일(src/lib/surface-style.ts, surface-shader.ts). 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLANET_SURFACE_SLOT,
  SURFACE_OVERLAY_MAX,
  SURFACE_STYLES,
  SURFACE_STYLE_IDS,
  SURFACE_STYLE_SETTINGS,
  asSurfaceStyle,
  surfaceOfItem,
  surfaceToDraw,
} from '../src/lib/surface-style.ts';
import {
  CLOUD_SHAPE,
  FINAL_WRITE,
  SURFACE_BODY_SHAPE,
  SURFACE_LIGHTING_END,
  SURFACE_LIGHTING_START,
  buildSurfaceFragmentShader,
  buildSurfaceVertexShader,
} from '../src/lib/surface-shader.ts';

// 템플릿 문자열 안의 줄바꿈은 실행할 때 항상 \n 이 된다(파일이 CRLF 로 체크아웃돼 있어도) → 같은 상태로 맞춘다
const SCENE = readFileSync(new URL('../src/components/universe-scene.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// universe-scene.tsx 의 실제 행성 셰이더 문자열(템플릿 안의 ${...}는 그대로 둔 채)
const BASE = SCENE.slice(SCENE.indexOf('const PLANET_FRAGMENT_SHADER = `') + 'const PLANET_FRAGMENT_SHADER = `'.length);
const PLANET_FRAGMENT = BASE.slice(0, BASE.indexOf('`;'));

test('기본 스타일(null)은 기존 셰이더 문자열을 그대로 쓴다 = 기존 행성과 완전히 같다', () => {
  assert.equal(buildSurfaceFragmentShader(PLANET_FRAGMENT, null, SURFACE_OVERLAY_MAX), PLANET_FRAGMENT);
});

test('기존 행성 셰이더에 바꿀 구간 표시가 정확히 한 번씩 있다', () => {
  assert.equal(PLANET_FRAGMENT.split(SURFACE_LIGHTING_START).length, 2);
  assert.equal(PLANET_FRAGMENT.split(SURFACE_LIGHTING_END).length, 2);
});

test('스타일은 감정 본체(색 줄 → col)를 그대로 두고 조명 구간만 바꾼다', () => {
  const core = PLANET_FRAGMENT.slice(PLANET_FRAGMENT.indexOf('  void main() {'), PLANET_FRAGMENT.indexOf(SURFACE_LIGHTING_START));
  const after = PLANET_FRAGMENT.slice(PLANET_FRAGMENT.indexOf(SURFACE_LIGHTING_END) + SURFACE_LIGHTING_END.length);
  for (const style of SURFACE_STYLE_IDS) {
    const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
    assert.notEqual(out, PLANET_FRAGMENT, style);
    assert.ok(out.includes(core), `${style}: 감정 무늬 계산(색 줄·흐름·보조 감정 층)이 그대로`);
    // 솜사탕 구름만 마지막 색 쓰기에 가장자리 투명도를 넣는다(그 밖의 먼 행성·선택·별자리 어둡게 처리는 그대로)
    const expectAfter = style === 'pastel_cloud' ? after.replace(FINAL_WRITE, 'gl_FragColor = vec4(lit * cloudAlpha, cloudAlpha);') : after;
    assert.ok(out.includes(expectAfter), `${style}: 먼 행성·선택·별자리 어둡게 처리가 그대로`);
    assert.equal(out.includes('cloudAlpha, cloudAlpha'), style === 'pastel_cloud', `${style}: 반투명 외곽은 구름만`);
    assert.ok(!out.includes(SURFACE_LIGHTING_START), `${style}: 기본 조명 구간은 스타일 조명으로 바뀐다`);
    assert.equal(out.split('void main()').length, 2, `${style}: main 은 하나`);
  }
});

test('참고 HTML의 감정 프리셋·고정 파스텔 팔레트를 쓰지 않는다(색은 감정 본체에서만)', () => {
  for (const style of SURFACE_STYLE_IDS) {
    const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
    for (const banned of ['uC1', 'uC2', 'uC3', 'uC4', 'uWeights', 'samplePastelPalette', 'dominantPastel', 'champagne']) {
      assert.ok(!out.includes(banned), `${style}: ${banned}`);
    }
    assert.ok(out.includes('sEmotion') || out.includes('uLight'), `${style}: 감정 색 사용`);
  }
});

test('겹치는 스타일은 겹침 상한을 쓰고, 광택만 바꾸는 스타일은 쓰지 않는다', () => {
  for (const style of SURFACE_STYLE_IDS) {
    const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
    assert.ok(out.includes(`const float OVERLAY_MAX = ${SURFACE_OVERLAY_MAX.toFixed(3)};`));
    const body = out.slice(out.indexOf('표면 스타일: '));
    const usesCap = /OVERLAY_MAX \*/.test(body);
    assert.equal(usesCap, SURFACE_STYLES[style].scope === 'overlay', style);
  }
  assert.ok(SURFACE_OVERLAY_MAX <= 0.35);
});

// [2026-11-25] 스타일마다 조명 모델이 따로다(예전: 공통 sLighting 하나로 모두 비슷한 광택 구슬)
const body = (style) => {
  const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
  return out.slice(out.indexOf('표면 스타일: '));
};

test('공통 조명 함수를 쓰지 않는다 — 스타일마다 자기 조명 모델', () => {
  for (const style of SURFACE_STYLE_IDS) {
    const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
    assert.ok(!out.includes('sLighting('), style);
  }
  const bodies = SURFACE_STYLE_IDS.map(body);
  assert.equal(new Set(bodies).size, bodies.length, '본문이 모두 다르다');
});

test('재질 특성: 구름은 반사·무지갯빛·주변 반사가 없고, 유리·결정만 주변 반사(프레넬)를 크게 쓴다', () => {
  const cloud = body('pastel_cloud');
  assert.ok(!/sIrid\(|sEnv\(|pow\(nh,/.test(cloud), '구름: 광택·무지갯빛·반사 없음(무광)');
  assert.ok(/vCloudH/.test(cloud), '구름: 부푼 높이로 덩어리 사이 골짜기만 살짝 그늘');
  assert.ok(/uSoftStrip/.test(cloud), '구름: 넓게 흐린 감정 색 줄(큰 색 영역)을 읽는다');
  assert.ok(/fwidth\(sA\)/.test(cloud), '구름: 설탕 실 결은 멀리서 흐려져 깜빡이지 않는다');
  assert.ok(/refract\(/.test(body('opal_glass')), '유리: 속 굴절(색층 시차)');
  assert.ok(/sEnv\(/.test(body('opal_glass')) && /sEnv\(/.test(body('crystal_prism')));
  assert.ok(!/refract\(/.test(body('pearl_silk')), '진주: 불투명(굴절 없음)');
  assert.ok(/cross\(vec3\(0\.0, 1\.0, 0\.0\), n\)/.test(body('pearl_silk')), '진주: 결 방향 이방성 하이라이트');
  assert.ok(/cross\(dFdx\(vViewPos\), dFdy\(vViewPos\)\)/.test(body('crystal_prism')), '결정: 면 법선');
  // 오로라는 가는 선(노이즈로 갈라짐) 없이 넓은 커튼
  const aurora = body('aurora_ribbon');
  assert.ok(!/exp\(-abs\(/.test(aurora), '오로라: 갈라지는 가는 빛줄 공식 없음');
  assert.ok(/exp\(-s1 \* s1/.test(aurora), '오로라: 넓은 커튼 단면');
});

test('정점 셰이더: 크리스탈은 면 무게중심 좌표, 구름은 부푼 표면, 다른 스타일·기본 행성은 그대로', () => {
  const V = SCENE.slice(SCENE.indexOf('const PLANET_VERTEX_SHADER = `') + 'const PLANET_VERTEX_SHADER = `'.length);
  const VERT = V.slice(0, V.indexOf('`;'));
  for (const style of [null, ...SURFACE_STYLE_IDS]) {
    const vs = buildSurfaceVertexShader(VERT, style);
    if (style === 'crystal_prism') {
      assert.ok(vs.includes('attribute vec3 aBary;') && vs.includes('vBary = aBary;'));
      assert.equal(vs.split('void main()').length, 2);
    } else if (style === 'pastel_cloud') {
      // 감정 무늬 좌표(vObj)는 원래 방향 그대로, 같은 이름의 varying 을 넘긴다(프래그먼트 셰이더와 짝)
      for (const k of ['varying vec3 vNormalV;', 'varying vec3 vViewPos;', 'varying vec3 vObj;', 'varying float vCloudH;', 'vObj = d;', 'uCloudLift']) {
        assert.ok(vs.includes(k), k);
      }
      assert.equal(vs.split('void main()').length, 2);
    } else assert.equal(vs, VERT, String(style));
    if (style) {
      const fs = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
      assert.equal(fs.includes('varying vec3 vBary;'), style === 'crystal_prism', style);
      assert.equal(fs.includes('varying float vCloudH;'), style === 'pastel_cloud', style);
      assert.equal(SURFACE_BODY_SHAPE[style], style === 'crystal_prism' ? 'faceted' : 'sphere');
    }
  }
});

test('솜사탕 구름 모양: 바깥으로 조금만 부풀고, 외곽은 몸통 자체가 옅어진다(별도 안개 막 없음)', () => {
  assert.equal(CLOUD_SHAPE.lift, 0, '덩어리 없이 매끈한 구(설탕 실 결만 감긴다)');
  assert.ok(CLOUD_SHAPE.segments.low <= CLOUD_SHAPE.segments.medium && CLOUD_SHAPE.segments.medium <= CLOUD_SHAPE.segments.high);
  assert.ok(CLOUD_SHAPE.edgeSoft > 0 && CLOUD_SHAPE.edgeSoft <= 1);
  assert.ok(PLANET_FRAGMENT.includes(FINAL_WRITE), '기존 셰이더의 마지막 색 쓰기를 찾을 수 있다');
  assert.ok(!('haze' in CLOUD_SHAPE));
});

test('바꿀 구간을 못 찾으면 안전하게 기존 셰이더를 그대로 쓴다', () => {
  const changed = PLANET_FRAGMENT.replace(SURFACE_LIGHTING_START, '    float diff = 1.0;');
  assert.equal(buildSurfaceFragmentShader(changed, 'opal_glass', SURFACE_OVERLAY_MAX), changed);
});

test('상점 아이템 → 표면 스타일: 표면 아이템만, 효과 아이템·모르는 값은 null', () => {
  const sf = (surface) => ({ slot: PLANET_SURFACE_SLOT, effect: { type: PLANET_SURFACE_SLOT, surface } });
  assert.equal(surfaceOfItem(sf('opal_glass')), 'opal_glass');
  assert.equal(surfaceOfItem(sf('glitter')), null);
  assert.equal(surfaceOfItem({ slot: 'planet_effect', effect: { type: 'planet_effect', special: 'ocean' } }), null);
  assert.equal(surfaceOfItem({ slot: PLANET_SURFACE_SLOT, effect: { type: 'planet_effect', surface: 'opal_glass' } }), null);
  assert.equal(asSurfaceStyle('pearl_silk'), 'pearl_silk');
  assert.equal(asSurfaceStyle(undefined), null);
  assert.equal(SURFACE_STYLE_IDS.length, 5);
});

test('표면을 끄면(설정) 기본 스타일로 그린다', () => {
  assert.equal(surfaceToDraw('opal_glass'), 'opal_glass');
  SURFACE_STYLE_SETTINGS.styles.opal_glass = false;
  assert.equal(surfaceToDraw('opal_glass'), null);
  SURFACE_STYLE_SETTINGS.styles.opal_glass = true;
  SURFACE_STYLE_SETTINGS.enabled = false;
  assert.equal(surfaceToDraw('pearl_silk'), null);
  SURFACE_STYLE_SETTINGS.enabled = true;
  assert.equal(surfaceToDraw(null), null);
});

// [2026-11-26] 솜사탕 구름 색: 넓게 흐린 감정 색 줄 — 감정 색 비율(평균 색)은 그대로, 가는 층만 사라진다
test('솜사탕 구름 색 줄: 평균 색(감정 비율)은 거의 그대로, 가는 층의 색 차이는 크게 줄어든다', async () => {
  const { softenStrip } = await import('../src/lib/soft-strip.ts');
  const N = 512;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const band = Math.floor(i / 16) % 2 === 0; // 16텍셀마다 바뀌는 가는 층(분홍/하늘)
    data.set(band ? [255, 156, 194, 255] : [140, 200, 255, 255], i * 4);
  }
  const soft = softenStrip(data, N);
  // 양 끝은 끝 색을 이어 쓰므로(설계) 가운데 구간에서 잰다
  const mid = (d, c) => Array.from({ length: N - 256 }, (_, i) => d[(i + 128) * 4 + c]);
  const mean = (d, c) => { const v = mid(d, c); return v.reduce((a, b) => a + b, 0) / v.length; };
  const spread = (d, c) => { const v = mid(d, c); const m = mean(d, c); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  for (const c of [0, 1, 2]) {
    assert.ok(Math.abs(mean(soft, c) - mean(data, c)) < 3, `채널 ${c} 평균 유지`);
    assert.ok(spread(soft, c) < spread(data, c) * 0.15, `채널 ${c} 가는 층 사라짐`);
  }
});
