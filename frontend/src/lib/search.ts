// 일기 검색 로직 (메뉴 → 일기 검색 화면에서 사용).
// 서버 호출 없이, 로그인할 때 이미 받아 둔 내 일기 목록(useDiary().entries)을 거른다.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSearchHistory, rememberSearch, type RecentSearch, type SearchQuery } from './search-history';

import type { DiaryEntry } from '@/store/diary-context';

// 날짜는 기기 시간(한국에서는 KST) 기준 'YYYY-MM-DD' 문자열로 비교한다.
// 서버의 created_at은 UTC라 그대로 자르면 새벽 0~9시 일기가 전날로 잡히기 때문.
export function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function formatDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// 키워드와 날짜는 둘 다 지정되면 두 조건을 모두 만족하는 일기만 남긴다. 결과는 최신순.
export function searchEntries(
  entries: DiaryEntry[],
  keyword: string,
  dateKey: string | null
): DiaryEntry[] {
  const q = normalize(keyword);
  return entries
    .filter((e) => (q ? e.text.toLowerCase().includes(q) : true))
    .filter((e) => (dateKey ? toDateKey(e.createdAt) === dateKey : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export type Snippet = { before: string; match: string; after: string };

// 결과 목록에 보여줄 본문 일부. 키워드가 있으면 첫 위치를 가운데 두고 앞뒤를 잘라 강조할 수 있게 나눈다.
export function makeSnippet(text: string, keyword: string, radius = 18): Snippet {
  const flat = text.replace(/\s+/g, ' ').trim();
  const q = normalize(keyword);
  const idx = q ? flat.toLowerCase().indexOf(q) : -1;
  if (idx < 0) {
    const cut = flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat;
    return { before: cut, match: '', after: '' };
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(flat.length, idx + q.length + radius);
  return {
    before: `${start > 0 ? '…' : ''}${flat.slice(start, idx)}`,
    match: flat.slice(idx, idx + q.length),
    after: `${flat.slice(idx + q.length, end)}${end < flat.length ? '…' : ''}`,
  };
}

// Keep the storage key so existing keyword history can be migrated in place.
const RECENT_KEY = 'search:recentKeywords';
let recentSearches: RecentSearch[] = [];
let loadingHistory: Promise<RecentSearch[]> | null = null;
let persistence = Promise.resolve();

function persist() {
  const snapshot = JSON.stringify(recentSearches);
  // Serialize writes so a slow earlier save cannot undo a later clear/delete.
  persistence = persistence.then(() => AsyncStorage.setItem(RECENT_KEY, snapshot)).catch(() => {});
}

export function loadRecentSearches(): Promise<RecentSearch[]> {
  if (!loadingHistory) {
    loadingHistory = AsyncStorage.getItem(RECENT_KEY).then(raw => {
      recentSearches = parseSearchHistory(raw ? JSON.parse(raw) : []);
      return recentSearches;
    }).catch(() => { recentSearches = []; return recentSearches; });
  }
  return loadingHistory.then(() => [...recentSearches]);
}
export async function addRecentSearch(query: SearchQuery): Promise<RecentSearch[]> {
  await loadRecentSearches();
  recentSearches = rememberSearch(recentSearches, query);
  persist();
  return [...recentSearches];
}
export async function removeRecentSearch(id: string): Promise<RecentSearch[]> {
  await loadRecentSearches();
  recentSearches = recentSearches.filter(item => item.id !== id);
  persist();
  return [...recentSearches];
}
export async function clearRecentSearches(): Promise<RecentSearch[]> {
  await loadRecentSearches();
  recentSearches = [];
  persist();
  return [];
}
