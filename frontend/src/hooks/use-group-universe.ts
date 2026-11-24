import { useCallback, useEffect, useState } from 'react';
import { useDiary, type DiaryEntry } from '@/store/diary-context';
import { authSession } from '@/lib/auth-session';

type State = { entries: DiaryEntry[]; loading: boolean; error: string | null };
const EMPTY: State = { entries: [], loading: true, error: null };

export function useGroupUniverse(groupId: string | null) {
  const { loadGroupStars } = useDiary();
  const revision = authSession.getRevision();
  const [records, setRecords] = useState<{ revision: number; groups: Record<string, State> }>({ revision, groups: {} });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    const update = (change: (old: State) => State) => {
      if (!alive || authSession.getRevision() !== revision) return;
      setRecords(previous => {
        const groups = previous.revision === revision ? previous.groups : {};
        return { revision, groups: { ...groups, [groupId]: change(groups[groupId] ?? EMPTY) } };
      });
    };
    // Preserve this group's stars while revalidating; never display another group's result.
    update(old => ({ ...old, loading: true, error: null }));
    loadGroupStars(groupId).then(entries => update(() => ({ entries, loading: false, error: null })))
      .catch(error => update(old => ({ ...old, loading: false, error: error instanceof Error ? error.message : '그룹 우주를 불러오지 못했어요.' })));
    return () => { alive = false; };
  }, [groupId, loadGroupStars, revision, retry]);
  const state = records.revision === revision && groupId ? records.groups[groupId] ?? EMPTY : EMPTY;
  const reload = useCallback(() => setRetry(value => value + 1), []);
  return { ...state, reload };
}
