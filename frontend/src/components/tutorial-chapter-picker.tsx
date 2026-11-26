import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/app-text';
import { ScrollView } from '@/components/app-scroll-view';
import { TUTORIAL_CHAPTERS, type TutorialChapter } from '@/lib/tutorial';

export function TutorialChapterPicker({onChoose,onExit}:{onChoose:(chapter:TutorialChapter)=>void;onExit:()=>void}) {
  const insets=useSafeAreaInsets();
  return <View style={[styles.root,{paddingTop:insets.top+24,paddingBottom:insets.bottom+24}]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={styles.title}>어디부터 연습할까요?</Text>
      <Text style={styles.body}>챕터마다 연습용 우주로 시작해요. 실제 기록은 바뀌지 않아요.</Text>
      {TUTORIAL_CHAPTERS.map((chapter,index)=><Pressable key={chapter.id} accessibilityRole="button" accessibilityLabel={`${index+1}. ${chapter.title}`}
        testID={`tutorial-chapter-${chapter.id}`} style={styles.card} onPress={()=>onChoose(chapter.id)}>
        <Text style={styles.heading}>{index+1}. {chapter.title}</Text><Text style={styles.body}>{chapter.body}</Text>
      </Pressable>)}
      <Pressable accessibilityRole="button" style={styles.card} onPress={()=>onChoose('all')}><Text style={styles.heading}>처음부터 전체 연습하기</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.exit} onPress={onExit}><Text style={styles.heading}>종료하기</Text></Pressable>
    </ScrollView>
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#080b14',paddingHorizontal:24},content:{width:'100%',maxWidth:560,alignSelf:'center',gap:18,paddingBottom:16},
  title:{color:'#fff',fontSize:24,lineHeight:34},body:{color:'#c8cfdf',fontSize:14,lineHeight:23},
  card:{borderWidth:1,borderColor:'#697187',borderRadius:12,padding:18,gap:8,backgroundColor:'rgba(30,36,52,0.8)',minHeight:52},
  heading:{color:'#fff',fontSize:16,lineHeight:24},exit:{alignSelf:'center',minHeight:44,padding:12},
});
