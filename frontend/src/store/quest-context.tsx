import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { apiResetQuest, apiSyncQuest, type DailyQuest } from '@/lib/quest-api';
import { latestQuest, subscribeQuest } from '@/lib/quest-events';
import { authSession } from '@/lib/auth-session';
import { useDiary } from './diary-context';
import { useShop } from './shop-context';

export type QuestRewardEvent = { id: string; amount: number; revision: number };
type Value = {
  quest: DailyQuest | null; loading: boolean; error: string | null;
  refresh: () => Promise<void>; reset: () => Promise<boolean>;
  rewardEvent: QuestRewardEvent | null; clearReward: (id: string) => void;
};
const Context = createContext<Value | null>(null);

export function QuestProvider({ children }: { children: ReactNode }) {
  const { accessToken, isRestoring, entries } = useDiary();
  const { refresh: refreshShop } = useShop();
  const revision = authSession.getRevision();
  const userId = authSession.getSnapshot().session?.user_id;
  const [record, setRecord] = useState<{ revision: number; quest: DailyQuest | null; loading: boolean; error: string | null }>({ revision: -1, quest: null, loading: false, error: null });
  const latest = useRef<{ revision: number; quest: DailyQuest | null }>({ revision: -1, quest: null });
  const seen = useRef(new Set<string>());
  const [reward, setReward] = useState<QuestRewardEvent | null>(null);
  const apply = useCallback((next: DailyQuest) => {
    if (revision !== authSession.getRevision()) return;
    if (latest.current.revision !== revision) { latest.current = { revision, quest: null }; seen.current.clear(); }
    const accepted = latestQuest(latest.current.quest, next);
    if (accepted !== next) { setRecord(prev => ({ ...prev, loading: false })); return; }
    latest.current = { revision, quest: next };
    setRecord({ revision, quest: next, loading: false, error: null });
    if (next.awarded > 0) {
      const id = `${revision}:${next.day}:${next.cycle}`;
      if (!seen.current.has(id)) { seen.current.add(id); setReward({ revision, id, amount: next.awarded }); }
      void refreshShop();
    }
  }, [revision, refreshShop]);
  const refresh = useCallback(async () => {
    if (!accessToken || isRestoring) return;
    setRecord(prev => prev.revision === revision ? { ...prev, loading: true } : { revision, quest: null, loading: true, error: null });
    try { apply(await apiSyncQuest(accessToken)); }
    catch (error) {
      if (revision === authSession.getRevision()) setRecord(prev => ({ ...prev, loading: false, error: error instanceof Error ? error.message : '퀘스트를 불러오지 못했어요.' }));
    }
  }, [accessToken, isRestoring, revision, apply]);
  const reset = useCallback(async () => {
    if (!accessToken || isRestoring) return false;
    setRecord(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await apiResetQuest(accessToken);
      if (revision !== authSession.getRevision()) return false;
      setReward(null); apply(result); void refreshShop();
      return true;
    } catch (error) {
      if (revision === authSession.getRevision()) setRecord(prev => ({ ...prev, loading: false, error: error instanceof Error ? error.message : '초기화에 실패했어요.' }));
      if (error instanceof Error && 'status' in error && error.status === 403) void refresh();
      return false;
    }
  }, [accessToken, isRestoring, revision, apply, refreshShop, refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  // A failed post-create award can be retried without writing a duplicate diary.
  useEffect(() => { void refresh(); }, [entries.length, refresh]);
  useEffect(() => subscribeQuest(event => {
    if (event.revision === revision && event.userId === userId) apply(event.quest);
  }), [apply, revision, userId]);
  const own = record.revision === revision;
  const quest = own ? record.quest : null;
  const nextResetAt = quest?.next_reset_at;
  useEffect(() => {
    if (!nextResetAt) return;
    const timer = setTimeout(() => { void refresh(); }, Math.max(1000, Date.parse(nextResetAt) - Date.now() + 100));
    return () => clearTimeout(timer);
  }, [nextResetAt, refresh]);
  const clearReward = useCallback((id: string) => setReward(prev => prev?.id === id ? null : prev), []);
  const value = useMemo<Value>(() => ({ quest,
    loading: !!accessToken && (!own || record.loading), error: own ? record.error : null,
    refresh, reset, rewardEvent: reward?.revision === revision ? reward : null, clearReward,
  }), [quest, accessToken, own, record.loading, record.error, refresh, reset, reward, revision, clearReward]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useQuest() {
  const value = useContext(Context);
  if (!value) throw new Error('useQuest must be used within QuestProvider');
  return value;
}
