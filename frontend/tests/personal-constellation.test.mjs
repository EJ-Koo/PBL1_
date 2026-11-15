// [ADDED 2026-11-15] Level 4 나만의 별자리(서버 LLM 생성 결과 → 기존 별자리 렌더러) 확인. 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTELLATION_CONFIG,
  PERSONAL_STAGES,
  drawableConnections,
  layoutConstellation,
  personalStageIndex,
  personalStatus,
  personalTemplate,
  personalTemplateId,
  selectPersonalMembers,
  showDuration,
  topicStatus,
} from '../src/lib/constellation.ts';

// 서버가 저장하는 모양과 같은 값(정규화 좌표 30개, 연결선)
const ring = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * Math.PI * 2;
  return [Math.round(Math.cos(a) * 1000) / 1000, Math.round(Math.sin(a) * 800) / 1000, 0];
});
const READY = {
  topic: 'travel',
  status: 'ready',
  stage: 'done',
  name: '푸른 고래 별자리',
  concept: 'whale',
  shape_label: '고래',
  description: '바다 기록',
  reason: '바다가 반복',
  keywords: ['바다'],
  analysis: {},
  points: ring,
  connections: ring.map((_, i) => [i, (i + 1) % 30]),
  planet_ids: Array.from({ length: 30 }, (_, i) => `d${String(i).padStart(2, '0')}`),
  required_planets: 30,
  source_diary_count: 30,
  shape_source: 'llm',
  created_at: null,
  completed_at: null,
  attempts_left: 2,
  error_code: null,
  error_message: null,
};
const entries = (n, topic = 'travel', start = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `d${String(start + i).padStart(2, '0')}`, createdAt: 1000 + start + i, topic }));

test('Level 4 threshold is 30 and levels 1~3 are unchanged', () => {
  assert.deepEqual({ ...CONSTELLATION_CONFIG.thresholds }, { 1: 5, 2: 10, 3: 20, 4: 30 });
  const s = topicStatus('travel', 40);
  assert.deepEqual(s.levels.map((l) => l.template.level), [1, 2, 3]);
  assert.ok(s.levels.every((l) => l.unlocked), '30개 이상이어도 Level 1~3 은 계속 고를 수 있다');
});

test('card state: 29 locked, 30 available, pending, ready, failed, exhausted, short', () => {
  assert.equal(personalStatus(29, null).state, 'locked');
  assert.equal(personalStatus(29, null).remaining, 1);
  assert.equal(personalStatus(24, null).remaining, 6);
  assert.equal(personalStatus(30, null).state, 'available');
  assert.equal(personalStatus(30, { ...READY, status: 'pending', points: null, connections: null }).state, 'pending');
  assert.equal(personalStatus(30, READY).state, 'ready');
  assert.equal(personalStatus(40, READY).state, 'ready', '40개가 되어도 같은 별자리');
  assert.equal(personalStatus(28, READY).state, 'short', '일기를 지워 30개 미만이면 보이지 않음');
  assert.equal(personalStatus(30, { ...READY, status: 'failed', attempts_left: 1 }).state, 'failed');
  assert.equal(personalStatus(30, { ...READY, status: 'failed', attempts_left: 0 }).state, 'exhausted');
  assert.equal(personalStatus(10, { ...READY, status: 'failed', attempts_left: 1 }).state, 'locked');
});

test('server result becomes a normal template for the existing renderer', () => {
  const t = personalTemplate(READY);
  assert.equal(t.id, personalTemplateId('travel'));
  assert.equal(t.level, 4);
  assert.equal(t.requiredPlanets, 30);
  assert.equal(t.points.length, 30);
  assert.equal(drawableConnections(t).length, 30);
  assert.ok(showDuration(t) < 5, '보이기 애니메이션 시간도 기존 범위');
  const radii = Array(30).fill(0.6);
  const lay = layoutConstellation(t, radii, { aspect: 0.5, fovDeg: 60, insetTop: 0.2, insetBottom: 0.35, insetLeft: 0, insetRight: 0 });
  assert.equal(lay.targets.length, 30);
  for (let i = 0; i < 30; i++)
    for (let j = i + 1; j < 30; j++) {
      const d = Math.hypot(lay.targets[i][0] - lay.targets[j][0], lay.targets[i][1] - lay.targets[j][1]);
      assert.ok(d >= 1.2 * CONSTELLATION_CONFIG.spacing - 1e-6, '행성이 겹치지 않는다');
    }
});

test('broken server data is not drawn', () => {
  assert.equal(personalTemplate({ ...READY, status: 'pending' }), null);
  assert.equal(personalTemplate({ ...READY, points: ring.slice(0, 29) }), null);
  assert.equal(personalTemplate({ ...READY, points: [[NaN, 0, 0], ...ring.slice(1)] }), null);
  assert.equal(personalTemplate({ ...READY, connections: [[0, 99], [3, 3]] }), null);
  const t = personalTemplate({ ...READY, connections: [[0, 1], [0, 99], [2, 'x']] });
  assert.deepEqual(t.connections, [[0, 1]]);
});

test('members follow saved planet order; deleted diary slots are refilled by the next oldest', () => {
  const list = [...entries(32), ...entries(5, 'relationship', 50), { id: 'zz', createdAt: 1, topic: null }];
  const saved = selectPersonalMembers(list, 'travel', READY.planet_ids, 30);
  assert.deepEqual(saved.map((e) => e.id), READY.planet_ids);
  // d05 를 지우면 그 자리만 다음으로 오래된 d30 이 채운다(다른 행성 자리는 그대로)
  const after = selectPersonalMembers(list.filter((e) => e.id !== 'd05'), 'travel', READY.planet_ids, 30);
  assert.equal(after[5].id, 'd30');
  assert.deepEqual(after.filter((_, i) => i !== 5).map((e) => e.id), READY.planet_ids.filter((_, i) => i !== 5));
  // 다른 주제·주제 없는 일기는 들어가지 않는다
  assert.ok(after.every((e) => e.topic === 'travel'));
  // 모자라면 짧은 배열(화면에서 그리지 않음)
  assert.equal(selectPersonalMembers(entries(29), 'travel', READY.planet_ids, 30).length, 29);
});

test('progress stages follow the server order', () => {
  assert.deepEqual(PERSONAL_STAGES.map((s) => s.label), ['기억 분석 중', '별자리 모양 생성 중', '별자리 완성 중']);
  assert.equal(personalStageIndex('queued'), -1);
  assert.equal(personalStageIndex('analyzing'), 0);
  assert.equal(personalStageIndex('validating'), 2);
  assert.equal(personalStageIndex('done'), 3);
});
