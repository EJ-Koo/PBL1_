import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path,require,globals={}) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code,{exports,require,Uint8Array,AbortController,setTimeout,clearTimeout,...globals});
  return exports;
}
function fixture(native=false){
  const state={ready:true,session:{user_id:'A',access_token:'access-A'}};
  const calls=[],identities=[],events=new Map();
  let saved={id:'device',secret:'test-device-secret',user_id:'A',platform:native?'expo':'web',subscription:{endpoint:'old'}};
  let subscription,permissions='granted',fail=false,revokeFail=false,keyMatches=true,subscribes=0,unsubscribes=0,prompts=0,handler;
  const makeSub=(endpoint)=>({options:{applicationServerKey:new Uint8Array([1])},toJSON:()=>({endpoint}),unsubscribe:async()=>{unsubscribes++;subscription=null;return true;}});
  subscription=makeSub('old');
  const registration={pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{subscribes++;return subscription=makeSub('new');}}};
  const device={savedPush:async()=>saved,savePush:async value=>{saved=value;},forgetPush:async()=>{saved=null;},pushIdentity:async()=>({id:'device',secret:'test-device-secret'}),serialPush:work=>work(),revokePushRegistration:async value=>{calls.push({revoke:value.user_id});if(revokeFail)throw Error('offline');}};
  const authSession={getSnapshot:()=>state};
  const socialRequest=async(token,path,method,body)=>{
    calls.push({token,path,method,body});
    if(fail&&method==='PUT')throw Error('offline');
    return path.endsWith('/config')?{web_public_key:'public-key'}:{};
  };
  const notifications={
    AndroidImportance:{DEFAULT:3},setNotificationChannelAsync:async()=>{},
    requestPermissionsAsync:async()=>{prompts++;return {granted:permissions==='granted'};},
    getPermissionsAsync:async()=>({granted:permissions==='granted'}),
    getExpoPushTokenAsync:async()=>({data:'ExpoPushToken[test-only]'}),
    setNotificationHandler:value=>{handler=value;},
    addNotificationResponseReceivedListener:callback=>{events.set('response',callback);return {remove:()=>events.delete('response')};},
    getLastNotificationResponseAsync:async()=>null,
  };
  const require=name=>{
    if(name==='./auth-session')return {authSession};
    if(name==='./push-device')return device;
    if(name==='./push-subscription')return {publicPushKey:()=>new Uint8Array([1]),samePushKey:()=>keyMatches};
    if(name==='./group-social-api')return {socialRequest,pushDeliveryStatus:async()=>({})};
    if(name==='expo-notifications')return notifications;
    if(name==='expo-constants')return {__esModule:true,default:{expoConfig:{extra:{eas:{projectId:'test-project'}}}}};
    if(name==='react-native')return {Platform:{OS:'android'}};
    throw Error(name);
  };
  const window={isSecureContext:true,PushManager(){},Notification:{},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  const indexedDB={open(){const request={result:{createObjectStore(){},close(){},transaction(){const tx={objectStore:()=>({put:user=>{identities.push(user);queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}}};queueMicrotask(()=>request.onsuccess?.());return request;}};
  const notification={get permission(){return permissions;},requestPermission:async()=>{prompts++;return permissions;}};
  const api=compile(native?'../src/lib/group-push.ts':'../src/lib/group-push.web.ts',require,{window,navigator:{serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration),getRegistration:async()=>registration}},Notification:notification,indexedDB});
  return {api,state,calls,identities,events,get saved(){return saved;},get prompts(){return prompts;},get subscribes(){return subscribes;},get unsubscribes(){return unsubscribes;},setFail:v=>{fail=v;},setRevokeFail:v=>{revokeFail=v;},setPermission:v=>{permissions=v;},setKeys:v=>{keyMatches=v;},notificationHandler:()=>handler};
}
test('web reload waits for auth restoration and silently restores an existing opt-in',async()=>{
  const f=fixture();f.state.ready=false;f.state.session=null;
  await f.api.restoreGroupPush('old','A');
  assert.equal(f.calls.length,0);assert.equal(f.identities.length,0);assert.equal(f.unsubscribes,0);
  f.state.ready=true;f.state.session={user_id:'A',access_token:'new'};
  await f.api.restoreGroupPush('new','A');
  assert.equal(f.prompts,0);assert.equal(f.subscribes,0);assert.equal(f.unsubscribes,0);
  assert.ok(f.calls.some(c=>c.method==='PUT'&&c.body.enabled));assert.equal(f.identities.at(-1),'A');
});
test('logout does not clear the durable receiver, saved device or subscription',async()=>{
  const f=fixture();await f.api.restoreGroupPush('token','A');
  const before=f.calls.length;f.state.session=null;
  await f.api.restoreGroupPush('token','A');
  assert.equal(f.calls.length,before);assert.equal(f.saved.user_id,'A');assert.equal(f.identities.at(-1),'A');assert.equal(f.unsubscribes,0);
});
test('a failed revalidation keeps a working subscription and can recover later',async()=>{
  const f=fixture();f.setFail(true);
  await assert.rejects(f.api.restoreGroupPush('token','A'),/offline/);
  assert.equal(f.unsubscribes,0);assert.equal(f.saved.user_id,'A');assert.equal(f.identities.at(-1),'A');
  f.setFail(false);await f.api.restoreGroupPush('token','A');assert.equal(f.unsubscribes,0);
});
test('switching accounts silences and retires the old device without silently opting the new account in',async()=>{
  const f=fixture();f.state.session={user_id:'B',access_token:'token-B'};
  await f.api.restoreGroupPush('token-B','B');
  assert.equal(f.identities.at(-1),null);assert.equal(f.unsubscribes,1);assert.equal(f.saved,null);
  assert.ok(f.calls.some(c=>c.revoke==='A'));assert.ok(!f.calls.some(c=>c.method==='PUT'));assert.equal(f.prompts,0);
});
test('explicit off revokes the device, and restore never opts it back in',async()=>{
  const f=fixture();await f.api.disableGroupPush('token','A');await f.api.restoreGroupPush('token','A');
  assert.equal(f.saved,null);assert.equal(f.unsubscribes,1);assert.equal(f.prompts,0);assert.ok(!f.calls.some(c=>c.method==='PUT'));
});
test('VAPID rotation replaces the browser subscription once',async()=>{
  const f=fixture();f.setKeys(false);await f.api.restoreGroupPush('token','A');
  assert.equal(f.unsubscribes,1);assert.equal(f.subscribes,1);assert.equal(f.saved.subscription.endpoint,'new');
});

for(const native of [false,true])test(`${native?'native':'web'} offline opt-out stays disabled until revocation succeeds`,async()=>{
  const f=fixture(native);f.setRevokeFail(true);
  await assert.rejects(f.api.disableGroupPush('token','A'),/offline/);
  assert.equal(f.saved.enabled,false);
  await assert.rejects(f.api.restoreGroupPush('token','A'),/offline/);
  assert.ok(!f.calls.some(c=>c.method==='PUT'));
  f.setRevokeFail(false);await f.api.restoreGroupPush('token','A');assert.equal(f.saved,null);
});
test('denied notification permission is never prompted again during restore',async()=>{
  const f=fixture();f.setPermission('denied');await f.api.restoreGroupPush('token','A');
  assert.equal(f.prompts,0);assert.equal(f.subscribes,0);assert.ok(!f.calls.some(c=>c.method==='PUT'));
});
test('native restore keeps tokens current without permission prompts, and logout can receive generic alerts',async()=>{
  const f=fixture(true);await f.api.restoreGroupPush('token','A');assert.equal(f.prompts,0);
  assert.equal(f.saved.subscription.token,'ExpoPushToken[test-only]');
  f.api.listenGroupPush(()=>{});f.state.session=null;
  assert.equal((await f.notificationHandler().handleNotification({request:{content:{data:{user_id:'A'}}}})).shouldShowBanner,true);
  f.state.session={user_id:'B'};
  assert.equal((await f.notificationHandler().handleNotification({request:{content:{data:{user_id:'A'}}}})).shouldShowBanner,false);
});
test('guard unmount/reload/logout cleanup never disables a push subscription',()=>{
  const state={ready:true,session:{user_id:'A',access_token:'token'}};const effects=[],calls=[];
  const require=name=>{
    if(name==='react')return {useEffect:fn=>effects.push(fn),useSyncExternalStore:()=>state};
    if(name==='react-native')return {AppState:{addEventListener:()=>({remove:()=>calls.push('remove-app-listener')})}};
    if(name==='expo-router')return {router:{push(){},replace(){}}};
    if(name==='@/lib/auth-session')return {authSession:{getSnapshot:()=>state}};
    if(name==='@/lib/group-push')return {restoreGroupPush:async()=>calls.push('restore'),listenGroupPush:()=>()=>calls.push('remove-push-listener'),disableGroupPush:()=>calls.push('disable'),syncPushUser:()=>calls.push('clear')};
    throw Error(name);
  };
  compile('../src/components/group-push-guard.tsx',require).GroupPushGuard();
  const cleanups=effects.map(fn=>fn());state.session=null;cleanups.forEach(fn=>fn?.());
  assert.ok(calls.includes('restore'));assert.ok(!calls.includes('disable'));assert.ok(!calls.includes('clear'));
});
