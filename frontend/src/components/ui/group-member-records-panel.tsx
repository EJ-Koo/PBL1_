import { Pressable, View } from 'react-native';
import { Text } from '@/components/app-text';
import { ScrollView } from '@/components/app-scroll-view';
import { DIARY_TOPICS } from '@/lib/special-planet';
import { useLanguage } from '@/lib/language';
import type { DiaryEntry } from '@/store/diary-context';

export function GroupMemberRecordsPanel({entries,name,left,bottom,width,maxHeight,scale:s,onOpen,onConstellation}:{
  entries:DiaryEntry[];name:string;left:number;bottom:number;width:number;maxHeight:number;scale:number;
  onOpen:(id:string)=>void;onConstellation:()=>void;
}) {
  const {t,language}=useLanguage();
  const ordered=[...entries].sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id));
  return <View testID="group-member-records-panel" style={{position:'absolute',left,bottom,width,maxHeight,backgroundColor:'rgba(8,9,16,0.88)',borderWidth:1,borderColor:'#ffffff80',borderRadius:12,padding:12*s,gap:8*s}}>
    <Text accessibilityRole="header" style={{color:'#fff',fontSize:Math.max(14,15*s),lineHeight:23*s}}>{t('{name}님의 공유 일기',{name})}</Text>
    <Text style={{color:'#c5cad4',fontSize:12*s,lineHeight:19*s}}>{t('이 그룹에 공유한 글 {count}개',{count:entries.length})}</Text>
    <Pressable accessibilityRole="button" onPress={onConstellation} style={{minHeight:44,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:'#ffffff70',borderRadius:6}}>
      <Text style={{color:'#fff',fontSize:13*s,lineHeight:20*s}}>{t('주제별 별자리 보기')}</Text>
    </Pressable>
    <ScrollView style={{flexShrink:1,minHeight:0}} contentContainerStyle={{gap:6*s}} keyboardShouldPersistTaps="handled">
      {ordered.map(entry=><Pressable key={entry.id} testID={`member-record-${entry.id}`} accessibilityRole="button"
        onPress={()=>onOpen(entry.id)} style={{minHeight:60,paddingVertical:10*s,paddingHorizontal:8*s,borderTopWidth:1,borderColor:'#ffffff30',gap:4*s}}>
        <Text style={{color:'#bbc3d5',fontSize:11*s,lineHeight:17*s}}>{new Date(entry.createdAt).toLocaleDateString(language==='en'?'en-US':'ko-KR')} · {t(DIARY_TOPICS.find(topic=>topic.id===entry.topic)?.label??'주제 없음')}</Text>
        <Text numberOfLines={2} style={{color:'#fff',fontSize:Math.max(13,13*s),lineHeight:Math.max(20,20*s)}}>{entry.text}</Text>
      </Pressable>)}
      {!entries.length&&<Text style={{color:'#c5cad4',fontSize:13,lineHeight:21,paddingVertical:12}}>{t('이 멤버가 이 그룹에 공유한 일기가 없어요.')}</Text>}
    </ScrollView>
  </View>;
}
