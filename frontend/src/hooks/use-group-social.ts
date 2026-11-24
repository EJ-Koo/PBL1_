import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { authSession } from '@/lib/auth-session';
import { groupSnapshot, type GroupSnapshot } from '@/lib/group-social-api';
import { useDiary } from '@/store/diary-context';

export function useGroupSocial(groupId: string) {
  const { accessToken } = useDiary();
  const revision = authSession.getRevision();
  const key = `${revision}:${groupId}`;
  const acknowledged = useRef(new Set<string>());
  const [record, setRecord] = useState<{key:string;data:GroupSnapshot|null;error:string|null}>({key:'',data:null,error:null});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!accessToken) return;
    let alive = true, running = false;
    const load = async () => {
      if (!alive || running || AppState.currentState === 'background') return;
      running = true;
      try {
        const data = await groupSnapshot(accessToken,groupId);
        if (alive && revision === authSession.getRevision()) setRecord({key,data:{...data,unread_diary_ids:data.unread_diary_ids.filter(id=>!acknowledged.current.has(id))},error:null});
      } catch (error) {
        if (alive && revision === authSession.getRevision()) setRecord(old => ({key,data:old.key===key?old.data:null,error:error instanceof Error?error.message:'그룹을 불러오지 못했어요.'}));
      } finally { running = false; }
    };
    void load();
    const timer=setInterval(() => { void load(); },10000);
    const sub=AppState.addEventListener('change',state => { if(state==='active') void load(); });
    return () => { alive=false;clearInterval(timer);sub.remove(); };
  },[accessToken,groupId,key,revision,retry]);
  const refresh=useCallback(() => setRetry(value=>value+1),[]);
  const forgetUnread=useCallback((id:string) => {acknowledged.current.add(id);setRecord(old => old.key!==key || !old.data ? old : {...old,data:{...old.data,unread_diary_ids:old.data.unread_diary_ids.filter(value=>value!==id)}});},[key]);
  return {data:record.key===key?record.data:null,error:record.key===key?record.error:null,refresh,forgetUnread};
}
