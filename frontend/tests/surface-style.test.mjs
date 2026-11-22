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
  SURFACE_LIGHTING_END,
  SURFACE_LIGHTING_START,
  buildSurfaceFragmentShader,
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
    assert.ok(out.includes(after), `${style}: 먼 행성·선택·별자리 어둡게 처리가 그대로`);
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

test('crystal 만 보로노이 함수를 추가한다(다른 스타일은 셰이더가 작다)', () => {
  for (const style of SURFACE_STYLE_IDS) {
    const out = buildSurfaceFragmentShader(PLANET_FRAGMENT, style, SURFACE_OVERLAY_MAX);
    assert.equal(out.includes('sVoronoi('), style === 'crystal_prism', style);
  }
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
