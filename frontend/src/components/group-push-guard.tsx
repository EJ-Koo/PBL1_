import {useEffect,useRef,useSyncExternalStore} from 'react';
import {router} from 'expo-router';
import {authSession} from '@/lib/auth-session';
import {disableGroupPush,listenGroupPush,syncPushUser} from '@/lib/group-push';

export function GroupPushGuard(){
 const snapshot=useSyncExternalStore(authSession.subscribe,authSession.getSnapshot,authSession.getServerSnapshot);
 const user=snapshot.session?.user_id;
 const token=useRef(snapshot.session?.access_token??'');
 useEffect(()=>{if(snapshot.session?.access_token)token.current=snapshot.session.access_token;},[snapshot.session?.access_token]);
 useEffect(()=>{
  void syncPushUser(user??null).catch(()=>{});
  return()=>{if(user&&authSession.getSnapshot().session?.user_id!==user)void disableGroupPush(token.current,user).catch(()=>{});};
 },[user]);
 useEffect(()=>listenGroupPush(data=>{
  if(typeof data.group_id!=='string'||!/^[0-9a-f-]{36}$/i.test(data.group_id))return;
  router.push({pathname:'/',params:{groupId:data.group_id,...(data.kind==='chat'?{chat:'1'}:{}),...(data.kind==='diary'&&typeof data.source_id==='string'?{diaryId:data.source_id}:{})}});
 }),[]);
 return null;
}
