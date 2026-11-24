import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
export type PushRegistration={id:string;secret:string;platform:'web'|'expo';subscription:Record<string,unknown>;user_id:string};
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
