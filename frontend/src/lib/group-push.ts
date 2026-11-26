import {pushDeliveryStatus,type PushDiagnostics} from './group-social-api';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {socialRequest} from './group-social-api';
import {authSession} from './auth-session';
import {forgetPush,pushIdentity,savedPush,savePush,serialPush,revokePushRegistration} from './push-device';
export async function syncPushUser(_user:string|null){}
export function enableGroupPush(token:string,user:string){return serialPush(async()=>{
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('groups',{name:'그룹 소식',importance:Notifications.AndroidImportance.DEFAULT});
  const permission=await Notifications.requestPermissionsAsync();
  if(!permission.granted)throw new Error('기기 설정에서 알림 권한을 허용해주세요.');
  const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
  if(!projectId)throw new Error('모바일 푸시 설정이 아직 준비되지 않았어요.');
  const {data}=await Notifications.getExpoPushTokenAsync({projectId});
  const value={...await pushIdentity(),platform:'expo' as const,subscription:{token:data},user_id:user};
  await socialRequest(token,'/me/group-push/device','PUT',{...value,enabled:true});await savePush(value);
});}
export function restoreGroupPush(token:string,user:string){return serialPush(async()=>{
  const current=authSession.getSnapshot();
  if(!current.ready||current.session?.user_id!==user)return;
  const saved=await savedPush();if(!saved)return;
  if(saved.user_id!==user||saved.enabled===false){await savePush({...saved,enabled:false});await revokePushRegistration(saved);await forgetPush();return;}
  const permission=await Notifications.getPermissionsAsync();if(!permission.granted)return;
  const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
  if(!projectId)return;
  const {data}=await Notifications.getExpoPushTokenAsync({projectId});
  const value={...saved,subscription:{token:data}};
  await socialRequest(token,'/me/group-push/device','PUT',{...value,enabled:true});await savePush(value);
});}
export function disableGroupPush(_token:string,user:string){return serialPush(async()=>{
  const saved=await savedPush();if(!saved||saved.user_id!==user)return;
  await savePush({...saved,enabled:false});
  await revokePushRegistration(saved);await forgetPush();
});}
export function listenGroupPush(onOpen:(data:Record<string,unknown>)=>void){
  const open=async(response:Notifications.NotificationResponse)=>{
    const data=response.notification.request.content.data;
    const saved=await savedPush();
    const receiver=authSession.getSnapshot().session?.user_id??saved?.user_id;
    if(saved?.enabled!==false&&data&&data.user_id===receiver)onOpen(data);
  };
  Notifications.setNotificationHandler({handleNotification:async(notification)=>{
    const target=notification.request.content.data?.user_id;
    const saved=await savedPush();
    const receiver=authSession.getSnapshot().session?.user_id??saved?.user_id;
    const show=saved?.enabled!==false&&!!target&&target===receiver;
    return{shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
  }});
  const sub=Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(value=>{if(value)void open(value);}).catch(()=>{});
  return()=>sub.remove();
}

export async function inspectGroupPush(token:string,user:string):Promise<PushDiagnostics>{
  const saved=await savedPush();
  const permission=await Notifications.getPermissionsAsync();
  return {permission:permission.granted?'granted':'denied',subscription:saved?.user_id===user&&saved.enabled!==false,key_matches:null,
    server:saved?.user_id===user?await pushDeliveryStatus(token,saved.id):null};
}
