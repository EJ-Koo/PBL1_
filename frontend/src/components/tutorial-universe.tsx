import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Asset } from 'expo-asset';
import { Text, TextInput } from '@/components/app-text';
import { ScrollView } from '@/components/app-scroll-view';
import { UniverseCanvas, type ConstellationRequest } from '@/components/universe-scene';
import { DiaryWriteScreen } from '@/components/ui/diary-write-screen';
import { HomeHud } from '@/components/ui/home-hud';
import { UniverseBottomNav } from '@/components/ui/universe-bottom-nav';
import { GroupSpaceScreen } from '@/components/ui/group-space-screen';
import { ConstellationModeToggle, ConstellationPanel } from '@/components/ui/constellation-panel';
import { GroupQuestDrawer } from '@/components/group-quest-drawer';
import { GroupUniverseHeader } from '@/components/ui/group-universe-header';
import { GroupMembersPanel, GroupChatFrame } from '@/components/ui/group-universe-panels';
import { GroupSendIcon } from '@/components/ui/group-universe-decoration';
import { StarDiaryPopup } from '@/components/ui/star-diary-popup';
import type { StarPopupAnchor } from '@/lib/star-popup-layout';
import { groupUniverseLayout } from '@/lib/group-universe-layout';
import { useFontScale } from '@/hooks/use-font-scale';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { allTopicStatus, groupTopicStatuses, selectMembers, TOPIC_CONCEPTS } from '@/lib/constellation';
import { DIARY_TOPICS, type DiaryTopic } from '@/lib/special-planet';
import { createTutorialState, groupPracticeStars, personalPracticeStars, reduceTutorial, TUTORIAL_GROUP_ID, TUTORIAL_GROUP_NAME, TUTORIAL_MEMBERS, TUTORIAL_STEPS, tutorialCanAdvance } from '@/lib/tutorial';

const noop = () => {};
function Button({ label, onPress, active=false, disabled=false, compact=false }: {label:string;onPress:()=>void;active?:boolean;disabled?:boolean;compact?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled}
    onPress={onPress} style={({pressed})=>[styles.button,compact&&{paddingHorizontal:10},active&&styles.target,disabled&&styles.disabled,pressed&&{opacity:.65}]}>
    <Text style={[styles.buttonText,compact&&{fontSize:12,lineHeight:18}]}>{label}</Text>
  </Pressable>;
}
function Panel({title,children}:{title:string;children:ReactNode}) {
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.panelTitle}>{title}</Text>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelBody}>{children}</ScrollView>
  </View>;
}

/** Presentation-only sandbox. Server composers, social hooks, quest providers,
 * profile editors and API-backed reactions stay outside this component. */
