import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {socialRequest} from './group-social-api';
import {API_BASE_URL} from './api-config';
import {authSession} from './auth-session';
import {forgetPush,pushIdentity,savedPush,savePush,serialPush} from './push-device';
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
export function disableGroupPush(token:string,user:string){return serialPush(async()=>{
  const saved=await savedPush();if(!saved||saved.user_id!==user)return;
  try{const result=await fetch(`${API_BASE_URL}/me/group-push/device`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...saved,enabled:false})});if(!result.ok)throw new Error('알림 해제를 저장하지 못했어요. 다시 시도해주세요.');await forgetPush();}catch(error){throw error;}
});}
export function listenGroupPush(onOpen:(data:Record<string,unknown>)=>void){
  const open=(response:Notifications.NotificationResponse)=>{
    const data=response.notification.request.content.data;
    if(data && data.user_id===authSession.getSnapshot().session?.user_id)onOpen(data);
  };
  Notifications.setNotificationHandler({handleNotification:async(notification)=>{
    const target=notification.request.content.data?.user_id;
    const show=!target||target===authSession.getSnapshot().session?.user_id;
    return{shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
  }});
  const sub=Notifications.addNotificationResponseReceivedListener(open);
  void Notifications.getLastNotificationResponseAsync().then(value=>{if(value)open(value);}).catch(()=>{});
  return()=>sub.remove();
}
