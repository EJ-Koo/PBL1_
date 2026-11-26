import type { DiaryEntry } from '@/store/diary-context';
import type { DiaryTopic } from './special-planet';

export type TutorialScene = 'home' | 'write' | 'groups' | 'group' | 'group-write' | 'profile' | 'settings';
type Step = { id: string; scene: TutorialScene; title: string; body: string; event: string; requires?: 'text' | 'topic'; };
export const TUTORIAL_STEPS: readonly Step[] = [
  {id:'welcome',scene:'home',title:'당신의 우주에 오신 걸 환영해요',body:'직접 눌러보며 오늘의 별일을 알아볼까요? 여기는 연습용 우주예요. 일기·사진·채팅은 실제 계정에 저장되지 않아요.',event:'next'},
  {id:'open-diary',scene:'home',title:'첫 번째 별을 만들어볼까요?',body:'강조된 하단 왼쪽 일기 쓰기 버튼을 눌러주세요.',event:'write'},
  {id:'write-intro',scene:'write',title:'여기서 일기를 쓸 수 있어요',body:'오늘은 어떤 별일이 있었나요? 짧은 이야기부터 시작해도 괜찮아요.',event:'next'},
  {id:'write-text',scene:'write',title:'오늘의 이야기를 적어주세요',body:'일기 칸에 한 줄 이상 적은 뒤 다음을 눌러주세요. 연습한 글은 종료하면 사라져요.',event:'next',requires:'text'},
  {id:'write-photo',scene:'write',title:'오늘의 장면도 남길 수 있어요',body:'사진 추가를 누르면 연습 사진이 붙어요. 사진은 선택 사항이니 첨부하지 않고 다음으로 넘어가도 돼요.',event:'next'},
  {id:'write-topic',scene:'write',title:'일기의 주제를 골라주세요',body:'여행·인간관계·학업·일상처럼 오늘 이야기와 어울리는 주제를 눌러주세요. 선택하지 않은 실제 일기는 기타로 분류돼요.',event:'next',requires:'topic'},
  {id:'private',scene:'write',title:'처음에는 나만의 기록으로',body:'비공개를 눌러주세요. 그룹을 선택하지 않으면 나만 볼 수 있는 일기가 돼요.',event:'private'},
  {id:'publish',scene:'write',title:'오늘의 별을 띄워주세요',body:'오늘의 별 띄우기를 눌러 연습 우주에 별을 만들어보세요. 실제 저장은 일어나지 않아요.',event:'publish'},
  {id:'read-star',scene:'home',title:'방금 만든 별을 눌러보세요',body:'빛나는 행성을 누르면 그날의 기록을 읽을 수 있어요. 화면 아래 연습 별 열기 버튼으로도 열 수 있어요.',event:'read'},
  {id:'recorded',scene:'home',title:'기록할수록 커지는 나만의 우주',body:'이렇게 기록을 하여 별을 늘려보세요! 실제 행성의 색과 모습은 기록의 감정에 따라 달라져요. 지금은 연습 모습이에요.',event:'next'},
  {id:'main-quest',scene:'home',title:'오늘의 퀘스트도 확인해볼까요?',body:'상단 오른쪽 Quest를 눌러주세요.',event:'quest'},
  {id:'main-quest-info',scene:'home',title:'기록하는 습관을 만드는 작은 임무',body:'실제 우주에서는 일기를 쓰면 오늘의 퀘스트 진행률과 보상이 반영돼요.',event:'next'},
  {id:'constellation',scene:'home',title:'별들을 이어볼까요?',body:'별자리 보기를 눌러주세요. 방금 고른 주제의 예시 별 4개를 더해, 내가 쓴 별과 함께 별자리를 만들어요.',event:'constellation'},
  {id:'constellation-info',scene:'home',title:'같은 주제의 기록이 별자리가 돼요',body:'개인 별자리는 같은 주제의 별 5·10·20개부터 볼 수 있어요. 주제와 단계별로 다른 모양을 만나보세요.',event:'next'},
  {id:'group-intro',scene:'home',title:'친구들이 그룹에 초대했어요',body:'친구들이 ‘용사’ 그룹에 초대했어요. 함께 만드는 우주로 가볼까요?',event:'next'},
  {id:'open-groups',scene:'home',title:'그룹으로 이동해요',body:'강조된 하단 오른쪽 그룹 버튼을 눌러주세요.',event:'groups'},
  {id:'open-group',scene:'groups',title:'용사 그룹을 열어주세요',body:'용사 카드를 눌러 들어가세요. 실제 그룹을 만들거나 참여하지 않아요.',event:'group'},
  {id:'group-members',scene:'group',title:'함께하는 사람들',body:'오른쪽 멤버 버튼을 눌러주세요. 여기에서 멤버와 그룹 코드를 확인할 수 있어요.',event:'members'},
  {id:'group-members-info',scene:'group',title:'나와 멤버들이 함께하는 공간',body:'지금은 임시 멤버들이에요. 실제로는 그룹 코드를 공유해 친구와 함께 기록할 수 있어요.',event:'next'},
  {id:'group-write',scene:'group',title:'그룹에도 일기를 공유해볼까요?',body:'하단 왼쪽 일기 쓰기를 눌러주세요. 이번에는 용사 그룹에 공유할 거예요.',event:'write'},
  {id:'group-share',scene:'group-write',title:'공유할 그룹을 선택해주세요',body:'비공개 옆 ‘용사’를 선택한 뒤 오늘의 별 띄우기를 눌러주세요. 실제 일기도 선택한 그룹에만 공유돼요.',event:'publish'},
  {id:'group-read',scene:'group',title:'멤버의 새로운 별이 도착했어요',body:'빛나는 멤버의 별을 하나 눌러 읽어보세요. 읽으면 그 별의 미확인 강조가 사라져요.',event:'read'},
  {id:'group-read-info',scene:'group',title:'읽은 별은 강조가 사라져요',body:'별마다 직접 눌러 기록을 읽을 수 있어요. 다음에는 남은 새 별을 한 번에 읽음 처리해볼게요.',event:'next'},
  {id:'group-read-all',scene:'group',title:'나머지도 모두 읽음으로',body:'상단 모두 읽음을 눌러 남은 별의 강조를 지워보세요.',event:'read-all'},
  {id:'group-quest',scene:'group',title:'함께 달성하는 퀘스트',body:'오른쪽 그룹 Quest 버튼을 눌러주세요.',event:'quest'},
  {id:'group-quest-info',scene:'group',title:'오늘 함께 기록한 사람은 몇 명일까요?',body:'그룹 멤버들의 오늘 작성 진행률을 볼 수 있어요. 그룹 퀘스트 보상은 아직 준비 중이에요.',event:'next'},
  {id:'group-constellation',scene:'group',title:'그룹에서도 별자리를 볼 수 있어요',body:'각 사람이 고른 주제대로 별을 모아요. 그룹 별자리는 같은 주제의 별 15·30·60개로 더 크게 만들어져요.',event:'next'},
  {id:'chat-open',scene:'group',title:'그룹톡에서 이야기해요',body:'아래 입력창 위 펼치기를 눌러주세요. 접혀 있을 때는 최근 채팅을 따로 보여주지 않아요.',event:'chat-open'},
  {id:'chat-send',scene:'group',title:'멤버들에게 인사해보세요',body:'입력창에 안녕 같은 짧은 인사를 적고 보내기를 눌러주세요. 연습 채팅만 표시돼요.',event:'chat-send'},
  {id:'chat-welcome',scene:'group',title:'오늘의 별일에 온 걸 환영해요!',body:'연습 멤버들의 환영 인사예요. 실제 그룹에서는 멤버들과 채팅으로 이야기를 나눌 수 있어요.',event:'next'},
  {id:'profile-open',scene:'groups',title:'나를 소개하는 프로필',body:'오른쪽 위 내 프로필을 눌러주세요.',event:'profile'},
  {id:'profile-info',scene:'profile',title:'이름과 사진으로 나를 표현해요',body:'지금은 임시 프로필이에요. 실제 프로필은 그룹 목록 오른쪽 위에서 사진·닉네임·한 줄 소개를 수정할 수 있어요.',event:'next'},
  {id:'settings-open',scene:'home',title:'나에게 편한 화면으로',body:'왼쪽 위 메뉴를 눌러주세요.',event:'settings'},
  {id:'settings-info',scene:'settings',title:'글자 크기와 조작 민감도',body:'버튼으로 크기와 민감도를 연습해보세요. 연습 값은 실제 설정에 저장하지 않아요. 실제 메뉴 → 사용자 설정에서 바꿀 수 있어요.',event:'next'},
  {id:'finish',scene:'home',title:'이제 나만의 별일을 기록해보세요',body:'연습을 마쳤어요! 연습 글·사진·그룹·채팅은 모두 사라지고 원래 우주로 돌아가요. 메뉴에서 언제든 다시 시작할 수 있어요.',event:'finish'},
];

