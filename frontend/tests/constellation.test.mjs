// [ADDED 2026-11-12] 별자리 시스템(src/lib/constellation.ts) 확인. 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTELLATION_CONFIG,
  CONSTELLATION_TEMPLATES,
  CONSTELLATION_TOPICS,
  TOPIC_CONCEPTS,
  allTopicStatus,
  drawableConnections,
  findTemplate,
  layoutConstellation,
  selectMembers,
  showDuration,
  topicCounts,
  topicStatus,
} from '../src/lib/constellation.ts';
import { DIARY_TOPICS } from '../src/lib/special-planet.ts';

const ALL = CONSTELLATION_TOPICS.flatMap((t) => CONSTELLATION_TEMPLATES[t]);

// ---------------------------------------------------------------- 주제·템플릿 구성
test('uses exactly the existing diary topic ids (no new topic values)', () => {
  assert.deepEqual([...CONSTELLATION_TOPICS].sort(), DIARY_TOPICS.map((t) => t.id).sort());
  for (const t of DIARY_TOPICS) assert.equal(TOPIC_CONCEPTS[t.id].label, t.label);
});

test('every topic has levels 1·2·3 with point count == unlock threshold', () => {
  for (const topic of CONSTELLATION_TOPICS) {
    const list = CONSTELLATION_TEMPLATES[topic];
    assert.deepEqual(list.map((t) => t.level), [1, 2, 3], topic);
    for (const t of list) {
      assert.equal(t.topic, topic);
      assert.equal(t.requiredPlanets, CONSTELLATION_CONFIG.thresholds[t.level], t.id);
      assert.equal(t.points.length, t.requiredPlanets, `${t.id} points`);
      assert.ok(t.name && t.shape && t.description, t.id);
    }
  }
  assert.equal(new Set(ALL.map((t) => t.id)).size, 18);
  assert.equal(findTemplate('travel_airplane')?.shape, '비행기');
  assert.equal(findTemplate('nope'), null);
});

// ---------------------------------------------------------------- 템플릿 모양 규칙
function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}
function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}
function pointSegDist(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

test('templates: normalized, valid connections, no isolated planets, within line limit', () => {
  for (const t of ALL) {
    for (const p of t.points) {
      assert.ok(Math.abs(p[0]) <= 1.0001 && Math.abs(p[1]) <= 1.0001, `${t.id} not normalized`);
    }
    const lines = drawableConnections(t);
    assert.equal(lines.length, t.connections.length, `${t.id} has duplicate/invalid connections`);
    assert.ok(lines.length <= CONSTELLATION_CONFIG.maxLines);
    const used = new Set(lines.flat());
    for (let i = 0; i < t.points.length; i++) assert.ok(used.has(i), `${t.id} point ${i} isolated`);
  }
});

test('templates: planets do not crowd each other (min distance)', () => {
  for (const t of ALL) {
    let min = Infinity;
    for (let i = 0; i < t.points.length; i++) {
      for (let j = i + 1; j < t.points.length; j++) {
        min = Math.min(min, Math.hypot(t.points[i][0] - t.points[j][0], t.points[i][1] - t.points[j][1]));
      }
    }
    assert.ok(min >= 0.18, `${t.id} min distance ${min.toFixed(3)}`);
  }
});

test('templates: lines do not cross (except the pentagram) and do not pass through other planets', () => {
  for (const t of ALL) {
    const lines = drawableConnections(t);
    const P = t.points;
    if (!t.allowCrossings) {
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          const [i, j] = lines[a];
          const [k, l] = lines[b];
          if (new Set([i, j, k, l]).size < 4) continue;
          assert.ok(!segmentsCross(P[i], P[j], P[k], P[l]), `${t.id} lines ${i}-${j} × ${k}-${l} cross`);
        }
      }
    }
    for (const [i, j] of lines) {
      for (let k = 0; k < P.length; k++) {
        if (k === i || k === j) continue;
        assert.ok(pointSegDist(P[k], P[i], P[j]) > 0.07, `${t.id} line ${i}-${j} runs through planet ${k}`);
      }
    }
  }
});

// ---------------------------------------------------------------- 해금 (요구사항 13 표)
const travel = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, createdAt: i, topic: 'travel' }));
const unlockedLevels = (n) => topicStatus('travel', n).levels.filter((l) => l.unlocked).map((l) => l.template.level);

test('unlock table: 4→none, 5→L1, 9→L1, 10→L1·L2, 20→all, 25→all (previous levels kept)', () => {
  assert.deepEqual(unlockedLevels(4), []);
  assert.equal(topicStatus('travel', 4).highest, null);
  assert.equal(topicStatus('travel', 4).next.remaining, 1);
  assert.deepEqual(unlockedLevels(5), [1]);
  assert.deepEqual(unlockedLevels(9), [1]);
  assert.equal(topicStatus('travel', 9).next.remaining, 1);
  assert.deepEqual(unlockedLevels(10), [1, 2]);
  assert.deepEqual(unlockedLevels(20), [1, 2, 3]);
  const s25 = topicStatus('travel', 25);
  assert.deepEqual(unlockedLevels(25), [1, 2, 3]);
  assert.equal(s25.highest.level, 3, 'default = highest level');
  assert.equal(s25.next, null);
  const s12 = topicStatus('travel', 12);
  assert.equal(s12.highest.id, 'travel_airplane');
  assert.equal(s12.next.remaining, 8, '"다음 단계까지 8개"');
  assert.equal(s12.title, '여행의 기억');
});

