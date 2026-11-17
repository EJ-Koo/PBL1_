import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,View} from 'react-native';
import {Text} from '@/components/app-text';
import {authSession} from '@/lib/auth-session';
import {getHeart,setHeart,type HeartState} from '@/lib/group-social-api';
import {useDiary} from '@/store/diary-context';

export function DiaryHeart({groupId,diaryId}:{groupId:string;diaryId:string}){
 const {accessToken}=useDiary();const revision=authSession.getRevision();const key=`${revision}:${groupId}:${diaryId}`;
 const [record,setRecord]=useState<{key:string;value:HeartState|null;error:boolean}>({key:'',value:null,error:false});
 const [busy,setBusy]=useState(false),[retry,setRetry]=useState(0);const locked=useRef(false),alive=useRef(true),generation=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!accessToken)return;let active=true;
  const load=async()=>{if(locked.current)return;const ticket=generation.current;try{const value=await getHeart(accessToken,groupId,diaryId);if(active&&revision===authSession.getRevision()&&ticket===generation.current&&!locked.current)setRecord({key,value,error:false});}
   catch{if(active&&revision===authSession.getRevision()&&ticket===generation.current&&!locked.current)setRecord(old=>({key,value:old.key===key?old.value:null,error:true}));}};
  void load();const timer=setInterval(()=>void load(),5000);return()=>{active=false;clearInterval(timer);};
 },[accessToken,groupId,diaryId,key,revision,retry]);
 const value=record.key===key?record.value:null,error=record.key===key&&record.error;
 const toggle=async()=>{
  if(!value||!accessToken||locked.current)return;locked.current=true;generation.current++;setBusy(true);
  try{const next=await setHeart(accessToken,groupId,diaryId,!value.liked);if(alive.current&&revision===authSession.getRevision())setRecord({key,value:next,error:false});}
  catch{if(alive.current&&revision===authSession.getRevision())setRecord(old=>({...old,error:true}));}
  finally{locked.current=false;if(alive.current)setBusy(false);}
 };
 return <View style={{flex:1,alignItems:'flex-start'}}>
  <Pressable accessibilityRole="button" accessibilityLabel={error?'하트 다시 불러오기':value?.liked?`하트 취소, ${value.count}개`:`하트 누르기, ${value?.count??'확인 중'}개`}
   accessibilityState={{selected:value?.liked??false,busy,disabled:busy||(!value&&!error)}} disabled={busy||(!value&&!error)}
   onPress={()=>{if(error)setRetry(v=>v+1);else void toggle();}} style={{minHeight:40,minWidth:64,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:4}}>
   {busy?<ActivityIndicator color="#ffd1dc" size="small"/>:<Text style={{fontSize:22,color:value?.liked?'#ffadc0':'#f3f1f5'}}>{value?.liked?'♥':'♡'}</Text>}
   <Text style={{color:'#fff',fontSize:12}}>{error?'다시 시도':value?String(value.count):'…'}</Text>
  </Pressable>
 </View>;
}
