import test from 'node:test';
import assert from 'node:assert/strict';
import { addDiary, createGroup, getGroupAttendance, initialJournal, LOCAL_MEMBER, localDateKey, parseJournal, purchaseItem, rotationDelta, searchDiaries, selectDiaryAudience } from '../src/lib/journal.ts';

const fresh = () => structuredClone(initialJournal);

test('saving a diary keeps text and photos, adds one personal star, and shares only to selected groups', () => {
  const state = fresh();
  state.draft = { content: '  오늘은 좋은 하루  ', photos: [{ id: 'photo-1', uri: 'file:///saved/photo.jpg' }], groupIds: ['group-1'] };
  const result = addDiary(state, new Date('2026-11-05T10:00:00Z'), () => 0.5);
  assert.equal(result.diaries[0].content, '오늘은 좋은 하루');
  assert.deepEqual(result.diaries[0].photos, state.draft.photos);
  assert.equal(result.stars.length, state.stars.length + 1);
  assert.equal(result.stars.at(-1)?.diaryId, result.diaries[0].id);
  assert.equal(result.groups[0].stars.length, state.groups[0].stars.length + 1);
  assert.equal(result.groups[1].stars.length, state.groups[1].stars.length);
  assert.deepEqual(result.draft, { content: '', photos: [], groupIds: [] });
  assert.equal(state.diaries.length, 0);
  assert.equal(state.draft.content, '  오늘은 좋은 하루  ');
});

test('private diary adds no group star and ignores removed group IDs', () => {
  const state = fresh();
  state.draft.content = '나만의 일기';
  state.draft.groupIds = ['deleted-group'];
  const result = addDiary(state);
  assert.deepEqual(result.groups, state.groups);
  assert.deepEqual(result.diaries[0].groupIds, []);
});

test('empty diary and more than five photos cannot create a star or clear the draft', () => {
  const state = fresh();
  state.draft.content = '   ';
  assert.throws(() => addDiary(state), /입력/);
  assert.equal(state.stars.length, initialJournal.stars.length);
  state.draft.content = '여섯 장';
  state.draft.photos = Array.from({ length: 6 }, (_, i) => ({ id: String(i), uri: 'file:///photo.jpg' }));
  assert.throws(() => addDiary(state), /최대 5장/);
  assert.equal(state.draft.photos.length, 6);
});

test('today quest awards five coins only once per local calendar day', () => {
  let state = fresh();
  const day = new Date(2026, 10, 5, 12);
  state.draft.content = '첫 번째';
  state = addDiary(state, day);
  assert.equal(state.coins, initialJournal.coins + 5);
  state.draft.content = '두 번째';
  state = addDiary(state, new Date(2026, 10, 5, 13));
  assert.equal(state.coins, initialJournal.coins + 5);
  state.draft.content = '다음 날';
  state = addDiary(state, new Date(2026, 10, 6, 12));
  assert.equal(state.coins, initialJournal.coins + 10);
});

test('search matches text case-insensitively and filters by local date', () => {
  const state = fresh(); state.draft.content = 'My Star 행복';
  const result = addDiary(state, new Date(2026, 10, 5, 23, 59));
  assert.equal(searchDiaries(result.diaries, ' STAR ', '2026-11-05').length, 1);
  assert.equal(searchDiaries(result.diaries, '행복', '2026-11-06').length, 0);
  assert.equal(localDateKey(new Date(2026, 10, 5, 0, 1)), '2026-11-05');
});

test('purchased items charge once and owned backgrounds can be applied again', () => {
  let state = purchaseItem(fresh(), 'blue');
  assert.equal(state.coins, initialJournal.coins - 50);
  assert.equal(state.settings.theme, 'blue');
  state = purchaseItem(state, 'black');
  const balance = state.coins;
  state = purchaseItem(state, 'blue');
  assert.equal(state.coins, balance);
  assert.equal(state.settings.theme, 'blue');
  state = purchaseItem(state, 'comet');
  const bought = state.coins;
  assert.equal(purchaseItem(state, 'comet').coins, bought);
  assert.throws(() => purchaseItem({ ...state, coins: 0 }, 'prism'), /부족/);
  assert.throws(() => purchaseItem(state, 'unknown'), /존재/);
});

test('stored diary photos, settings, groups and draft survive JSON round trip', () => {
  const state = fresh();
  state.draft.content = '아직 쓰는 중';
  state.draft.photos = [{ id: 'photo', uri: 'data:image/jpeg;base64,abc' }];
  state.settings.backgroundVolume = 0;
  state.settings.notifications = true;
  assert.deepEqual(parseJournal(JSON.stringify(state)), state);
  assert.throws(() => parseJournal('{invalid'));
  assert.throws(() => parseJournal('{"version":1}'));
});