test('diaries without a topic are never counted or auto-assigned', () => {
  const entries = [...travel(5), { id: 'x', createdAt: 9, topic: null }, { id: 'y', createdAt: 10 }];
  const counts = topicCounts(entries);
  assert.equal(counts.travel, 5);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 5);
  const status = allTopicStatus(entries);
  assert.equal(status.length, 6);
  assert.deepEqual(status.filter((s) => s.highest).map((s) => s.topic), ['travel']);
});

// ---------------------------------------------------------------- 행성 고르기
test('member selection: oldest first, id tiebreak, deterministic, only that topic, extras untouched', () => {
  const entries = [
    { id: 'b', createdAt: 100, topic: 'travel' },
    { id: 'a', createdAt: 100, topic: 'travel' },
    { id: 'z', createdAt: 1, topic: 'relationship' },
    { id: 'c', createdAt: 50, topic: 'travel' },
    { id: 'n', createdAt: 0, topic: null },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, createdAt: 200 + i, topic: 'travel' })),
  ];
  const picked = selectMembers(entries, 'travel', 10).map((e) => e.id);
  assert.deepEqual(picked.slice(0, 3), ['c', 'a', 'b']);
  assert.equal(picked.length, 10);
  assert.deepEqual(selectMembers([...entries].reverse(), 'travel', 10).map((e) => e.id), picked);
  assert.ok(!picked.includes('z') && !picked.includes('n'));
  assert.equal(entries[0].id, 'b', 'input array is not reordered');
});

// ---------------------------------------------------------------- 배치
const PHONE = { aspect: 393 / 852, fovDeg: 50, insetTop: 0.2, insetBottom: 0.35, insetLeft: 0.04, insetRight: 0.04 };

test('layout keeps every planet pair apart even with mixed planet sizes', () => {
  for (const t of ALL) {
    const radii = t.points.map((_, i) => (i % 3 === 0 ? 0.39 : 0.24)); // 최대·최소 크기 섞기
    const { targets } = layoutConstellation(t, radii, PHONE);
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const d = Math.hypot(targets[i][0] - targets[j][0], targets[i][1] - targets[j][1]);
        assert.ok(d >= (radii[i] + radii[j]) * CONSTELLATION_CONFIG.spacing - 1e-6, `${t.id} ${i}-${j} overlap`);
      }
    }
  }
});

test('layout preserves the template shape (uniform scale) and fits the free screen area', () => {
  const t = findTemplate('travel_airplane');
  const radii = t.points.map(() => 0.3);
  const { targets, scale, cameraDistance } = layoutConstellation(t, radii, PHONE, 2);
  // 같은 배율: 두 점 사이 거리 비율이 템플릿과 같다
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  assert.ok(Math.abs(d(targets[0], targets[9]) / d(t.points[0], t.points[9]) - scale) < 1e-9);
  assert.ok(targets.every((p) => p[2] === 2), 'all planets on the constellation plane');
  // 화면 안: 각 행성이 위·아래 UI를 뺀 영역 안에 들어온다
  const tanV = Math.tan((25 * Math.PI) / 180);
  for (const [x, y] of targets) {
    const ndcY = y / (cameraDistance * tanV);
    const ndcX = x / (cameraDistance * tanV * PHONE.aspect);
    assert.ok(ndcY < 1 - 2 * PHONE.insetTop + 1e-9 && ndcY > -1 + 2 * PHONE.insetBottom - 1e-9, `y ${ndcY}`);
    assert.ok(Math.abs(ndcX) < 1, `x ${ndcX}`);
  }
});

test('wide screen: a left-docked panel shifts the constellation into the free right area', () => {
  const view = { aspect: 1280 / 760, fovDeg: 50, insetTop: 0.2, insetBottom: 0.15, insetLeft: 0.4, insetRight: 0.03 };
  const t = findTemplate('rest_daily_tree');
  const { targets, cameraDistance } = layoutConstellation(t, t.points.map(() => 0.3), view);
  const tanV = Math.tan((25 * Math.PI) / 180);
  for (const [x] of targets) {
    const ndcX = x / (cameraDistance * tanV * view.aspect);
    assert.ok(ndcX > -1 + 2 * view.insetLeft - 1e-9 && ndcX < 1 - 2 * view.insetRight + 1e-9, `x ${ndcX}`);
  }
});

test('total show animation stays within about 2–3.5 seconds', () => {
  for (const t of ALL) {
    const s = showDuration(t);
    assert.ok(s >= 1.8 && s <= 3.6, `${t.id} ${s.toFixed(2)}s`);
  }
});
