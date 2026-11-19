import { useLanguage } from '@/lib/language';
import { ScrollView } from '@/components/app-scroll-view';
import {useCallback,useEffect,useRef,useState} from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg,{Circle,Path} from 'react-native-svg';
import {Text} from '@/components/app-text';
import {DiaryUniverse} from '@/components/diary-universe';
import {GroupChatDock} from '@/components/group-chat-dock';
import {Avatar} from '@/components/ui/group-profile-control';
import {HomeHudFrame,QuestFrame} from '@/components/ui/design-decoration';
import {SpaceButton,SpaceSurface} from '@/components/ui/space-ui';
import {useGroupSocial} from '@/hooks/use-group-social';
import {useResponsiveLayout} from '@/hooks/use-responsive-layout';
import {type ApiGroup} from '@/lib/api';
import {authSession} from '@/lib/auth-session';
import {markDiaryRead} from '@/lib/group-social-api';
import {enableGroupPush,disableGroupPush,inspectGroupPush} from '@/lib/group-push';
import {savedPush} from '@/lib/push-device';
import {confirmChoice,showNotice} from '@/lib/notice';
import {useDiary,type DiaryEntry} from '@/store/diary-context';

type Props={group:ApiGroup;entries:DiaryEntry[];loading:boolean;error:string|null;onReload:()=>void;
 onBack:()=>void;onLeave:()=>Promise<void>;leaving:boolean;selection:{id:string|null;onChange:(id:string|null)=>void};initialChat?:boolean};
function PeopleIcon(){return <Svg width={27} height={27} viewBox="0 0 32 32"><Circle cx={16} cy={16} r={14} fill="#050609" stroke="#eee"/>
 <Circle cx={14} cy={11} r={3} fill="#eee"/><Path d="M8 23C8 14 20 14 20 23 M22 15V23 M18 19H26" fill="none" stroke="#eee" strokeWidth={1.4}/></Svg>;}
