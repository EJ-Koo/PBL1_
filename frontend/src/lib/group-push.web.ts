import {publicPushKey,samePushKey} from './push-subscription';
import {pushDeliveryStatus,socialRequest,type PushDiagnostics} from './group-social-api';
import {authSession} from './auth-session';
import {forgetPush,pushIdentity,savedPush,savePush,serialPush,revokePushRegistration} from './push-device';

export function syncPushUser(user:string|null):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){resolve();return;}
    const request=indexedDB.open('star2day-group-push',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('identity');};
    request.onerror=()=>reject(new Error('알림 설정 저장소를 열지 못했어요.'));
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('identity','readwrite');tx.objectStore('identity').put(user,'user');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(new Error('알림 설정을 저장하지 못했어요.'));};};
  });
}
function supported(){return typeof window!=='undefined'&&window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;}

async function connect(token:string,user:string){
  const config=await socialRequest<{web_public_key:string|null}>(token,'/me/group-push/config');
  if(!config.web_public_key)throw new Error('서버의 웹 푸시 연결이 아직 준비되지 않았어요.');
  const registered=await navigator.serviceWorker.register('/group-push-sw.js',{scope:'/',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  const bytes=publicPushKey(config.web_public_key);
  let subscription=await registered.pushManager.getSubscription();
  if(subscription&&!samePushKey(subscription.options.applicationServerKey,bytes)){
    await subscription.unsubscribe();subscription=null;
  }
  const created=!subscription;
  subscription??=await registered.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
  const value={...await pushIdentity(),platform:'web' as const,subscription:subscription.toJSON() as Record<string,unknown>,user_id:user};
  try{
    await socialRequest(token,'/me/group-push/device','PUT',{...value,enabled:true});
    const active=authSession.getSnapshot().session?.user_id;
    if(active&&active!==user)throw new Error('로그인 계정이 변경됐어요.');
    await syncPushUser(user);await savePush(value);
  }catch(error){
    // A failed revalidation must not destroy a previously working subscription.
    if(created)await subscription.unsubscribe();
    throw error;
  }
}
export function enableGroupPush(token:string,user:string){
  if(!supported())return Promise.reject(new Error('이 브라우저에서는 푸시 알림을 사용할 수 없어요. HTTPS 주소에서 지원 브라우저로 열어주세요.'));
  // Permission prompts remain tied to an explicit button gesture.
  const requested=Notification.requestPermission();
  return serialPush(async()=>{
    if((await requested)!=='granted')throw new Error('브라우저 설정에서 알림 권한을 허용해주세요.');
    await connect(token,user);
  });
}
export function restoreGroupPush(token:string,user:string){return serialPush(async()=>{
  if(!supported())return;
  const current=authSession.getSnapshot();
  if(!current.ready||current.session?.user_id!==user)return;
  const saved=await savedPush();
  if(!saved){await syncPushUser(null);return;}
  if(saved.user_id!==user||saved.enabled===false){
    // Switching accounts is different from logout: suppress old-account pushes
    // locally first, then retire the old device without retaining its auth token.
    await syncPushUser(null);
    await savePush({...saved,enabled:false});
    const registration=await navigator.serviceWorker.getRegistration('/');
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
    await revokePushRegistration(saved);await forgetPush();return;
  }
  // Keep the durable receiver while the login/API is temporarily unavailable.
  await syncPushUser(user);
  if(Notification.permission!=='granted')return;
  await connect(token,user);
});}
export function disableGroupPush(_token:string,user:string){return serialPush(async()=>{
  await syncPushUser(null).catch(()=>{});
  const saved=await savedPush();if(!saved||saved.user_id!==user)return;
  // Persist the choice before network I/O so an offline retry cannot turn it on.
  await savePush({...saved,enabled:false});
  const registration=await navigator.serviceWorker?.getRegistration('/');
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
  await revokePushRegistration(saved);await forgetPush();
});}
export function listenGroupPush(_onOpen:(data:Record<string,unknown>)=>void){
  if(typeof window==='undefined')return()=>{};
  const restore=()=>{const current=authSession.getSnapshot();if(current.ready&&current.session)void restoreGroupPush(current.session.access_token,current.session.user_id).catch(()=>{});};
  window.addEventListener('online',restore);window.addEventListener('focus',restore);
  return()=>{window.removeEventListener('online',restore);window.removeEventListener('focus',restore);};
}
export async function inspectGroupPush(token:string,user:string):Promise<PushDiagnostics>{
  const saved=await savedPush();
  const registration=await navigator.serviceWorker?.getRegistration('/');
  const subscription=await registration?.pushManager.getSubscription();
  const config=await socialRequest<{web_public_key:string|null}>(token,'/me/group-push/config');
  // Inspecting another user's saved device must not activate it for this account.
  if(saved?.user_id===user&&saved.enabled!==false)await syncPushUser(user);
  return {permission:typeof Notification==='undefined'?'unsupported':Notification.permission,subscription:!!subscription&&saved?.user_id===user&&saved.enabled!==false,
    key_matches:subscription&&config.web_public_key?samePushKey(subscription.options.applicationServerKey,publicPushKey(config.web_public_key)):null,
    server:saved?.user_id===user?await pushDeliveryStatus(token,saved.id):null};
}
