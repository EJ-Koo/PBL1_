import { useLanguage } from '@/lib/language';
import { ScrollView, type ScrollViewHandle } from '@/components/app-scroll-view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Text, TextInput } from '@/components/app-text';
import { GroupSendIcon } from '@/components/ui/group-universe-decoration';
import { GroupChatFrame } from '@/components/ui/group-universe-panels';
import { Avatar } from '@/components/ui/group-profile-control';
import { authSession } from '@/lib/auth-session';
import { chatMessages, markChatRead, sendChat, type ChatMessage } from '@/lib/group-social-api';
import { mergeChat } from '@/lib/group-chat';
import { useDiary } from '@/store/diary-context';

export function GroupChatDock({ groupId, bottom, left, width, unread, onRead, initialExpanded = false, expanded: controlledExpanded, onExpandedChange, scale=1 }: {groupId:string;bottom:number;left:number;width:number;unread:number;onRead:()=>void;initialExpanded?:boolean;expanded?:boolean;onExpandedChange?:(expanded:boolean)=>void;scale?:number}) {
  const { t, language } = useLanguage();
  const {accessToken,profile}=useDiary();
  const revision=authSession.getRevision();
  const {height}=useWindowDimensions();
  const [localExpanded,setExpanded]=useState(initialExpanded);
  const expanded=controlledExpanded??localExpanded;
  const changeExpanded=(next:boolean)=>{setExpanded(next);onExpandedChange?.(next);};
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [body,setBody]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [more,setMore]=useState(false);
  const [keyboard,setKeyboard]=useState(0);
  const [hasNew,setHasNew]=useState(false);
  const alive=useRef(true),lock=useRef(false),nearBottom=useRef(true),pollLock=useRef(false);
  const retry=useRef<{body:string;id:string}|null>(null);
  const scroll=useRef<ScrollViewHandle>(null);
  const lastRead=useRef('');
  const read=useCallback(async (id:string) => {
    if(!accessToken || id===lastRead.current) return;
    await markChatRead(accessToken,groupId,id);
    if(alive.current && revision===authSession.getRevision()) {lastRead.current=id;onRead();}
  },[accessToken,groupId,revision,onRead]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const show=Keyboard.addListener('keyboardDidShow',e=>setKeyboard(e.endCoordinates.height));
    const hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(0));
    if(Platform.OS!=='web') return()=>{show.remove();hide.remove();};
    const viewport=window.visualViewport;
    const resize=()=>setKeyboard(Math.max(0,window.innerHeight-(viewport?.height??window.innerHeight)-(viewport?.offsetTop??0)));
    viewport?.addEventListener('resize',resize);resize();
    return()=>{show.remove();hide.remove();viewport?.removeEventListener('resize',resize);};
  },[]);
  const load=useCallback(async(before?:string)=>{
    if(!accessToken || pollLock.current) return;
    pollLock.current=true;
    try {
      const page=await chatMessages(accessToken,groupId,before);
      if(!alive.current || revision!==authSession.getRevision()) return;
      setMessages(old=>mergeChat(old,page.items));
      if(before || !messages.length) setMore(page.has_more);
      setError(null);
      const last=page.items.at(-1);
      if(!before && last) {
        if(expanded && nearBottom.current) { await read(last.id);setHasNew(false);requestAnimationFrame(()=>scroll.current?.scrollToEnd({animated:false})); }
        else if(expanded) setHasNew(true);
      }
    } catch(reason) {if(alive.current && revision===authSession.getRevision()) setError(reason instanceof Error?reason.message:t('채팅을 불러오지 못했어요.'));}
    finally {pollLock.current=false;if(alive.current)setLoading(false);}
  },[accessToken,groupId,revision,read,messages.length,expanded,t]);
  useEffect(()=>{
    if(!expanded)return;
    const initial=setTimeout(()=>void load(),0);
    const timer=setInterval(()=>{if(AppState.currentState!=='background')void load();},3000);
    return()=>{clearTimeout(initial);clearInterval(timer);};
  },[expanded,load]);
  const send=async()=>{
    const text=body.trim();
    if(!text || !accessToken || lock.current) return;
    lock.current=true;setBusy(true);setError(null);
    if(retry.current?.body!==text)retry.current={body:text,id:Crypto.randomUUID()};
    try {
      await sendChat(accessToken,groupId,text,retry.current!.id);
      if(!alive.current || revision!==authSession.getRevision())return;
      setBody('');retry.current=null;nearBottom.current=true;
      await load();
    }catch(reason){if(alive.current && revision===authSession.getRevision()){setError(reason instanceof Error?reason.message:t('전송하지 못했어요. 다시 시도해주세요.'));changeExpanded(true);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  return <GroupChatFrame left={left} width={width} bottom={Math.max(bottom,keyboard?keyboard+12:0)} scale={scale}
    expanded={expanded} unread={unread} onToggle={()=>{changeExpanded(!expanded);if(expanded)Keyboard.dismiss();}} history={<>
      <ScrollView ref={scroll} maintainVisibleContentPosition={{minIndexForVisible:0}} style={{height:Math.max(72,Math.min(176*scale,height*.24))}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.messages,{padding:12*scale,gap:16*scale}]}
        onScroll={event=>{const {layoutMeasurement,contentOffset,contentSize}=event.nativeEvent;nearBottom.current=layoutMeasurement.height+contentOffset.y>=contentSize.height-30;
          if(nearBottom.current && messages.length){void read(messages.at(-1)!.id).catch(()=>{});setHasNew(false);}}} scrollEventThrottle={100}
        onContentSizeChange={()=>{if(nearBottom.current)scroll.current?.scrollToEnd({animated:false});}}>
        {more && <Pressable disabled={loading} onPress={()=>{nearBottom.current=false;setLoading(true);void load(messages[0]?.id);}}><Text style={styles.hint}>{t("이전 대화 더 보기")}</Text></Pressable>}
        {!messages.length && !error && <Text style={styles.hint}>{t(loading?'채팅을 불러오는 중…':'첫 이야기를 나눠보세요.')}</Text>}
        {messages.map(message=><View key={message.id} style={[styles.message,{gap:18*scale}]}
          accessibilityLabel={`${message.sender_id===profile?.user_id?t('나'):message.nickname}, ${new Date(message.created_at).toLocaleTimeString(language==='en'?'en-US':'ko-KR',{hour:'2-digit',minute:'2-digit'})}`}>
          {message.avatar_url?<Avatar uri={message.avatar_url} size={40*scale}/>:<View style={{width:40*scale,height:40*scale,borderRadius:20*scale,backgroundColor:'#d9d9d9'}}/>}
          <Text style={[styles.body,{fontSize:13*scale,lineHeight:21*scale}]} selectable>{message.body}</Text>
        </View>)}
      </ScrollView>
      {hasNew && <Pressable onPress={()=>{nearBottom.current=true;scroll.current?.scrollToEnd({animated:true});if(messages.length)void read(messages.at(-1)!.id).catch(()=>{});setHasNew(false);}}><Text style={styles.hint}>{t("새 메시지 ↓")}</Text></Pressable>}
    </>} error={error&&<Pressable accessibilityRole="button" onPress={()=>void load()} style={styles.errorPanel}><Text style={styles.error}>{error} · {t('다시 시도')}</Text></Pressable>}>
      <TextInput accessibilityLabel={t("그룹 채팅 메시지")} style={[styles.input,{paddingHorizontal:24*scale,fontSize:13*scale}]} placeholder={t("입력하세요")} placeholderTextColor="#fff" value={body} onChangeText={setBody} maxLength={2000}
        underlineColorAndroid="transparent" editable={!busy} returnKeyType="send" onSubmitEditing={()=>void send()}/>
      <Pressable accessibilityRole="button" accessibilityLabel={t("메시지 보내기")} accessibilityState={{disabled:busy||!body.trim(),busy}} disabled={busy||!body.trim()} onPress={()=>void send()} style={[styles.send,{width:48*scale}]}>
        {busy?<ActivityIndicator color="#fff" size="small"/>:<GroupSendIcon size={27*scale}/>}
      </Pressable>
  </GroupChatFrame>;
}
const styles=StyleSheet.create({
 messages:{padding:14,gap:16},message:{flexDirection:'row',gap:18,alignItems:'center',minHeight:40},body:{flex:1,minWidth:0,color:'#fff',fontSize:13,lineHeight:21,paddingRight:10},
 hint:{color:'#dddde8',fontSize:11,padding:10,textAlign:'center'},error:{color:'#ffd3d8',fontSize:11,padding:10},
 errorPanel:{backgroundColor:'rgba(0,0,0,0.8)'},
 input:{flex:1,minWidth:0,minHeight:44,paddingVertical:16,color:'#fff'},send:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},
});
