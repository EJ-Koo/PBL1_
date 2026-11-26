import { API_BASE_URL } from './api-config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
export type PushRegistration={id:string;secret:string;platform:'web'|'expo';subscription:Record<string,unknown>;user_id:string;enabled?:boolean};
const KEY='group-push:device';
export async function pushIdentity(){
  const raw=await AsyncStorage.getItem('group-push:identity');
  if(raw){const value=JSON.parse(raw);if(typeof value.id==='string'&&typeof value.secret==='string')return value as {id:string;secret:string};}
  const value={id:Crypto.randomUUID(),secret:Crypto.randomUUID()+Crypto.randomUUID()};
  await AsyncStorage.setItem('group-push:identity',JSON.stringify(value));return value;
}
export async function savedPush():Promise<PushRegistration|null>{try{return JSON.parse(await AsyncStorage.getItem(KEY)||'null');}catch{return null;}}
export const savePush=(registration:PushRegistration)=>AsyncStorage.setItem(KEY,JSON.stringify(registration));
export const forgetPush=()=>AsyncStorage.removeItem(KEY);
let pending:Promise<unknown>=Promise.resolve();
export function serialPush<T>(work:()=>Promise<T>):Promise<T>{const next=pending.catch(()=>{}).then(work);pending=next;return next;}

// Device capability can only turn this device off. It never grants access to a
// logged-out account or retains its login token, and cannot enable notifications.
export async function revokePushRegistration(registration: PushRegistration) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}/group-push/device`, {
      method: 'DELETE', headers: {'Content-Type':'application/json'}, signal: controller.signal,
      body: JSON.stringify({id:registration.id,secret:registration.secret}),
    });
    if (!response.ok) throw new Error('알림 해제를 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
  } finally { clearTimeout(timer); }
}