export function GroupExperience({group,entries,loading,error,onReload,onBack,onLeave,leaving,selection,initialChat=false}:Props){
  const { t } = useLanguage();
 const {accessToken,profile}=useDiary();const revision=authSession.getRevision();
 const {width,height}=useWindowDimensions();const layout=useResponsiveLayout();
 const [chatExpanded,setChatExpanded]=useState(initialChat);
 const chatOpen=chatExpanded&&!selection.id;
 const [panel,setPanel]=useState<'members'|'quest'|null>(null);
 const [checkingPush,setCheckingPush]=useState(false);
 const [pushBusy,setPushBusy]=useState(false),[pushEnabled,setPushEnabled]=useState(false);
 const [readError,setReadError]=useState<string|null>(null);
 const {data,error:socialError,refresh,forgetUnread}=useGroupSocial(group.id);
 const lastReload=useRef('');const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;void savedPush().then(saved=>{if(active)setPushEnabled(saved?.user_id===profile?.user_id);});return()=>{active=false;};},[profile?.user_id]);
 const currentIds=entries.map(item=>item.id).sort().join(',');const serverIds=data?.diary_ids?.slice().sort().join(',');
 useEffect(()=>{if(serverIds===undefined||serverIds===currentIds||loading||lastReload.current===serverIds)return;lastReload.current=serverIds;onReload();},[serverIds,currentIds,loading,onReload]);
 useEffect(()=>{if(Platform.OS!=='web'||!panel)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setPanel(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[panel]);
 const read=useCallback(async(id:string)=>{
  if(!accessToken)return;
  try{await markDiaryRead(accessToken,group.id,id);if(alive.current&&revision===authSession.getRevision()){forgetUnread(id);setReadError(null);}}
  catch{if(alive.current&&revision===authSession.getRevision())setReadError(t('읽음 표시를 저장하지 못했어요. 별을 다시 열어주세요.'));}
 },[accessToken,group.id,revision,forgetUnread,t]);
 const push=async(reconnect=false)=>{
  if(pushBusy||!accessToken||!profile?.user_id)return;setPushBusy(true);
  try{if(pushEnabled&&!reconnect)await disableGroupPush(accessToken,profile.user_id);else await enableGroupPush(accessToken,profile.user_id);
   if(alive.current&&revision===authSession.getRevision())setPushEnabled(reconnect||!pushEnabled);}
  catch(reason){if(alive.current&&revision===authSession.getRevision())showNotice(t('그룹 알림'),reason instanceof Error?reason.message:t('알림을 연결하지 못했어요.'));}
  finally{if(alive.current)setPushBusy(false);}
 };
 const checkPush=async()=>{
  if(checkingPush||!accessToken||!profile?.user_id)return;setCheckingPush(true);
  try{
   const status=await inspectGroupPush(accessToken,profile.user_id);
   if(!alive.current||revision!==authSession.getRevision())return;
   const server=status.server;
   const lines=[t('브라우저/기기 권한: {value}',{value:status.permission}),t('이 기기의 구독: {value}',{value:t(status.subscription?'있음':'없음')}),
    t('서버 등록: {value}',{value:t(server?.registered?'있음':'없음')})];
   if(status.key_matches!==null)lines.push(t('푸시 키 일치: {value}',{value:t(status.key_matches?'일치':'불일치')}));
   if(server)lines.push(t('최근 알림 {count}개 · 대기 {pending} · 처리 중 {sending} · 전달 {sent} · 실패 {failed} · 최대 시도 {attempts}',
    {count:server.recent_notifications,pending:server.pending,sending:server.sending,sent:server.sent,failed:server.failed,attempts:server.max_attempts}));
   if(!status.subscription||!server?.registered||status.key_matches===false)lines.push(t('아래 알림 다시 연결을 누른 뒤 다른 계정으로 새 채팅을 보내주세요.'));
   else if(server.pending>0&&server.max_attempts===0)lines.push(t('worker가 이 기기의 대기열을 처리하지 않았어요. worker의 DB 연결과 실행 로그를 확인해주세요.'));
   else if(server.failed>0||server.pending>0&&server.max_attempts>0)lines.push(t('발송 재시도 또는 실패가 있어요. worker 실행 로그의 Group push failed 코드를 확인해주세요.'));
   else if(server.sent>0)lines.push(t('푸시 서비스에는 전달됐어요. 운영체제 알림 허용과 방해금지 설정을 확인해주세요.'));
   lines.push(t('본인이 보낸 채팅은 본인에게 알림이 오지 않아요. 같은 그룹의 다른 계정으로 새 채팅을 보내 테스트해주세요.'));
   showNotice(t('알림 상태'),lines.join('\n\n'));
  }catch(reason){if(alive.current&&revision===authSession.getRevision())showNotice(t('알림 상태'),reason instanceof Error?reason.message:t('알림 상태를 확인하지 못했어요.'));}
  finally{if(alive.current)setCheckingPush(false);}
 };
 const members=data?.members??group.members.map(item=>({user_id:item.user_id,nickname:item.nickname??'멤버',bio:'',avatar_url:null}));
 const panelWidth=Math.min(300,width-32),top=layout.headerTop+72*layout.scale;
 const chatWidth=Math.min(460,layout.chromeWidth-32);
 const chatLeft=layout.chromeLeft+(layout.chromeWidth-chatWidth)/2;
 const questTop=layout.headerTop+75*layout.scale+8;
 const chatBottom=layout.navBottom+layout.navHeight+12;
 return <View style={styles.screen} testID="group-experience">
  <DiaryUniverse groupId={group.id} sceneKey={`${revision}:group-${group.id}`} entries={entries} backgroundStarScale={1.4}
    selection={selection} unreadIds={data?.unread_diary_ids??[]} onDiaryRead={read}
    popupInsets={{top:top+12,bottom:chatBottom+(chatOpen?Math.min(208,height*.28)+100:60)}}/>
  {(loading||error||entries.length===0)&&<View pointerEvents={error?'auto':'none'} style={styles.empty}>
   <Text style={styles.text}>{error??t(loading?'그룹의 별을 불러오는 중…':'아직 이 그룹에 공유된 별이 없어요.')}</Text>
   {error&&<SpaceButton label={t("다시 불러오기")} onPress={onReload}/>}
  </View>}
  <View pointerEvents="box-none" style={{position:'absolute',top:layout.headerTop,left:layout.chromeLeft,width:layout.chromeWidth,height:64*layout.scale}}>
   <View style={StyleSheet.absoluteFill} pointerEvents="none"><HomeHudFrame scale={layout.scale} width={layout.chromeWidth} wide={layout.wide}/></View>
   <View style={[styles.header,{height:58*layout.scale}]}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("그룹으로 돌아가기")} onPress={onBack} style={styles.back}><Text style={{color:'#fff',fontSize:24}}>‹</Text><Text numberOfLines={1} style={styles.backText}>{t("그룹으로 돌아가기")}</Text></Pressable>
    <View style={{width:110*layout.scale,alignItems:'center',gap:2}}>
     <Pressable accessibilityRole="button" accessibilityLabel={t("그룹 퀘스트")} onPress={()=>setPanel(old=>old==='quest'?null:'quest')} accessibilityState={{expanded:panel==='quest'}} style={[styles.quest,{width:77*layout.scale,height:38*layout.scale}]}>
      <QuestFrame scale={layout.scale}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.questLabel]}><Text style={[styles.questText,{fontSize:12*layout.scale}]}>Quest</Text></View>
     </Pressable>
     <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
    </View>
    <View style={{flex:1,alignItems:'flex-end'}}><Pressable accessibilityRole="button" accessibilityLabel={t("그룹 멤버 목록")} accessibilityState={{expanded:panel==='members'}} onPress={()=>setPanel(old=>old==='members'?null:'members')} style={styles.icon}><PeopleIcon/></Pressable></View>
   </View>
  </View>
  {readError&&<Text accessibilityRole="alert" style={[styles.readError,{top}]}>{readError}</Text>}
  <GroupChatDock key={group.id} groupId={group.id} bottom={chatBottom} left={chatLeft} width={chatWidth} unread={data?.chat_unread_count??0} onRead={refresh} initialExpanded={initialChat} expanded={chatOpen} onExpandedChange={expanded=>{if(expanded)selection.onChange(null);setChatExpanded(expanded);}}/>
  <View pointerEvents="none" style={{position:'absolute',bottom:layout.navBottom,left:layout.chromeLeft,width:layout.chromeWidth,height:24}}>
   <Svg width="100%" height={24} viewBox="0 0 800 24" preserveAspectRatio="none"><Path d="M0 2H800 M0 22H800 M220 20L238 4H302V20Z M312 4H488V20H312Z M498 4H562L580 20H498Z" stroke="#d6d7df" fill="#393c47"/>
    <Path d="M5 18L18 6M20 18L33 6M35 18L48 6M50 18L63 6 M737 6L750 18M752 6L765 18M767 6L780 18M782 6L795 18" stroke="#e5e6ec" strokeWidth={4}/></Svg>
  </View>
  {panel&&<>
   <Pressable style={[StyleSheet.absoluteFill,{zIndex:5}]} accessibilityLabel={t("그룹 패널 닫기")} onPress={()=>setPanel(null)}/>
   <View style={{position:'absolute',zIndex:6,left:panel==='quest'?layout.chromeLeft+(layout.chromeWidth-panelWidth)/2:width-panelWidth-Math.max(16,width-layout.chromeLeft-layout.chromeWidth+8),top:panel==='quest'?questTop:top,width:panelWidth,maxHeight:Math.max(120,height-(panel==='quest'?questTop:top)-chatBottom-16)}}>
    <SpaceSurface style={styles.panel}>
     <View style={styles.panelHeading}><Text accessibilityRole="header" style={styles.panelTitle}>{t(panel==='members'?'그룹 멤버':'그룹 퀘스트')}</Text><Pressable accessibilityLabel={t("그룹 패널 닫기")} onPress={()=>setPanel(null)} hitSlop={10}><Text style={styles.text}>×</Text></Pressable></View>
     <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:16,paddingBottom:12}}>
      {panel==='members'?<>
       <View style={styles.code}><Text style={styles.muted}>{t("방 코드")}</Text><Text selectable style={styles.codeText}>{group.invite_code}</Text></View>
       {members.map(member=><View key={member.user_id} style={styles.member}>
        <Avatar uri={member.avatar_url} size={38}/><View style={{flex:1,minWidth:0}}><Text style={styles.text} numberOfLines={1}>{member.nickname}{member.user_id===profile?.user_id?` (${t('나')})`:''}</Text>
         <Text style={styles.bio} numberOfLines={2}>{member.bio||t('함께 별을 기록하는 멤버')}</Text></View>
       </View>)}
       {socialError&&<Pressable onPress={refresh}><Text style={styles.warning}>{t("추가 정보를 불러오지 못했어요. 다시 시도")}</Text></Pressable>}
       <SpaceButton label={t(pushBusy?'연결 중…':pushEnabled?'그룹 알림 끄기':'그룹 알림 받기')} onPress={()=>void push()} disabled={pushBusy||checkingPush}/>
       {pushEnabled&&<>
        <SpaceButton label={t(checkingPush?'확인 중…':'알림 상태 확인')} onPress={()=>void checkPush()} disabled={pushBusy||checkingPush}/>
        <SpaceButton label={t('알림 다시 연결')} onPress={()=>void push(true)} disabled={pushBusy||checkingPush}/>
       </>}
       <Pressable accessibilityRole="button" disabled={leaving} onPress={()=>confirmChoice(t('그룹 나가기'),t('이 그룹의 공유 우주와 채팅에서 나갈까요?'),t('나가기'),()=>{void onLeave();})} style={styles.leave}><Text style={styles.muted}>{t(leaving?'나가는 중…':'그룹 나가기')}</Text></Pressable>
      </>:data?<>
       <Text style={styles.text}>{t(data.quest.title)}</Text><Text style={styles.bio}>{t("오늘 그룹 멤버가 각자 일기를 공유하면 완료돼요.")}</Text>
       <View style={styles.track}><View style={[styles.progress,{width:`${data.quest.total?Math.min(100,data.quest.completed/data.quest.total*100):0}%`}]}/></View>
       <Text style={styles.text}>{t('{completed}/{total}명',{completed:data.quest.completed,total:data.quest.total})}{data.quest.done?` · ${t('오늘의 미션 완료')}`:''}</Text><Text style={styles.muted}>{data.quest.day}</Text>
      </>:socialError?<Pressable onPress={refresh}><Text style={styles.warning}>{t("퀘스트를 불러오지 못했어요. 다시 시도")}</Text></Pressable>:<ActivityIndicator color="#fff"/>}
     </ScrollView>
    </SpaceSurface>
   </View>
  </>}
 </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#000'},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:12},back:{flex:1,minHeight:44,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'rgba(0,0,0,0.85)'},backText:{color:'#fff',fontSize:11,flexShrink:1},icon:{width:44,height:44,alignItems:'center',justifyContent:'center'},
 quest:{alignItems:'center',justifyContent:'center'},questLabel:{alignItems:'center',justifyContent:'center'},questText:{color:'#fff',fontSize:12},groupName:{color:'#d1d2de',fontSize:10,maxWidth:180},
 empty:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',gap:12,padding:28},text:{color:'#f4f4fa',fontSize:13,lineHeight:20},muted:{color:'#c4c5d2',fontSize:11},
 readError:{position:'absolute',left:24,right:24,color:'#ffd3df',fontSize:11},
 panel:{backgroundColor:'rgba(99,100,109,0.94)',padding:18,maxHeight:'100%'},panelHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},panelTitle:{color:'#fff',fontSize:15,fontWeight:'700'},
 code:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:'#ffffff70',paddingBottom:12},codeText:{color:'#fff',fontSize:14,letterSpacing:1},
 member:{flexDirection:'row',gap:12,alignItems:'center',paddingBottom:12,borderBottomWidth:1,borderColor:'#ffffff40'},bio:{color:'#d1d2db',fontSize:10,lineHeight:17,marginTop:3},warning:{color:'#ffe2d5',fontSize:11,lineHeight:18},leave:{minHeight:40,alignItems:'center',justifyContent:'center',marginTop:8},
 track:{height:6,backgroundColor:'#ffffff30',borderRadius:3,overflow:'hidden'},progress:{height:'100%',backgroundColor:'#e7efff'},
});
