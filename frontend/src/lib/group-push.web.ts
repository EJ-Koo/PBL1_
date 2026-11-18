import {socialRequest} from './group-social-api';
import {API_BASE_URL} from './api-config';
import {forgetPush,pushIdentity,savedPush,savePush,serialPush} from './push-device';

export function syncPushUser(user:string|null):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){resolve();return;}
    const request=indexedDB.open('star2day-group-push',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('identity');};
    request.onerror=()=>reject(new Error('알림 설정 저장소를 열지 못했어요.'));
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('identity','readwrite');tx.objectStore('identity').put(user,'user');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(new Error('알림 설정을 저장하지 못했어요.'));};};
  });
}
export function enableGroupPush(token:string,user:string){
  if(typeof window==='undefined'||!window.isSecureContext||!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return Promise.reject(new Error('이 브라우저에서는 푸시 알림을 사용할 수 없어요. HTTPS 주소에서 지원 브라우저로 열어주세요.'));
  // Request directly from the button gesture (important on Safari).
  const requested=Notification.requestPermission();
  return serialPush(async()=>{
  const permission=await requested;
  if(permission!=='granted')throw new Error('브라우저 설정에서 알림 권한을 허용해주세요.');
  const config=await socialRequest<{web_public_key:string|null}>(token,'/me/group-push/config');
  if(!config.web_public_key)throw new Error('서버의 웹 푸시 연결이 아직 준비되지 않았어요.');
  const registered=await navigator.serviceWorker.register('/group-push-sw.js',{scope:'/',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  const key=config.web_public_key.replace(/-/g,'+').replace(/_/g,'/');
  const bytes=Uint8Array.from(atob(key+'='.repeat((4-key.length%4)%4)),letter=>letter.charCodeAt(0));
  const subscription=await registered.pushManager.getSubscription()??await registered.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  const identity=await pushIdentity();
  const value={...identity,platform:'web' as const,subscription:subscription.toJSON() as Record<string,unknown>,user_id:user};
  try{await socialRequest(token,'/me/group-push/device','PUT',{...value,enabled:true});await syncPushUser(user);await savePush(value);}
  catch(error){await subscription.unsubscribe();throw error;}
});}
export function disableGroupPush(token:string,user:string){return serialPush(async()=>{
  // Erase the worker identity first, even when logout happens offline.
  await syncPushUser(null).catch(()=>{});
  const saved=await savedPush();if(!saved||saved.user_id!==user)return;
  try{await fetch(`${API_BASE_URL}/me/group-push/device`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...saved,enabled:false})});}catch{}
  const registration=await navigator.serviceWorker?.getRegistration('/');
  const subscription=await registration?.pushManager.getSubscription();await subscription?.unsubscribe();await forgetPush();
});}
export function listenGroupPush(_onOpen:(data:Record<string,unknown>)=>void){return()=>{};}
