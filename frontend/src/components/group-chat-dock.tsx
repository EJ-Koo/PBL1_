import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Text, TextInput } from '@/components/app-text';
import { Avatar } from '@/components/ui/group-profile-control';
import { authSession } from '@/lib/auth-session';
import { chatMessages, markChatRead, sendChat, type ChatMessage } from '@/lib/group-social-api';
import { mergeChat } from '@/lib/group-chat';
import { useDiary } from '@/store/diary-context';

export function GroupChatDock({ groupId, bottom, left, width, unread, onRead, initialExpanded = false, onExpandedChange }: {groupId:string;bottom:number;left:number;width:number;unread:number;onRead:()=>void;initialExpanded?:boolean;onExpandedChange?:(expanded:boolean)=>void}) {
  const {accessToken,profile}=useDiary();
  const revision=authSession.getRevision();
  const {height}=useWindowDimensions();
  const [expanded,setExpanded]=useState(initialExpanded);
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
  const scroll=useRef<ScrollView>(null);
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
    } catch(reason) {if(alive.current && revision===authSession.getRevision()) setError(reason instanceof Error?reason.message:'채팅을 불러오지 못했어요.');}
    finally {pollLock.current=false;if(alive.current)setLoading(false);}
  },[accessToken,groupId,revision,read,messages.length,expanded]);
  useEffect(()=>{
    const initial=setTimeout(()=>void load(),0);
    const timer=setInterval(()=>{if(AppState.currentState!=='background')void load();},expanded?3000:10000);
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
    }catch(reason){if(alive.current && revision===authSession.getRevision())setError(reason instanceof Error?reason.message:'전송하지 못했어요. 다시 시도해주세요.');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  return <View style={[styles.dock,{left,width,bottom:Math.max(bottom,keyboard?keyboard+12:0)}]} testID="group-chat">
    <Pressable accessibilityRole="button" accessibilityLabel={expanded?'그룹 채팅 접기':'그룹 채팅 펼치기'} onPress={()=>{changeExpanded(!expanded);if(expanded)Keyboard.dismiss();}} style={styles.heading}>
      <Text style={styles.label}>그룹 채팅 {unread>0?`· ${unread}개 미확인`:''}</Text><Text style={styles.label}>{expanded?'⌄':'⌃'}</Text>
    </Pressable>
    {!expanded && <Pressable accessibilityRole="button" accessibilityLabel="마지막 메시지 보기" onPress={()=>changeExpanded(true)} style={styles.preview}>
      {messages.length>0?<View style={styles.message}>
        <Avatar uri={messages.at(-1)!.avatar_url} size={28}/><View style={{flex:1,minWidth:0}}>
          <Text style={styles.name} numberOfLines={1}>{messages.at(-1)!.sender_id===profile?.user_id?'나':messages.at(-1)!.nickname}</Text>
          <Text style={styles.body} numberOfLines={1}>{messages.at(-1)!.body}</Text>
        </View>
      </View>:<Text style={styles.hint}>{error?'채팅을 불러오지 못했어요. 눌러서 다시 시도':loading?'채팅을 불러오는 중…':'첫 이야기를 나눠보세요.'}</Text>}
    </Pressable>}
    {expanded && <>
      <ScrollView ref={scroll} maintainVisibleContentPosition={{minIndexForVisible:0}} style={{height:Math.max(92,Math.min(208,height*.28))}} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.messages}
        onScroll={event=>{const {layoutMeasurement,contentOffset,contentSize}=event.nativeEvent;nearBottom.current=layoutMeasurement.height+contentOffset.y>=contentSize.height-30;
          if(nearBottom.current && messages.length){void read(messages.at(-1)!.id).catch(()=>{});setHasNew(false);}}} scrollEventThrottle={100}
        onContentSizeChange={()=>{if(nearBottom.current)scroll.current?.scrollToEnd({animated:false});}}>
        {more && <Pressable disabled={loading} onPress={()=>{nearBottom.current=false;setLoading(true);void load(messages[0]?.id);}}><Text style={styles.hint}>이전 대화 더 보기</Text></Pressable>}
        {!messages.length && !error && <Text style={styles.hint}>첫 이야기를 나눠보세요.</Text>}
        {messages.map(message=><View key={message.id} style={styles.message}>
          <Avatar uri={message.avatar_url} size={28}/><View style={{flex:1,minWidth:0}}>
            <Text style={styles.name}>{message.sender_id===profile?.user_id?'나':message.nickname} <Text style={styles.time}>{new Date(message.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</Text></Text>
            <Text style={styles.body} selectable>{message.body}</Text>
          </View>
        </View>)}
      </ScrollView>
      {hasNew && <Pressable onPress={()=>{nearBottom.current=true;scroll.current?.scrollToEnd({animated:true});if(messages.length)void read(messages.at(-1)!.id).catch(()=>{});setHasNew(false);}}><Text style={styles.hint}>새 메시지 ↓</Text></Pressable>}
      {error && <Pressable onPress={()=>void load()}><Text style={styles.error}>{error} · 다시 시도</Text></Pressable>}
    </>}
    <View style={styles.composer}>
      <TextInput accessibilityLabel="그룹 채팅 메시지" style={styles.input} placeholder="입력하세요…" placeholderTextColor="#bfc0c9" value={body} onChangeText={setBody} maxLength={2000}
        onFocus={()=>changeExpanded(true)} editable={!busy} returnKeyType="send" onSubmitEditing={()=>void send()}/>
      <Pressable accessibilityRole="button" accessibilityLabel="메시지 보내기" disabled={busy||!body.trim()} onPress={()=>void send()} style={styles.send}>
        {busy?<ActivityIndicator color="#fff" size="small"/>:<Text style={{color:body.trim()?'#fff':'#777',fontSize:26}}>➤</Text>}
      </Pressable>
    </View>
  </View>;
}
const styles=StyleSheet.create({
 dock:{position:'absolute',borderWidth:1,borderColor:'#a8a9b4',backgroundColor:'rgba(82,84,94,0.85)'},
 heading:{minHeight:32,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},label:{color:'#f3f3f8',fontSize:11},
 preview:{minHeight:64,paddingHorizontal:12,paddingVertical:10,justifyContent:'center'},
 messages:{padding:12,gap:14},message:{flexDirection:'row',gap:10,alignItems:'flex-start'},name:{color:'#e4e4eb',fontSize:10,marginBottom:3},time:{color:'#c5c5cf',fontSize:9},body:{color:'#fff',fontSize:12,lineHeight:19},
 hint:{color:'#dddde8',fontSize:11,padding:10,textAlign:'center'},error:{color:'#ffd3d8',fontSize:11,padding:10},
 composer:{flexDirection:'row',alignItems:'center',borderTopWidth:1,borderColor:'#b8b8c2',backgroundColor:'rgba(0,0,0,0.85)',minHeight:44},
 input:{flex:1,minWidth:0,paddingHorizontal:12,paddingVertical:12,color:'#fff',fontSize:12},send:{width:46,minHeight:44,alignItems:'center',justifyContent:'center'},
});
