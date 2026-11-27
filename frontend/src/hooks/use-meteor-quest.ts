import { useCallback, useRef, useState } from 'react';

import { authSession } from '@/lib/auth-session';
import { apiMeteorQuest, type MeteorId, type MeteorQuest } from '@/lib/quest-api';
import { useShop } from '@/store/shop-context';

export function useMeteorQuest(token: string | null | undefined) {
  const revision = authSession.getRevision();
  const { refresh: refreshShop } = useShop();
  const [state, setState] = useState<{
    revision: number; quest: MeteorQuest | null; busy: boolean; error: string | null;
  }>({ revision: -1, quest: null, busy: false, error: null });
  const requestLock = useRef<number | null>(null);
  const refreshedReward = useRef<string | null>(null);

  const request = useCallback(async (hit?: { day: string; meteor: MeteorId }) => {
    if (!token || requestLock.current === revision) return;
    requestLock.current = revision;
    setState(prev => ({ revision, quest: prev.revision === revision ? prev.quest : null, busy: true, error: null }));
    try {
      const quest = await apiMeteorQuest(token, hit);
      if (revision !== authSession.getRevision()) return;
      setState({ revision, quest, busy: false, error: null });
      const rewardKey = `${revision}:${quest.day}`;
      if (quest.cleared.length === 3 && refreshedReward.current !== rewardKey) {
        refreshedReward.current = rewardKey;
        void refreshShop();
      }
    } catch (error) {
      if (revision === authSession.getRevision()) {
        setState(prev => ({
          ...prev, busy: false,
          error: error instanceof Error ? error.message : '운석 퀘스트를 처리하지 못했어요.',
        }));
      }
    } finally {
      if (requestLock.current === revision) requestLock.current = null;
    }
  }, [token, revision, refreshShop]);

  const own = state.revision === revision;
  return { quest: own ? state.quest : null, busy: own && state.busy, error: own ? state.error : null, request };
}
