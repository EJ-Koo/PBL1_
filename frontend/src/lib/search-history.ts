export type SearchQuery = { keyword: string; dateKey: string | null };
export type RecentSearch = SearchQuery & { id: string };
const MAX_RECENT = 10;

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
export function normalizeSearch(query: SearchQuery): RecentSearch | null {
  const keyword = query.keyword.trim();
  const dateKey = validDate(query.dateKey) ? query.dateKey : null;
  if (!keyword && !dateKey) return null;
  return { keyword, dateKey, id: JSON.stringify([keyword.toLowerCase(), dateKey]) };
}
export function rememberSearch(history: RecentSearch[], query: SearchQuery): RecentSearch[] {
  const next = normalizeSearch(query);
  if (!next) return history;
  return [next, ...history.filter(item => item.id !== next.id)].slice(0, MAX_RECENT);
}
// Migrate the previous string-only history without throwing away saved keywords.
export function parseSearchHistory(value: unknown): RecentSearch[] {
  if (!Array.isArray(value)) return [];
  const result: RecentSearch[] = [];
  for (const item of value) {
    const query = typeof item === 'string' ? { keyword: item, dateKey: null }
      : item && typeof item === 'object' && typeof item.keyword === 'string'
        && (item.dateKey === null || validDate(item.dateKey))
        ? { keyword: item.keyword, dateKey: item.dateKey } : null;
    const entry = query ? normalizeSearch(query) : null;
    if (entry && !result.some(saved => saved.id === entry.id)) result.push(entry);
    if (result.length === MAX_RECENT) break;
  }
  return result;
}
export function recentSearchLabel(query: SearchQuery): string {
  const date = query.dateKey?.replaceAll('-', '.');
  return query.keyword && date ? `${query.keyword} & ${date}` : query.keyword || date || '';
}
