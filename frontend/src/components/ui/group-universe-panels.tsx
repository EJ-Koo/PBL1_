import type {ReactNode} from 'react';
import {Pressable,StyleSheet,View} from 'react-native';
import {ScrollView} from '@/components/app-scroll-view';
import {Text} from '@/components/app-text';
import {DesignFonts} from '@/constants/ui-design';
import {useLanguage} from '@/lib/language';
import {Avatar} from './group-profile-control';
import {GroupChatChevron,GroupPanelFrame} from './group-universe-decoration';

export function GroupMembersPanel({left,top,width,height,scale:s,code,members,error,onRetry,children}: {
  left:number;top:number;width:number;height:number;scale:number;code:string;
  members:{user_id:string;nickname:string;bio:string;avatar_url:string|null}[];
  error?:string|null;onRetry?:()=>void;children?:ReactNode;
}) {
  const {t}=useLanguage();
  return <View accessibilityViewIsModal testID="group-members-panel" style={{position:'absolute',zIndex:6,left,top,width,height}}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}><GroupPanelFrame/></View>
    <View style={{flex:1,paddingHorizontal:20*s,paddingTop:18*s,paddingBottom:12*s}}>
      <View style={{alignItems:'center',borderBottomWidth:1,borderColor:'#ffffff60',paddingBottom:13*s}}>
        <Text selectable accessibilityLabel={t('방 코드')} style={{color:'#fff',fontFamily:DesignFonts.regular,textAlign:'center',fontSize:15*s}}>{t('코드: {code}',{code})}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{flex:1}} contentContainerStyle={{paddingBottom:12*s}}>
        {members.map((member,index)=><View key={member.user_id} style={{flexDirection:'row',alignItems:'center',paddingVertical:14,minHeight:88*s,gap:18*s,...(index>0?{borderTopWidth:1,borderColor:'#ffffff60'}:{})}}>
          <Avatar uri={member.avatar_url} size={40*s}/>
          <View style={{flex:1,minWidth:0,gap:7}}>
            <Text style={{color:'#fff',fontSize:Math.max(16,16*s),lineHeight:Math.max(24,24*s)}}>{member.nickname}</Text>
            <Text style={{color:'#f0f0f4',fontSize:Math.max(13,13*s),lineHeight:Math.max(20,20*s)}}>{member.bio||t('한줄소개')}</Text>
          </View>
        </View>)}
        {error&&<Pressable accessibilityRole="button" onPress={onRetry}><Text style={{color:'#ffe2d5',fontSize:11,lineHeight:18,paddingVertical:8}}>{t('추가 정보를 불러오지 못했어요. 다시 시도')}</Text></Pressable>}
      </ScrollView>
      {children}
    </View>
  </View>;
}

/** Only presentation; callers supply server or in-memory history and controls. */
export function GroupChatFrame({left,bottom,width,scale,expanded,unread,onToggle,history,error,children}: {
  left:number;bottom:number;width:number;scale:number;expanded:boolean;unread:number;onToggle:()=>void;
  history:ReactNode;error?:ReactNode;children:ReactNode;
}) {
  const {t}=useLanguage();
  return <View style={{position:'absolute',left,width,bottom}} testID="group-chat">
    {expanded&&<View style={{backgroundColor:'rgba(217,217,217,0.38)'}} testID="group-chat-history">{history}</View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${t(expanded?'그룹 채팅 접기':'그룹 채팅 펼치기')}${unread>0?` · ${t('미확인 {count}개',{count:unread})}`:''}`}
      accessibilityState={{expanded}} onPress={onToggle} style={{position:'absolute',right:2,width:32,height:32,alignItems:'center',justifyContent:'center',zIndex:1,top:expanded?0:-32}}>
      <GroupChatChevron expanded={expanded} size={12*scale}/>
      {unread>0&&!expanded&&<View style={{position:'absolute',right:3,top:3,width:5,height:5,borderRadius:3,backgroundColor:'#fff'}}/>}
    </Pressable>
    {error}
    <View style={{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#eee',backgroundColor:'rgba(0,0,0,0.12)',minHeight:Math.max(44,56*scale)}}>{children}</View>
  </View>;
}
