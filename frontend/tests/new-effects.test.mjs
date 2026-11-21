// [2026-11-21] 신규 특수 효과 3종(천상의 고리·공전하는 위성·별똥별) 등록·크기 규칙. 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECT_LABELS,
  NEW_EFFECT_LAYOUT,
  NEW_SPECIAL_TYPES,
  SPECIAL_EFFECT_SETTINGS,
  SPECIAL_NAMES,
  SPECIAL_TYPES,
  asSpecialType,
  effectOfItem,
  effectReach,
  effectToDraw,
  isNewSpecialType,
  moonLayout,
  ringRadii,
} from '../src/lib/special-planet.ts';

// 행성 id 고정 난수 대신(planet-visual.ts 는 react-native 를 불러와 node 에서 못 읽음) 같은 성질의 결정적 난수열
function seededRandoms(key, count) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return Array.from({ length: count }, () => {
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  });
}

const RADII = [0.16, 0.2, 0.3, 0.4, 0.54]; // 실제 행성 반지름 범위(planet-size.ts 0.16~0.54)

test('효과는 모두 8종: 기존 5종 id·순서 그대로 + 신규 3종', () => {
  assert.deepEqual(SPECIAL_TYPES.slice(0, 5), ['ocean', 'cloud', 'crystal', 'nebula', 'lava']);
  assert.deepEqual(SPECIAL_TYPES.slice(5), ['celestial_ring', 'orbiting_moons', 'shooting_stars']);
  assert.deepEqual([...NEW_SPECIAL_TYPES], SPECIAL_TYPES.slice(5));
  for (const t of SPECIAL_TYPES) {
    assert.ok(SPECIAL_NAMES[t] && EFFECT_LABELS[t].name && EFFECT_LABELS[t].icon, t);
    assert.equal(SPECIAL_EFFECT_SETTINGS.types[t], true, t);
    assert.equal(effectToDraw(t), t);
    assert.equal(isNewSpecialType(t), NEW_SPECIAL_TYPES.includes(t));
  }
  assert.equal(asSpecialType('celestial_ring'), 'celestial_ring');
  assert.equal(asSpecialType('sparkle'), null);
});

test('상점 아이템 → 효과: 신규 효과도 기존 효과와 같은 칸(planet_effect)으로 읽힌다', () => {
  const item = (special) => ({ slot: 'planet_effect', effect: { type: 'planet_effect', special } });
  assert.equal(effectOfItem(item('orbiting_moons')), 'orbiting_moons');
  assert.equal(effectOfItem(item('ocean')), 'ocean');
  assert.equal(effectOfItem({ slot: 'planet_surface', effect: { type: 'planet_surface', surface: 'opal_glass' } }), null);
});

test('효과 거리: 행성 크기에 비례하되 표면 바깥 거리는 최소·최대로 묶인다', () => {
  for (const r of RADII) {
    for (const k of [1.4, 1.8, 2.2, 2.4]) {
      const gap = effectReach(r, k) - r;
      assert.ok(gap >= NEW_EFFECT_LAYOUT.minGap - 1e-9 && gap <= NEW_EFFECT_LAYOUT.maxGap + 1e-9, `${r} ${k} → ${gap}`);
    }
  }
  // 보통 크기에서는 배수 그대로
  assert.ok(Math.abs(effectReach(0.3, 1.6) - 0.48) < 1e-9);
});

test('천상의 고리: 고리 3개가 행성 밖에서 서로 겹치지 않는다(작은 행성 포함)', () => {
  for (const r of RADII) {
    const radii = ringRadii(r, NEW_EFFECT_LAYOUT.ring.radii);
    assert.equal(radii.length, 3);
    assert.ok(radii[0] > r + 0.05, `${r}: 안쪽 고리가 행성 표면과 떨어져 있다`);
    assert.ok(radii[1] - radii[0] >= 0.03 - 1e-9 && radii[2] - radii[1] >= 0.03 - 1e-9, `${r}: ${radii}`);
  }
});

test('공전하는 위성: 같은 행성은 늘 같은 구성, 2~3개, 행성보다 충분히 작고 서로·행성과 부딪히지 않는다', () => {
  for (let n = 0; n < 60; n++) {
    const rand = seededRandoms(`diary-${n}:moons`, 18);
    for (const r of RADII) {
      const moons = moonLayout(r, rand);
      assert.deepEqual(moonLayout(r, rand), moons, '결정적');
      assert.ok(moons.length >= 2 && moons.length <= 3);
      for (const m of moons) {
        assert.ok(m.size <= r * 0.5, `위성이 행성보다 충분히 작다 ${m.size} / ${r}`);
        assert.ok(m.orbit - m.size > r + m.size * 0.5, '위성이 행성 표면에 닿지 않는다');
        assert.ok([0, 1, 2].includes(m.kind));
      }
      for (let i = 1; i < moons.length; i++) {
        // 궤도는 같은 중심의 서로 다른 반지름 → 두 위성 사이 거리 ≥ 반지름 차이 > 두 위성 크기 합
        assert.ok(moons[i].orbit - moons[i - 1].orbit > moons[i].size + moons[i - 1].size, '위성끼리 겹치지 않는다');
      }
      assert.ok(new Set(moons.map((m) => m.kind)).size === moons.length, '위성마다 디자인(진주·수정·발광)이 다르다');
    }
  }
});