export function TutorialUniverse({sceneId,onExit}:{sceneId:string;onExit:(completed?:boolean)=>void}) {
  const [state,dispatch]=useReducer(reduceTutorial,undefined,createTutorialState);
  const step=TUTORIAL_STEPS[state.step];
  const layout=useResponsiveLayout();
  const insets=useSafeAreaInsets();
  const {height,width}=useWindowDimensions();
  const [area,setArea]=useState({width,height});
  const [hiddenGuideStep,setHiddenGuideStep]=useState<string|null>(null);
  const guideOpen=hiddenGuideStep!==step.id;
  const guideBarHeight=60+insets.bottom;
  const photoSequence=useRef(0);
  const [fontPercent,setFontPercent]=useState(100);
  const [sensitivity,setSensitivity]=useState(1);
  const [nickname,setNickname]=useState('별 여행자');
  const [bio,setBio]=useState('함께 기록해요');
  const [sampleAvatar,setSampleAvatar]=useState(false);
  const [anchor,setAnchor]=useState<StarPopupAnchor|null>(null);
  const [closedPopup,setClosedPopup]=useState<string|null>(null);
  const [groupInfoHeight,setGroupInfoHeight]=useState(0);
  const fontScale=useFontScale();
  const personalTopic=state.personal?.topic??'other';
  const examples=useMemo(()=>personalPracticeStars(personalTopic),[personalTopic]);
  const groupExamples=useMemo(()=>groupPracticeStars(),[]);
  const photoAsset=Asset.fromModule(require('../../assets/images/planet-favicon-v1.png'));
  const samplePhoto={uri:photoAsset.localUri??photoAsset.uri};
  const emit=(event:string,id?:string)=>{Keyboard.dismiss();dispatch({type:'event',event,id,stepId:step.id});};
  const quit=()=>{Keyboard.dismiss();onExit(false);};
  const hideGuide=()=>{Keyboard.dismiss();setHiddenGuideStep(step.id);};
  const advance=()=>{Keyboard.dismiss();if(step.event==='finish')onExit(true);else emit('next');};
  const hasNext=step.event==='next'||step.event==='finish';
  const previewStep=['write-photo','recorded','main-quest-info','constellation-info','group-members-info','group-read-info','group-quest-info','group-constellation','chat-welcome','profile-info','settings-info'].includes(step.id);
  const guideNext=()=>{if(hasNext&&!previewStep&&tutorialCanAdvance(state))advance();else hideGuide();};
  useEffect(()=>{
    if(Platform.OS!=='web')return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();Keyboard.dismiss();onExit(false);}};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[onExit]);
  const group=step.scene==='group';
  const chatExpanded=step.id==='chat-send'||step.id==='chat-welcome';
  const geometry=groupUniverseLayout(layout,fontScale,area.height,chatExpanded);
  const writing=step.scene==='write'||step.scene==='group-write';
  const showingExamples=state.step>=TUTORIAL_STEPS.findIndex(item=>item.id==='constellation');
  const personalEntries=useMemo(()=>[...(state.personal?[state.personal]:[]),...(showingExamples?examples:[])],[state.personal,showingExamples,examples]);
  const groupEntries=useMemo(()=>state.groupEntry?[state.groupEntry,...groupExamples]:[],[state.groupEntry,groupExamples]);
  const entries=group?groupEntries:personalEntries;
  const constellationOn=step.id==='constellation-info'||step.id==='group-constellation';
  const statuses=useMemo(()=>group?groupTopicStatuses(entries):allTopicStatus(entries),[group,entries]);
  const activeTopic=group?'other':personalTopic;
  const topicLabel=DIARY_TOPICS.find(item=>item.id===activeTopic)?.label??'기타';
  const status=statuses.find(item=>item.topic===activeTopic)!;
  const template=status.levels[0].unlocked?status.levels[0].template:null;
  const members=useMemo(()=>template?selectMembers(entries,activeTopic,template.requiredPlanets):[],[entries,activeTopic,template]);
  const constellation:ConstellationRequest|null=constellationOn&&template?{template,memberIds:members.map(entry=>entry.id),color:TOPIC_CONCEPTS[activeTopic].color,
    insets:group?{
      top:Math.min(.4,(geometry.panelTop+8)/area.height),
      bottom:Math.min(.6,(layout.wide?geometry.toggleBottom+44:geometry.infoBottom+groupInfoHeight+12)/area.height),
      left:layout.wide?Math.min(.5,(geometry.infoLeft+geometry.infoWidth+16)/area.width):.04,right:.04,
    }:{top:.2,bottom:.22,left:area.width>850?.44:.04,right:.04}}:null;
  const currentEntry=entries.find(entry=>entry.id===state.selected);
  const navId=step.event==='write'?'diary':step.event==='groups'?'group':null;
  const groupQuest=step.id==='group-quest-info';
  const footer=group?geometry.toggleBottom:layout.navHeight+layout.navBottom+14;
  const field=step.id.includes('text')?'text':step.id.includes('photo')?'photos':step.id.includes('topic')?'topics':
    step.event==='private'||(step.id==='group-share'&&!state.shared)?'audience':step.event==='publish'?'submit':undefined;
  const profileButton=<View style={{position:'absolute',right:8,top:7}}>
    <Button label="내 프로필" onPress={()=>emit('profile')} active={step.event==='profile'} />
  </View>;
  return <View testID="tutorial-universe" style={styles.root}>
    <KeyboardAvoidingView style={styles.content} behavior={Platform.OS==='ios'?'padding':'height'}>
      <View testID={`tutorial-step-${step.id}`} style={[styles.content,{marginBottom:guideBarHeight}]} onLayout={event=>setArea(event.nativeEvent.layout)}>
        {writing?<DiaryWriteScreen diaryText={state.text} onChangeText={value=>dispatch({type:'text',value})}
          dateLabel="연습 일기 · 실제로 저장되지 않아요" photoCountLabel={`${state.photos.length}/5`}
          photos={state.photos} photoBusy={false} saving={false} highlight={field}
          onAddPhotos={()=>dispatch({type:'photos',value:[...state.photos,{id:`tutorial-photo-${++photoSequence.current}`,uri:samplePhoto.uri}]})}
          onRemovePhoto={id=>dispatch({type:'photos',value:state.photos.filter(photo=>photo.id!==id)})}
          groups={step.scene==='group-write'?[{id:TUTORIAL_GROUP_ID,name:TUTORIAL_GROUP_NAME}]:[]}
          selectedGroupIds={state.shared?[TUTORIAL_GROUP_ID]:[]}
          onSelectPrivate={()=>step.scene==='group-write'?dispatch({type:'share',value:false}):emit('private')}
          onToggleGroup={()=>dispatch({type:'share',value:!state.shared})}
          onBack={noop} onOpenHistory={noop} onSubmit={()=>emit('publish')}
          topics={DIARY_TOPICS} selectedTopic={state.topic} onToggleTopic={value=>dispatch({type:'topic',value:value as DiaryTopic})}
          hasBottomNav={false}/>:step.scene==='groups'?<GroupSpaceScreen scale={layout.scale}
            profileControl={profileButton}
            groups={[{id:TUTORIAL_GROUP_ID,name:TUTORIAL_GROUP_NAME,stars:groupExamples,members:TUTORIAL_MEMBERS}]}
            onSelectGroup={()=>emit('group')} onAddGroup={noop} onJoinByCode={noop}/>
          :step.scene==='profile'?<Panel title="연습 프로필">
            <View style={styles.avatar}>{sampleAvatar?<Image source={samplePhoto} style={styles.photo}/>:<Text style={styles.avatarText}>나</Text>}</View>
            <Button label="연습 사진으로 바꾸기" onPress={()=>setSampleAvatar(value=>!value)}/>
            <Text style={styles.body}>닉네임 · 최대 8자</Text>
            <TextInput accessibilityLabel="연습 닉네임" value={nickname} maxLength={8} onChangeText={setNickname} style={styles.input}/>
            <Text style={styles.body}>한 줄 소개 · 최대 20자</Text>
            <TextInput accessibilityLabel="연습 한 줄 소개" value={bio} maxLength={20} onChangeText={setBio} style={styles.input}/>
            <Text style={styles.muted}>실제 프로필은 바뀌지 않아요.</Text>
          </Panel>:step.scene==='settings'?<Panel title="메뉴 → 사용자 설정">
            <Text style={styles.body}>글자 크기 · 80~120%</Text>
            <View style={styles.row}><Button label="글자 줄이기" onPress={()=>setFontPercent(value=>Math.max(80,value-10))}/>
              <Text style={styles.body}>{fontPercent}%</Text><Button label="글자 키우기" onPress={()=>setFontPercent(value=>Math.min(120,value+10))}/></View>
            <Text style={[styles.body,{fontSize:18*fontPercent/100,lineHeight:28*fontPercent/100}]}>기록할수록 커지는 나만의 우주</Text>
            <Text style={styles.body}>우주 조작 민감도 · {sensitivity.toFixed(1)}×</Text>
            <View style={styles.row}><Button label="민감도 줄이기" onPress={()=>setSensitivity(value=>Math.max(.1,Math.round((value-.1)*10)/10))}/>
              <Button label="민감도 키우기" onPress={()=>setSensitivity(value=>Math.min(1.5,Math.round((value+.1)*10)/10))}/></View>
            <Text style={styles.muted}>연습 값이에요. 실제 설정은 유지돼요.</Text>
          </Panel>:<>
            <UniverseCanvas entries={entries} sceneKey={`tutorial-${sceneId.replace(/:/g,'-')}:${group?'group':'home'}`}
              selectedEntryId={state.selected??undefined} onStarPress={id=>emit('read',id)} onStarPositionChange={setAnchor}
              unreadIds={group?state.unread:step.id==='read-star'&&state.personal?[state.personal.id]:[]}
              constellation={constellation}/>
            {group?<GroupUniverseHeader name={TUTORIAL_GROUP_NAME} layout={layout} geometry={geometry}
              onBack={noop} onReadAll={()=>emit('read-all')} onMembers={()=>emit('members')} unread={state.groupEntry?state.unread.length:0}
              membersOpen={step.id==='group-members-info'} highlight={step.event==='read-all'?'read-all':step.event==='members'?'members':undefined}/>
              :<HomeHud scale={layout.scale} menuVisible={false} highlight={step.event==='quest'?'quest':step.event==='settings'?'menu':undefined} onToggleMenu={()=>emit('settings')} onCloseMenu={noop}
              starCount={entries.length} coinCount={0} checkCount={state.personal?1:0} onStats={noop} onQuest={()=>emit('quest')}
              menuProps={{onSearch:noop,onCalendar:noop,onLogout:noop,sensitivity:1,onSensitivity:noop}}/>}
            {!group&&!personalEntries.length&&<View pointerEvents="none" style={styles.empty}><Text style={styles.muted}>아직 별이 없어요. 첫 이야기를 기록해보세요.</Text></View>}
            {constellationOn?<View onLayout={group?event=>setGroupInfoHeight(event.nativeEvent.layout.height):undefined}
              style={[styles.constellation,{bottom:group?geometry.infoBottom:footer,left:group?geometry.infoLeft:12,width:group?geometry.infoWidth:Math.min(410,area.width-24),maxHeight:Math.min(area.height*.43,360*layout.scale)},group&&{backgroundColor:'transparent',borderRadius:0}]}>
              <ScrollView><ConstellationPanel scale={Math.min(layout.scale,1)} intro={group?'용사 · 기타 예시 별 15개':`${topicLabel} · 내가 쓴 별 1개 + 예시 별 4개`}
                statuses={statuses} topic={activeTopic} templateId={template?.id??null} members={members.map(entry=>({id:entry.id,createdAt:entry.createdAt,color:entry.color}))}
                collapsed={false} onToggleCollapsed={noop} onSelectTopic={noop} onSelectTemplate={noop} onOpenEntry={noop}/></ScrollView>
            </View>:!group&&step.id==='constellation'&&<View style={[styles.shortcut,{bottom:footer}]}>
              <ConstellationModeToggle scale={layout.scale} active={false} highlightConstellation onChange={()=>emit('constellation')}/>
            </View>}
            {group&&<View pointerEvents="box-none" style={{position:'absolute',bottom:geometry.toggleBottom,left:layout.chromeLeft,width:layout.chromeWidth,alignItems:'center'}}>
              <ConstellationModeToggle scale={layout.scale} active={constellationOn} universeLabel="그룹 우주" onChange={noop}/>
            </View>}
            {step.event==='read'&&<View style={[styles.shortcut,{bottom:footer+12}]}>
              <Button active label={group?'멤버의 새 별 열기':'연습 별 열기'} onPress={()=>emit('read',group?state.unread[0]:state.personal?.id)}/>
            </View>}
            {currentEntry&&closedPopup!==currentEntry.id&&<StarDiaryPopup entry={currentEntry}
              anchor={anchor?.id===currentEntry.id?anchor:{id:currentEntry.id,x:area.width/2,y:area.height*.55,radius:14,visible:true}}
              viewport={{...area,topInset:group?geometry.panelTop+4*layout.scale:layout.headerTop+layout.hudHeight+12,bottomInset:group?geometry.popupBottom:footer}}
              groupId={group?TUTORIAL_GROUP_ID:undefined} author={group?{nickname:TUTORIAL_MEMBERS.find(member=>member.id===currentEntry.authorId)?.name??'친구'}:undefined}
              owned={false} editable={false} onClose={()=>setClosedPopup(currentEntry.id)} onEdit={noop} onDecorate={noop}
              reaction={<Text style={{color:'#fff',fontSize:14}}>♡ 0</Text>}/>
            }
            {step.id==='main-quest-info'&&<Panel title="오늘의 별 띄우기">
              <Text style={styles.body}>일기 한 편 남기기 · 1/1</Text><View style={styles.progress}><View style={styles.progressFill}/></View>
              <Text style={styles.body}>오늘의 임무 완료 ✓</Text>
            </Panel>}
            {step.id==='group-members-info'&&<GroupMembersPanel scale={layout.scale}
              left={layout.chromeLeft+layout.chromeWidth-geometry.panelWidth-10*layout.scale} top={geometry.panelTop} width={geometry.panelWidth} height={geometry.panelHeight}
              code="TUTORIAL" members={TUTORIAL_MEMBERS.map(member=>({user_id:member.id,nickname:member.name,bio:'함께 기록해요',avatar_url:null}))}>
              <Text style={styles.muted}>연습 그룹 · 실제 참여에는 사용할 수 없어요.</Text>
            </GroupMembersPanel>}
            {group&&step.id!=='group-members-info'&&<GroupQuestDrawer scale={layout.scale} open={groupQuest}
              top={geometry.panelTop} right={Math.max(0,width-layout.navLeft-layout.navWidth)} width={geometry.questPanelWidth} height={geometry.panelHeight}
              quest={{id:'tutorial-quest',day:'연습',title:'함께 오늘의 별 띄우기',completed:3,total:3,done:true}}
              error={null} onToggle={()=>emit('quest')} onClose={noop} onRetry={noop}/>
            }
            {group&&<GroupChatFrame left={geometry.chatLeft} width={geometry.chatWidth} bottom={geometry.chatBottom} scale={layout.scale}
              expanded={chatExpanded} unread={0} onToggle={()=>emit('chat-open')} history={<ScrollView style={{height:geometry.chatHistoryHeight}} contentContainerStyle={{gap:16*layout.scale,padding:12*layout.scale}}>
                {state.messages.length?state.messages.map(message=><View key={message.id} style={{flexDirection:'row',gap:18*layout.scale,alignItems:'center',minHeight:40}} accessibilityLabel={message.name}>
                  <View style={{width:40*layout.scale,height:40*layout.scale,borderRadius:20*layout.scale,backgroundColor:'#d9d9d9'}}/>
                  <Text style={{flex:1,minWidth:0,color:'#fff',fontSize:13*layout.scale,lineHeight:21*layout.scale,paddingRight:10}}>{message.body}</Text>
                </View>):<Text style={{color:'#dddde8',fontSize:11,padding:10,textAlign:'center'}}>첫 이야기를 나눠보세요.</Text>}
              </ScrollView>}>
                <TextInput accessibilityLabel="연습 채팅 입력" placeholder="입력하세요" placeholderTextColor="#bbb" value={state.chat}
                  editable={step.id==='chat-send'} onChangeText={value=>dispatch({type:'chat',value})} maxLength={2000}
                  style={{flex:1,minWidth:0,minHeight:44,paddingVertical:16,paddingHorizontal:24*layout.scale,fontSize:13*layout.scale,color:'#fff'}}/>
                <Pressable accessibilityRole="button" accessibilityLabel="메시지 보내기" disabled={!state.chat.trim()} onPress={()=>emit('chat-send')}
                  style={{width:48*layout.scale,minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'}}><GroupSendIcon size={27*layout.scale}/></Pressable>
            </GroupChatFrame>}
          </>}
        {!writing&&step.scene!=='settings'&&step.scene!=='profile'&&(!group||step.id==='group-write')&&<>
          <UniverseBottomNav activeScreen={group||step.scene==='groups'?'group':'home'} highlight={navId??undefined} onDiary={()=>emit('write')} onHome={noop} onGroup={()=>emit('groups')}/>
        </>}
      </View>
      {!guideOpen&&<View testID="tutorial-guide-controls" pointerEvents="box-none" style={[styles.guideControls,{bottom:insets.bottom+4}]}>
        <Button compact label="설명 보기" onPress={()=>{Keyboard.dismiss();setHiddenGuideStep(null);}}/>
        {hasNext&&<Button compact label={step.event==='finish'?'완료':'다음'} active disabled={!tutorialCanAdvance(state)} onPress={advance}/>}
        <Button compact label="종료하기" onPress={quit}/>
      </View>}
    </KeyboardAvoidingView>
    {guideOpen&&<View testID="tutorial-guide-overlay" style={styles.guideOverlay}>
      <View pointerEvents="none" style={styles.guideBackdrop}/>
      <View testID="tutorial-guide-dialog" accessibilityViewIsModal role="dialog" aria-modal
        accessibilityLabel={step.title} style={[styles.guide,{maxHeight:Math.max(120,height-insets.top-insets.bottom-48)}]}>
        <View style={styles.guideHeading}>
          <Text style={styles.badge}>연습용 우주 · {state.step+1}/{TUTORIAL_STEPS.length}</Text>
          <Button label="종료하기" onPress={quit}/>
        </View>
        <ScrollView style={{flexGrow:0,flexShrink:1,maxHeight:Math.min(240,height*.32)}} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12}} accessibilityLiveRegion="polite">
          <Text accessibilityRole="header" style={styles.guideTitle}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
        </ScrollView>
        <View style={styles.guideActions}>
          <Button label={step.event==='finish'?'나의 우주로 돌아가기':'다음'} active onPress={guideNext}/>
        </View>
      </View>
    </View>}
  </View>;
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#000'},content:{flex:1,minHeight:0},
  guideOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:100,alignItems:'center',justifyContent:'center',padding:20},
  guideBackdrop:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.16)'},
  guide:{width:'100%',maxWidth:480,backgroundColor:'rgba(20,25,39,0.82)',borderWidth:1,borderColor:'rgba(246,216,121,0.65)',borderRadius:18,padding:24,gap:20},
  guideControls:{position:'absolute',alignSelf:'center',zIndex:100,flexDirection:'row',gap:6,maxWidth:'96%',borderRadius:10,backgroundColor:'rgba(12,16,26,0.65)',padding:4},
  guideHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},badge:{color:'#f6d879',fontSize:12,lineHeight:18,flexShrink:1},
  guideTitle:{color:'#fff',fontSize:23,lineHeight:33,fontWeight:'bold'},guideActions:{flexDirection:'row',justifyContent:'flex-end',gap:10,flexWrap:'wrap'},
  body:{color:'#eee',fontSize:15,lineHeight:24},muted:{color:'#b9c0d1',fontSize:13,lineHeight:21},
  button:{minHeight:44,borderWidth:1,borderColor:'#697187',paddingHorizontal:14,paddingVertical:8,justifyContent:'center',alignItems:'center',borderRadius:6,backgroundColor:'#1e2434'},
  buttonText:{color:'#fff',fontSize:14,lineHeight:22},target:{borderWidth:2,borderColor:'#f6d879',borderRadius:6},disabled:{opacity:.4},
  row:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  panel:{position:'absolute',alignSelf:'center',top:'22%',width:'88%',maxWidth:440,maxHeight:'63%',backgroundColor:'#20232e',borderWidth:1,borderColor:'#d5d9e7',padding:18,borderRadius:12,zIndex:12,gap:14},
  panelTitle:{color:'#fff',fontSize:22,lineHeight:30,fontWeight:'bold'},panelBody:{gap:14,paddingBottom:10},
  shortcut:{position:'absolute',alignSelf:'center',zIndex:9},empty:{position:'absolute',top:'48%',alignSelf:'center',padding:20},
  constellation:{position:'absolute',zIndex:8,backgroundColor:'#141823ed',borderRadius:8},
  progress:{height:8,backgroundColor:'#414752',borderRadius:4},progressFill:{width:'100%',height:8,backgroundColor:'#f6d879',borderRadius:4},
  input:{minHeight:44,borderWidth:1,borderColor:'#81899c',padding:10,color:'#fff',fontSize:16,backgroundColor:'#090c14'},
  avatar:{width:88,height:88,borderRadius:44,overflow:'hidden',backgroundColor:'#36415d',alignItems:'center',justifyContent:'center'},
  avatarText:{fontSize:30,lineHeight:40,color:'#fff'},photo:{width:88,height:88},
});
