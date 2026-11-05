import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { initialJournal, parseJournal, type Journal } from '@/lib/journal';

const STORAGE_KEY = 'starex:journal:v1';

// Serialize writes so a slow draft write cannot overwrite a newer submission.
export function useJournal() {
  const [data, setData] = useState(initialJournal);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(data);
  const queue = useRef(Promise.resolve());
  const loaded = useRef(false);
  const transactions = useRef(0);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const next = raw ? parseJournal(raw) : initialJournal;
      current.current = next;
      setData(next);
      loaded.current = true;
      setReady(true);
      setError(null);
    } catch {
      setError('저장한 데이터를 불러오지 못했어요. 다시 시도해주세요.');
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const update = useCallback(function updateSnapshot(recipe: (value: Journal) => Journal): Promise<void> {
    if (!loaded.current) return Promise.reject(new Error('데이터를 불러오는 중이에요.'));
    if (transactions.current > 0) return queue.current.catch(() => {}).then(() => updateSnapshot(recipe));
    let next: Journal;
    try { next = recipe(current.current); } catch (cause) { return Promise.reject(cause); }
    current.current = next;
    setData(next);
    const write = queue.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)));
    queue.current = write;
    void write.then(() => setError(null), () => setError('저장 공간을 확인해주세요. 변경 내용을 저장하지 못했어요.'));
    return write;
  }, []);

  // Critical operations clear their input only after the complete snapshot reaches storage.
  const commit = useCallback((recipe: (value: Journal) => Journal) => {
    transactions.current += 1;
    const write = queue.current.catch(() => {}).then(async () => {
      if (!loaded.current) throw new Error('데이터를 불러오는 중이에요.');
      const next = recipe(current.current);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      current.current = next;
      setData(next);
      setError(null);
    });
    const complete = write.finally(() => { transactions.current -= 1; });
    queue.current = complete;
    return complete;
  }, []);

  return { data, update, commit, ready, error, reload: load };
}
