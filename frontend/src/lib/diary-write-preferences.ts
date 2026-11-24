import type { DiaryTopic } from './special-planet';
export type DiaryWritePreferences = { enabled: boolean; topic: DiaryTopic; groupIds: string[] };
const topics = ['travel', 'relationship', 'study_achievement', 'rest_daily', 'challenge_activity', 'other'];
export const diaryWritePreferencesKey = (owner: string) => `star2day:diary-write-preferences:v1:${owner}`;
export function parseDiaryWritePreferences(raw: string | null): DiaryWritePreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    return { enabled: value?.enabled === true, topic: topics.includes(value?.topic) ? value.topic : 'other',
      groupIds: Array.isArray(value?.groupIds) ? [...new Set(value.groupIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0))] as string[] : [] };
  } catch { return { enabled: false, topic: 'other', groupIds: [] }; }
}
export function availableDiaryGroups(selected: readonly string[], available: readonly string[]): string[] {
  const ids = new Set(available);
  return [...new Set(selected)].filter(id => ids.has(id));
}