export const TUTORIAL_GROUP_ID = 'tutorial-group';
export const TUTORIAL_GROUP_NAME = '용사';
export const TUTORIAL_MEMBERS = [
  {id:'tutorial-me',name:'나',color:'#ffffff',completed:false,known:true},
  {id:'tutorial-member-1',name:'멤버 1',color:'#7ad9e8',completed:true,known:true},
  {id:'tutorial-member-2',name:'멤버 2',color:'#f5cf68',completed:true,known:true},
];
export const tutorialStorageKey = (user: string) => `tutorial:v1:${encodeURIComponent(user)}`;
export function hasSeenTutorial(raw: string | null) { return raw === 'started' || raw === 'dismissed' || raw === 'completed'; }
const COLORS = ['#7ad9e8','#f5cf68','#b8a1e8','#ea9cac','#8acbb4'];
const STORIES = [
  '산책하다 작은 꽃을 발견했다.\n잠깐 멈춰 바라보니 마음이 편안해졌다.',
  '오랜만에 친구와 이야기를 나눴다.\n함께 웃었던 순간을 오래 기억하고 싶다.',
  '미뤘던 일을 하나 끝냈다.\n작은 진전이지만 스스로가 대견했다.',
  '따뜻한 차를 마시며 쉬었다.\n오늘은 천천히 보내도 괜찮았다.',
  '새로운 음악을 발견했다.\n집으로 돌아오는 길이 조금 더 즐거웠다.',
];
export function practiceEntry(id: string, text: string, topic: DiaryTopic, index: number, author = 'tutorial-me'): DiaryEntry {
  const color=COLORS[index % COLORS.length];
  const angle=index*2.399963;
  const radius=index===0?0:1+Math.sqrt(index)*.58;
  return {id,authorId:author,text,photoUri:null,photos:[],visibility:author==='tutorial-me'?'private':'friends',
    createdAt:Date.UTC(2026,0,1)+index*86400000,color,brightness:1,
    position:[Math.cos(angle)*radius,Math.sin(angle)*radius*.65,Math.sin(index*1.7)*.9],
    topic,topicAvailable:true,effect:null,surface:null,
    planet:{version:'tutorial',state:'clear',primary:{group:'practice',name:'practice',label:'연습 모습',score:.8,passed:true},none_prob:0,
      base_color:color,tone_color:color,accents:[],pattern:index%2?'bands':'soft',turbulence:.35,glow:.4,
      ring:{visible:false,color:null},atmosphere:{visible:true,color},valence:.5}};
}
const TOPIC_STORIES:Record<DiaryTopic,readonly string[]> = {
  travel:['낯선 골목을 걸으며 작은 가게를 발견했다.\n여행지에서 만난 풍경을 오래 기억하고 싶다.','기차 창밖으로 바다가 보였다.\n새로운 곳으로 향하는 길이 설렜다.','지도 없이 천천히 동네를 둘러봤다.\n뜻밖의 장소를 발견해 즐거웠다.','여행 사진을 정리했다.\n그때의 공기와 풍경이 다시 떠올랐다.'],
  relationship:['친구와 오랜만에 긴 통화를 했다.\n서로의 이야기를 들으니 마음이 가까워졌다.','가족과 함께 저녁을 먹었다.\n소소한 대화가 하루를 따뜻하게 만들었다.','도와준 친구에게 고맙다고 말했다.\n마음을 전하고 나니 기분이 좋았다.','친구와 있었던 오해를 풀었다.\n차분하게 이야기하니 서로를 이해할 수 있었다.'],
  study_achievement:['어려웠던 문제를 다시 풀어봤다.\n혼자 해결해서 조금 자신감이 생겼다.','발표 준비를 끝냈다.\n연습한 만큼 차분하게 해보고 싶다.','오늘 계획한 공부를 마쳤다.\n조금씩 쌓이는 노력이 뿌듯했다.','새로 배운 내용을 노트에 정리했다.\n막연했던 개념이 조금 선명해졌다.'],
  rest_daily:['따뜻한 차를 마시며 쉬었다.\n오늘은 천천히 보내도 괜찮았다.','집 근처를 가볍게 산책했다.\n익숙한 풍경을 보며 마음을 쉬게 했다.','좋아하는 음악을 들으며 방을 정리했다.\n평범한 하루가 한결 편안해졌다.','일찍 불을 끄고 휴식을 취했다.\n나를 돌보는 시간을 가져서 좋았다.'],
  challenge_activity:['처음으로 새로운 운동을 해봤다.\n서툴렀지만 시작한 것만으로도 뿌듯했다.','미뤄두었던 달리기에 나섰다.\n작은 목표를 지켜 기분이 좋았다.','새로운 취미 수업에 참여했다.\n낯선 경험이 하루에 활력을 줬다.','직접 만들고 싶었던 것에 도전했다.\n완벽하지 않아도 즐거운 시간이었다.'],
  other:STORIES.slice(0,4),
};
export const personalPracticeStars = (topic:DiaryTopic) => TOPIC_STORIES[topic].map((text,i)=>practiceEntry(`tutorial-example-${i}`,text,topic,i+1));
export const groupPracticeStars = () => Array.from({length:15},(_,i)=>practiceEntry(`tutorial-group-example-${i}`,STORIES[i%STORIES.length],'other',i+1,`tutorial-member-${i%2+1}`));
export type TutorialState = {
  step: number; text: string; topic: DiaryTopic | null; photos: {id:string;uri:string}[];
  shared: boolean; personal: DiaryEntry | null; groupEntry: DiaryEntry | null;
  unread: string[]; selected: string | null; chat: string; messages: {id:string;name:string;body:string}[];
};
export function createTutorialState(): TutorialState {
  return {step:0,text:'',topic:null,photos:[],shared:false,personal:null,groupEntry:null,
    unread:groupPracticeStars().map(entry=>entry.id),selected:null,chat:'',messages:[]};
}
export type TutorialAction = {type:'text';value:string}|{type:'topic';value:DiaryTopic}|{type:'photos';value:TutorialState['photos']}|
  {type:'chat';value:string}|{type:'share';value:boolean}|{type:'event';event:string;id?:string;stepId?:string};
