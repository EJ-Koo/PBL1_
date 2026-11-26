import {useEffect,useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import {router} from 'expo-router';
import {authSession} from '@/lib/auth-session';
import {listenGroupPush,restoreGroupPush} from '@/lib/group-push';

export function GroupPushGuard(){
 const snapshot=useSyncExternalStore(authSession.subscribe,authSession.getSnapshot,authSession.getServerSnapshot);
 const user=snapshot.session?.user_id;
 const token=snapshot.session?.access_token;
 useEffect(()=>{
  if(!snapshot.ready||!user||!token)return;
  void restoreGroupPush(token,user).catch(()=>{});
  const sub=AppState.addEventListener('change',state=>{
   if(state!=='active')return;
   const current=authSession.getSnapshot();
   if(current.ready&&current.session)void restoreGroupPush(current.session.access_token,current.session.user_id).catch(()=>{});
  });
  return()=>sub.remove();
 },[snapshot.ready,user,token]);
 useEffect(()=>listenGroupPush(data=>{
  if(typeof data.group_id!=='string'||!/^[0-9a-f-]{36}$/i.test(data.group_id))return;
  const session=authSession.getSnapshot().session;
  if(!session){router.replace('/login');return;}
  if(data.user_id!==session.user_id)return;
  router.push({pathname:'/',params:{groupId:data.group_id,...(data.kind==='chat'?{chat:'1'}:{}),...(data.kind==='diary'&&typeof data.source_id==='string'?{diaryId:data.source_id}:{})}});
 }),[]);
 return null;
}
