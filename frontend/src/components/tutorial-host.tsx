import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from 'react-native';
import { hasSeenTutorial, tutorialStorageKey } from '@/lib/tutorial';
import { TutorialUniverse } from './tutorial-universe';

// Progress belongs to an account on this device. Only a status is persisted;
// practice diaries, images and messages live exclusively in the mounted modal.
const seenThisSession = new Set<string>();
let runSequence = 0;
export function TutorialHost({ userId, ready, autoEligible, request }: {
  userId: string | null; ready: boolean; autoEligible: boolean; request: number;
}) {
  const [run, setRun] = useState<{owner:string;id:number} | null>(null);
  const handledRequest = useRef(request);
  const start = useCallback(() => {
    if (!userId || !ready) return;
    seenThisSession.add(userId);
    void AsyncStorage.setItem(tutorialStorageKey(userId), 'started').catch(() => {});
    setRun({owner:userId,id:++runSequence});
  }, [userId,ready]);
  useEffect(() => {
    if (!userId || !ready || !autoEligible || seenThisSession.has(userId)) return;
    let active = true;
    AsyncStorage.getItem(tutorialStorageKey(userId)).then(raw => {
      if (active && !hasSeenTutorial(raw) && !seenThisSession.has(userId)) start();
    }).catch(() => {});
    return () => { active = false; };
  }, [userId,ready,autoEligible,start]);
  useEffect(() => {
    if (!request || request === handledRequest.current || !ready || !userId) return;
    handledRequest.current = request;
    start();
  }, [request,userId,ready,start]);
  const close = (completed=false) => {
    if (run) void AsyncStorage.setItem(tutorialStorageKey(run.owner), completed?'completed':'dismissed').catch(() => {});
    setRun(null);
  };
  const visible = !!run && run.owner === userId && ready;
  return <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => close()}>
    {visible && <TutorialUniverse key={run.id} sceneId={`${run.owner}:${run.id}`} onExit={close} />}
  </Modal>;
}
