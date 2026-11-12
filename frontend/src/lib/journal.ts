export type Photo = { id: string; uri: string };
export type Star = {
  id?: string; diaryId?: string; position: number[]; color: string; size: number;
  previewX: string; previewY: string;
};
export type GroupMember = { id: string; name: string; color: string };
export type Group = { id: string; name: string; stars: Star[]; members: GroupMember[] };
export type Diary = { id: string; authorId: string; content: string; photos: Photo[]; groupIds: string[]; createdAt: string };
export const LOCAL_MEMBER: GroupMember = { id: 'local-user', name: 'HA_LULU', color: '#a39bff' };
export type Settings = {
  music: 'space' | 'night' | 'off'; theme: 'original' | 'blue' | 'black';
  backgroundVolume: number; effectVolume: number; rotationSensitivity: number; notifications: boolean;
};
export type Journal = {
  version: 1; stars: Star[]; groups: Group[]; diaries: Diary[];
  draft: { content: string; photos: Photo[]; groupIds: string[] };
  settings: Settings; coins: number; purchases: string[];
};
export const MAX_PHOTOS = 5;
export const initialJournal: Journal = {
  version: 1,
  stars: [
    { position: [-0.838, 1.135, -2], color: '#ff5252', size: 0.32, previewX: '32%', previewY: '38%' },
    { position: [0.708, 0.540, -1], color: '#536dfe', size: 0.27, previewX: '66%', previewY: '43%' },
    { position: [0.907, -0.211, -1.5], color: '#7a80ff', size: 0.29, previewX: '70%', previewY: '52%' },
    { position: [-0.859, -0.692, -1], color: '#ffd740', size: 0.27, previewX: '30%', previewY: '57%' },
    { position: [-0.367, 0.101, -3], color: '#ffffff', size: 0.38, previewX: '43%', previewY: '49%' },
  ],
  groups: [
    {
      id: 'group-1',
      name: '그룹1',
      members: [{ ...LOCAL_MEMBER }],
      stars: [
        { position: [-0.3, 0.8, -2], color: '#ffffff', size: 0.38, previewX: '42%', previewY: '22%' },
        { position: [1.2, 0.3, -1.5], color: '#536dfe', size: 0.38, previewX: '78%', previewY: '38%' },
        { position: [-0.9, -0.6, -1.5], color: '#ffd740', size: 0.38, previewX: '28%', previewY: '68%' },
      ],
    },
    {
      id: 'group-2',
      name: '그룹2',
      members: [{ ...LOCAL_MEMBER }],
      stars: [
        { position: [-0.8, 0.9, -2], color: '#ff5252', size: 0.36, previewX: '31%', previewY: '15%' },
        { position: [1.1, 0.3, -1.5], color: '#536dfe', size: 0.36, previewX: '69%', previewY: '42%' },
        { position: [-0.2, -0.5, -2.5], color: '#ffffff', size: 0.4, previewX: '42%', previewY: '68%' },
        { position: [1.3, -0.9, -1.5], color: '#536dfe', size: 0.34, previewX: '74%', previewY: '82%' },
      ],
    },
  ],
  diaries: [], draft: { content: '', photos: [], groupIds: [] },
  settings: { music: 'space', theme: 'original', backgroundVolume: 60, effectVolume: 40, rotationSensitivity: 100, notifications: false },
  coins: 999, purchases: [],
};

export function localDateKey(date: Date | string): string {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function rotationDelta(distance: number, sensitivity: number): number {
  return distance * 0.01 * sensitivity / 100;
}

export function selectDiaryAudience(state: Journal, groupId: string | null): Journal {
  if (groupId !== null && !state.groups.some((group) => group.id === groupId)) return state;
  const selected = state.draft.groupIds;
  const groupIds = groupId === null ? [] : selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId];
  return { ...state, draft: { ...state.draft, groupIds } };
}

