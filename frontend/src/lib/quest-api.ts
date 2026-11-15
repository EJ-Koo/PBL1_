import { API_BASE_URL } from './api-config';
import { apiFetch } from './auth-session';

export type DailyQuest = {
  quest_id: 'daily_diary'; day: string; cycle: number; completed: boolean;
  progress: 0 | 1; target: 1; reward: 5; awarded: 0 | 5; coins: number;
  reset_allowed: boolean; after_reset: boolean; next_reset_at: string;
};

async function request(token: string, action: 'sync' | 'reset'): Promise<DailyQuest> {
  const response = await apiFetch(`${API_BASE_URL}/me/quests/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const message = response.status === 404 ? '퀘스트 서버가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.'
      : typeof data?.detail === 'string' ? data.detail : '퀘스트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return data;
}
export const apiSyncQuest = (token: string) => request(token, 'sync');
export const apiResetQuest = (token: string) => request(token, 'reset');
