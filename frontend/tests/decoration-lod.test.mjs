// [2026-11-22] 꾸민 행성 단계(src/lib/decoration-lod.ts). 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { decorationTiers, detailIds } from '../src/lib/decoration-lod.ts';
import { SPECIAL_EFFECT_SETTINGS } from '../src/lib/special-planet.ts';
import { SURFACE_STYLE_SETTINGS } from '../src/lib/surface-style.ts';

const ranked = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, d: 2 + i }));
const base = { maxFull: 24, maxNear: 6, nearDistance: 9 };
const count = (m, t) => [...m.values()].filter((v) => v === t).length;

test('기본값: 효과·표면 모두 미리보기와 같은 최고 단계로 그린다', () => {
  assert.equal(SPECIAL_EFFECT_SETTINGS.matchPreview, true);
  assert.equal(SURFACE_STYLE_SETTINGS.matchPreview, true);
  for (const q of ['low', 'medium', 'high']) {
    assert.ok(SPECIAL_EFFECT_SETTINGS.maxFull[q] >= SPECIAL_EFFECT_SETTINGS.maxNear[q]);
    assert.ok(SURFACE_STYLE_SETTINGS.maxFull[q] >= SURFACE_STYLE_SETTINGS.maxNear[q]);
  }
});

test('미리보기와 같게: 거리와 상관없이 최고 단계(2), 상한을 넘으면 가까이(1)', () => {
  const t = decorationTiers(ranked(10), { ...base, matchPreview: true });
  assert.equal(count(t, 2), 10); // 멀리 있는 행성(d=11)까지 모두
  const many = decorationTiers(ranked(30), { ...base, matchPreview: true });
  assert.equal(count(many, 2), 24);
  assert.equal(count(many, 1), 6);
  assert.equal(many.get('p0'), 2); // 가까운 순서로 상한까지
  assert.equal(many.get('p29'), 1);
});

test('별자리: 어둡게 한 행성·전환 중에는 0(기존 규칙 우선)', () => {
  const dimmed = decorationTiers(ranked(5), { ...base, matchPreview: true, dimmed: new Set(['p1', 'p3']) });
  assert.deepEqual([...dimmed.values()], [2, 0, 2, 0, 2]);
  const moving = decorationTiers(ranked(5), { ...base, matchPreview: true, moving: true });
  assert.equal(count(moving, 0), 5);
});

test('matchPreview=false 면 예전 거리별 규칙(가까운 6개·거리 9 안만 1)', () => {
  const t = decorationTiers(ranked(12), { ...base, matchPreview: false });
  assert.equal(count(t, 1), 6);
  assert.equal(count(t, 2), 0);
  assert.equal(t.get('p11'), 0);
});

// [2026-11-25] 전체 우주 vs 상세: 추가 장식(별가루·잔해·잔상)은 확대해서 가까이 본 행성에만
test('상세 장식: 가까운 순서로 거리 안·상한까지만, 멀리 있는 행성은 간소화', () => {
  const D = SPECIAL_EFFECT_SETTINGS.detail;
  assert.ok(D.max.low <= D.max.medium && D.max.medium <= D.max.high, '휴대폰(저품질)일수록 적게');
  const r = ranked(10); // 거리 2, 3, 4, …
  assert.deepEqual([...detailIds(r, { maxDetail: 4, detailDistance: 4.5 })], ['p0', 'p1', 'p2']);
  assert.deepEqual([...detailIds(r, { maxDetail: 2, detailDistance: 100 })], ['p0', 'p1']);
  // 전체 우주(카메라가 멀리): 아무 행성도 상세 장식 없음
  assert.equal(detailIds(r.map((x) => ({ ...x, d: x.d + 20 })), { maxDetail: 6, detailDistance: D.distance }).size, 0);
});

test('상세 장식: 별자리 전환 중·별자리 밖(어둡게 한) 행성은 끈다', () => {
  const r = ranked(5);
  assert.equal(detailIds(r, { maxDetail: 5, detailDistance: 100, moving: true }).size, 0);
  const out = detailIds(r, { maxDetail: 5, detailDistance: 100, dimmed: new Set(['p0', 'p2']) });
  assert.deepEqual([...out], ['p1', 'p3', 'p4']);
});