export function tutorialCanAdvance(state:TutorialState) {
  const step=TUTORIAL_STEPS[state.step];
  return step.requires==='text'?!!state.text.trim():step.requires==='topic'?state.topic!==null:true;
}
export function reduceTutorial(state:TutorialState,action:TutorialAction):TutorialState {
  if(action.type==='text')return {...state,text:action.value};
  if(action.type==='topic')return {...state,topic:action.value};
  if(action.type==='photos')return {...state,photos:action.value.slice(0,5)};
  if(action.type==='chat')return {...state,chat:action.value};
  if(action.type==='share')return TUTORIAL_STEPS[state.step].scene==='group-write'?{...state,shared:action.value}:state;
  const step=TUTORIAL_STEPS[state.step];
  if(action.stepId && action.stepId!==step.id)return state;
  if(action.event!==step.event||!tutorialCanAdvance(state)||step.event==='finish')return state;
  let next:TutorialState={...state,step:state.step+1,selected:null};
  if(action.event==='publish') {
    if(!state.text.trim()||!state.topic||(step.scene==='group-write'&&!state.shared))return state;
    const group=step.scene==='group-write';
    const entry={...practiceEntry(group?'tutorial-shared':'tutorial-diary',state.text.trim(),state.topic,0),
      photos:state.photos,photoUri:state.photos[0]?.uri??null,visibility:group?'friends' as const:'private' as const};
    next=group?{...next,groupEntry:entry}:{...next,personal:entry};
  }
  if(step.id==='group-write')next={...next,text:state.personal?.text??'',photos:state.personal?.photos??[],topic:state.personal?.topic??null,shared:false};
  if(action.event==='read') {
    if(step.scene==='home'&&action.id!==state.personal?.id)return state;
    if(step.scene==='group'&&!state.unread.includes(action.id??''))return state;
    next.selected=action.id??null;next.unread=state.unread.filter(id=>id!==action.id);
  }
  if(action.event==='read-all')next.unread=[];
  if(action.event==='chat-send') {
    if(!state.chat.trim())return state;
    next={...next,chat:'',messages:[{id:'tutorial-chat-me',name:'나',body:state.chat.trim()},
      {id:'tutorial-chat-1',name:'멤버 1',body:'오늘의 별일에 온 걸 환영해!'},
      {id:'tutorial-chat-2',name:'멤버 2',body:'우리 함께 멋진 우주를 만들어보자!'}]};
  }
  return next;
}