test('invalid nested stored values cannot crash the universe or audio player on startup', () => {
  for (const corrupt of [
    (state) => { state.stars[0].position = null; },
    (state) => { state.groups.push(null); },
    (state) => { state.draft.photos.push({ id: 'bad' }); },
    (state) => { state.settings.music = 'missing-track'; },
    (state) => { state.settings.backgroundVolume = 200; },
  ]) {
    const state = fresh(); corrupt(state);
    assert.throws(() => parseJournal(JSON.stringify(state)), /형식/);
  }
});

test('old saved settings get the original rotation speed without losing diary data', () => {
  const state = fresh();
  state.draft.content = '보존할 일기';
  state.settings.backgroundVolume = 35;
  delete state.settings.rotationSensitivity;
  const restored = parseJournal(JSON.stringify(state));
  assert.equal(restored.settings.rotationSensitivity, 100);
  assert.equal(restored.settings.backgroundVolume, 35);
  assert.equal(restored.draft.content, '보존할 일기');
});

test('rotation sensitivity scales both positive and negative drag movement and survives restart', () => {
  assert.equal(rotationDelta(100, 100), 1);
  assert.equal(rotationDelta(100, 25), 0.25);
  assert.equal(rotationDelta(-100, 200), -2);
  const state = fresh(); state.settings.rotationSensitivity = 175;
  assert.equal(parseJournal(JSON.stringify(state)).settings.rotationSensitivity, 175);
  for (const sensitivity of [0, 24, 201, '100', null]) {
    state.settings.rotationSensitivity = sensitivity;
    assert.throws(() => parseJournal(JSON.stringify(state)), /설정 형식/);
  }
});

test('a newly created group appears in diary audience choices and receives the shared star', () => {
  let state = createGroup(fresh(), '  우리의 별일  ');
  const group = state.groups.at(-1);
  assert.equal(group.name, '우리의 별일');
  assert.deepEqual(group.members, [LOCAL_MEMBER]);
  state.draft.content = '새 우주에 공유할 일기';
  state = selectDiaryAudience(state, group.id);
  assert.deepEqual(state.draft.groupIds, [group.id]);
  const saved = addDiary(state);
  assert.equal(saved.groups.at(-1).stars.length, 1);
  assert.equal(saved.stars.length, state.stars.length + 1);
  assert.deepEqual(saved.groups.slice(0, -1), state.groups.slice(0, -1));
  const restored = parseJournal(JSON.stringify(saved));
  assert.equal(restored.groups.at(-1).name, '우리의 별일');
  assert.equal(restored.groups.at(-1).stars[0].diaryId, restored.diaries[0].id);
});

test('private pill clears all group selections and creates only a personal star', () => {
  let state = fresh(); state.draft.content = '비밀 일기';
  state = selectDiaryAudience(state, 'group-1');
  state = selectDiaryAudience(state, 'group-2');
  assert.deepEqual(state.draft.groupIds, ['group-1', 'group-2']);
  state = selectDiaryAudience(state, null);
  const saved = addDiary(state);
  assert.deepEqual(saved.diaries[0].groupIds, []);
  assert.deepEqual(saved.groups, state.groups);
  assert.equal(saved.stars.length, state.stars.length + 1);
});

test('audience pills toggle independently; tapping the last selected group restores private mode', () => {
  let state = selectDiaryAudience(fresh(), 'group-1');
  state = selectDiaryAudience(state, 'group-2');
  state = selectDiaryAudience(state, 'group-1');
  assert.deepEqual(state.draft.groupIds, ['group-2']);
  state = selectDiaryAudience(state, 'group-2');
  assert.deepEqual(state.draft.groupIds, []);
  assert.equal(selectDiaryAudience(state, 'missing-group'), state);
});

test('five members show three completed stars when three distinct members shared diaries today', () => {
  const group = structuredClone(initialJournal.groups[0]);
  group.members = Array.from({ length: 5 }, (_, i) => ({ id: `member-${i}`, name: `멤버${i}`, color: '#a39bff' }));
  const createdAt = new Date(2026, 10, 5, 12).toISOString();
  const record = (authorId, groupIds = [group.id], date = createdAt) => ({ id: `${authorId}-${date}`, authorId, groupIds, createdAt: date, content: '일기', photos: [] });
  const diaries = [record('member-0'), record('member-1'), record('member-2'), record('member-0'),
    record('member-3', []), record('member-4', ['another-group']), record('not-a-member')];
  const result = getGroupAttendance(group, diaries, '2026-11-05');
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((member) => member.completed), [true, true, true, false, false]);
  assert.equal(getGroupAttendance(group, diaries, '2026-11-06').filter((member) => member.completed).length, 0);
});

test('old stored groups and diaries gain member and author IDs without losing content', () => {
  let state = fresh(); state.draft.content = '기존 작성 내용';
  state = addDiary(state);
  for (const group of state.groups) delete group.members;
  delete state.diaries[0].authorId;
  const restored = parseJournal(JSON.stringify(state));
  assert.deepEqual(restored.groups[0].members, [LOCAL_MEMBER]);
  assert.equal(restored.diaries[0].authorId, LOCAL_MEMBER.id);
  assert.equal(restored.diaries[0].content, '기존 작성 내용');
});
