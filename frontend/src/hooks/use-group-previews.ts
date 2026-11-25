import { useEffect, useRef, useState } from 'react';
import { authSession } from '@/lib/auth-session';
import type { ApiGroup } from '@/lib/api';
import { useDiary, type DiaryEntry } from '@/store/diary-context';

// Load authorized shared stars for cards too, rather than showing only the
// viewer's own diaries. Two requests at a time avoid a burst of AI/API calls.
export function useGroupPreviews(groups: ApiGroup[], enabled: boolean) {
  const {loadGroupStars}=useDiary();
  const revision=authSession.getRevision();
  const signature=JSON.stringify(groups.map(g=>({id:g.id,ids:[...g.diary_ids].sort()})));
  const cache=useRef(new Map<string,{key:string;entries:DiaryEntry[]}>());
  const [state,setState]=useState<{revision:number;rows:Record<string,DiaryEntry[]>}>({revision,rows:{}});
  useEffect(()=>{
    if(!enabled)return;
    let alive=true,index=0;
    const pending=(JSON.parse(signature) as {id:string;ids:string[]}[]).filter(g=>cache.current.get(g.id)?.key!==`${revision}:${g.ids.join(',')}`);
    const worker=async()=>{
      while(alive&&index<pending.length){
        const group=pending[index++];
        try{
          const entries=await loadGroupStars(group.id);
          if(!alive||revision!==authSession.getRevision())return;
          cache.current.set(group.id,{key:`${revision}:${group.ids.join(',')}`,entries});
          setState(old=>({revision,rows:{...(old.revision===revision?old.rows:{}),[group.id]:entries}}));
        }catch{ /* Keep a prior preview/own stars; opening the group still shows its error. */ }
      }
    };
    void worker();void worker();
    return()=>{alive=false;};
  },[enabled,signature,revision,loadGroupStars]);
  const allowed=new Set(groups.map(g=>g.id));
  return state.revision===revision?Object.fromEntries(Object.entries(state.rows).filter(([id])=>allowed.has(id))):{};
}
