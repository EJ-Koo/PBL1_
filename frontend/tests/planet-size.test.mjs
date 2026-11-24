// [2026-11-18] 행성 크기 규칙(src/lib/planet-size.ts). 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANET_BASE_RADIUS,
  PLANET_SCALE_MAX,
  PLANET_SCALE_MIN,
  capRadiiByNeighbors,
  planetRadiusForText,
  planetScaleForText,
} from '../src/lib/planet-size.ts';

const text = (n) => '가'.repeat(n);

test('배율은 0.6~2.0, 글자 수가 늘수록 커지고 300자에서 최대', () => {
  assert.equal(planetScaleForText(''), PLANET_SCALE_MIN);
  assert.equal(planetScaleForText(text(300)), PLANET_SCALE_MAX);
  assert.equal(planetScaleForText(text(2000)), PLANET_SCALE_MAX);
  let prev = 0;
  for (const n of [0, 5, 10, 20, 50, 100, 200, 300]) {
    const s = planetScaleForText(text(n));
    assert.ok(s > prev, `${n}자`);
    prev = s;
  }
});

test('표시 반지름은 약 0.16~0.54 (2026-11-21 15% 축소)', () => {
  assert.ok(Math.abs(planetRadiusForText('') - 0.1632) < 1e-9);
  assert.ok(Math.abs(planetRadiusForText(text(300)) - 0.544) < 1e-9);
});

test('공백은 세지 않는다', () => {
  assert.equal(planetScaleForText('가 나 다'), planetScaleForText('가나다'));
});

test('짧은 일기끼리도 분량 차이가 보인다(5자 vs 40자 1.5배 이상, 예전 약 1.1배)', () => {
  const ratio = planetRadiusForText(text(40)) / planetRadiusForText(text(5));
  assert.ok(ratio > 1.5, `ratio ${ratio}`);
  assert.ok(planetRadiusForText(text(200)) / planetRadiusForText(text(20)) > 1.7);
});

test('이웃과 가까우면 겹치지 않게 줄이고, 멀면 그대로 둔다', () => {
  const big = planetRadiusForText(text(300)); // 0.544
  const positions = [[0, 0, 0], [0.8, 0, 0], [10, 0, 0]];
  const out = capRadiiByNeighbors(positions, [big, big, big]);
  assert.ok(out[0] + out[1] < 0.8, '두 행성이 서로 파고들면 안 된다');
  assert.equal(out[2], big, '멀리 떨어진 행성은 줄이지 않는다');
});

test('줄여도 가장 작은 크기 아래로는 내려가지 않고, 원래보다 커지지 않는다', () => {
  const small = planetRadiusForText('');
  const out = capRadiiByNeighbors([[0, 0, 0], [0.1, 0, 0]], [0.5, small]);
  assert.equal(out[0], PLANET_BASE_RADIUS * PLANET_SCALE_MIN);
  assert.equal(out[1], small);
  assert.deepEqual(capRadiiByNeighbors([[0, 0, 0]], [0.4]), [0.4]);
});