export function createGroup(state: Journal, name: string, now = new Date()): Journal {
  const finalName = name.trim() || `그룹${state.groups.length + 1}`;
  if (finalName.length > 24) throw new Error('그룹 이름은 24자 이내로 입력해주세요.');
  const id = `group-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  return { ...state, groups: [...state.groups, { id, name: finalName, stars: [], members: [{ ...LOCAL_MEMBER }] }] };
}

export function getGroupAttendance(group: Group, diaries: Diary[], dateKey: string) {
  const writers = new Set(diaries.filter((diary) => diary.groupIds.includes(group.id)
    && localDateKey(diary.createdAt) === dateKey).map((diary) => diary.authorId));
  return group.members.map((member) => ({ ...member, completed: writers.has(member.id) }));
}

export function addDiary(state: Journal, now = new Date(), random = Math.random): Journal {
  const content = state.draft.content.trim();
  if (!content) throw new Error('오늘의 이야기를 입력해주세요.');
  if (state.draft.photos.length > MAX_PHOTOS) throw new Error('사진은 최대 5장까지 첨부할 수 있어요.');
  const id = `diary-${now.getTime()}-${random().toString(36).slice(2, 8)}`;
  const colors = ['#ff5252', '#536dfe', '#ffd740', '#ff9ff3', '#1dd1a1', '#ffffff'];
  const groupIds = state.draft.groupIds.filter((id) => state.groups.some((group) => group.id === id));
  const diary: Diary = { id, authorId: LOCAL_MEMBER.id, content, photos: [...state.draft.photos], groupIds, createdAt: now.toISOString() };
  const star: Star = {
    id, diaryId: id, color: colors[Math.floor(random() * colors.length)], size: 0.36,
    position: [(random() - 0.5) * 3, (random() - 0.5) * 3, -1 - random() * 2.5],
    previewX: `${Math.floor(20 + random() * 60)}%`, previewY: `${Math.floor(20 + random() * 60)}%`,
  };
  return {
    ...state, diaries: [diary, ...state.diaries], stars: [...state.stars, star],
    coins: state.coins + (state.diaries.some((entry) => entry.authorId === LOCAL_MEMBER.id && localDateKey(entry.createdAt) === localDateKey(now)) ? 0 : 5),
    groups: state.groups.map((group) => groupIds.includes(group.id) ? { ...group, stars: [...group.stars, star] } : group),
    draft: { content: '', photos: [], groupIds: [] },
  };
}

export function searchDiaries(diaries: Diary[], query: string, date = ''): Diary[] {
  const needle = query.trim().toLocaleLowerCase();
  return diaries.filter((diary) => diary.content.toLocaleLowerCase().includes(needle) && (!date || localDateKey(diary.createdAt) === date));
}

export function purchaseItem(state: Journal, id: string): Journal {
  const prices: Record<string, number> = { prism: 30, blue: 50, comet: 30, black: 50 };
  const price = prices[id];
  if (price === undefined) throw new Error('존재하지 않는 상품이에요.');
  if (state.purchases.includes(id)) {
    return ['blue', 'black'].includes(id) ? { ...state, settings: { ...state.settings, theme: id as 'blue' | 'black' } } : state;
  }
  if (state.coins < price) throw new Error('보유한 코인이 부족해요.');
  return { ...state, coins: state.coins - price, purchases: [...state.purchases, id],
    settings: ['blue', 'black'].includes(id) ? { ...state.settings, theme: id as 'blue' | 'black' } : state.settings };
}

export function parseJournal(raw: string): Journal {
  const value = JSON.parse(raw);
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
  const strings = (item: unknown): item is string[] => Array.isArray(item) && item.every((entry) => typeof entry === 'string');
  const photos = (item: unknown) => Array.isArray(item) && item.length <= MAX_PHOTOS && item.every((entry) => record(entry) && typeof entry.id === 'string' && typeof entry.uri === 'string');
  const stars = (item: unknown) => Array.isArray(item) && item.every((entry) => record(entry)
    && Array.isArray(entry.position) && entry.position.length === 3 && entry.position.every(Number.isFinite)
    && typeof entry.color === 'string' && typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size > 0
    && typeof entry.previewX === 'string' && typeof entry.previewY === 'string');
  const volume = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 100;
  if (!record(value) || value.version !== 1 || !stars(value.stars)
      || !Array.isArray(value.groups) || !value.groups.every((group) => record(group) && typeof group.id === 'string' && typeof group.name === 'string' && stars(group.stars))
      || !Array.isArray(value.diaries) || !value.diaries.every((entry) => record(entry) && typeof entry.id === 'string' && typeof entry.content === 'string'
        && photos(entry.photos) && strings(entry.groupIds) && typeof entry.createdAt === 'string' && Number.isFinite(new Date(entry.createdAt).getTime()))
      || !record(value.draft) || typeof value.draft.content !== 'string' || !photos(value.draft.photos)
      || !strings(value.draft.groupIds) || !record(value.settings) || !strings(value.purchases)
      || typeof value.coins !== 'number' || !Number.isFinite(value.coins) || value.coins < 0) throw new Error('저장된 데이터 형식을 확인할 수 없어요.');
  const settings = { ...initialJournal.settings, ...value.settings };
  if (!['space', 'night', 'off'].includes(settings.music) || !['original', 'blue', 'black'].includes(settings.theme)
      || !volume(settings.backgroundVolume) || !volume(settings.effectVolume)
      || typeof settings.rotationSensitivity !== 'number' || !Number.isFinite(settings.rotationSensitivity)
      || settings.rotationSensitivity < 25 || settings.rotationSensitivity > 200 || typeof settings.notifications !== 'boolean') {
    throw new Error('저장된 설정 형식을 확인할 수 없어요.');
  }
  const groups = value.groups.map((group) => {
    const members = group.members ?? [{ ...LOCAL_MEMBER }];
    if (!Array.isArray(members) || !members.every((member) => record(member) && typeof member.id === 'string'
      && typeof member.name === 'string' && typeof member.color === 'string')
      || new Set(members.map((member) => member.id)).size !== members.length) throw new Error('저장된 그룹 멤버 형식을 확인할 수 없어요.');
    return { ...group, members };
  });
  const diaries = value.diaries.map((diary) => {
    const authorId = diary.authorId ?? LOCAL_MEMBER.id;
    if (typeof authorId !== 'string') throw new Error('저장된 일기 작성자 형식을 확인할 수 없어요.');
    return { ...diary, authorId };
  });
  return { ...value, groups, diaries, settings } as Journal;
}
