import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {groupStarAuthor,groupMemberEntries,memberUnreadIds} from '../src/lib/group-member-records.ts';
import {allTopicStatus,groupTopicStatuses,selectMembers} from '../src/lib/constellation.ts';
import {groupTopicHealth} from '../src/lib/group-topic-health.ts';

const jsx=(type,props)=>({type,props:props??{}});
function compile(path,require){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require});return exports;}
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const pure=name=>{throw Error(name);};
const {getResponsiveLayout}=compile('../src/lib/responsive-layout.ts',pure);
const {groupUniverseLayout}=compile('../src/lib/group-universe-layout.ts',pure);

test('member filtering uses stable IDs, never a duplicated nickname or a missing author',()=>{
  const rows=[{id:'1',authorId:'a',nickname:'same'},{id:'2',authorId:'b',nickname:'same'},{id:'3',authorId:'',nickname:'same'}];
  assert.deepEqual(groupMemberEntries(rows,'a').map(row=>row.id),['1']);
  assert.deepEqual(groupMemberEntries(rows,null),rows);
  assert.deepEqual(groupMemberEntries(rows,'unknown'),[]);
  assert.deepEqual(groupStarAuthor({author_id:'a'}),{authorId:'a',authorAvailable:true});
  assert.deepEqual(groupStarAuthor({}),{authorId:'',authorAvailable:false});
  assert.deepEqual(groupStarAuthor({author_id:null}),{authorId:'',authorAvailable:false});
  assert.deepEqual(memberUnreadIds(groupMemberEntries(rows,'a'),['1','2','3']),['1']);
});

function fixture(width=1440,oldServer=false){
  const entries=Array.from({length:30},(_,i)=>({id:String(i),authorId:oldServer?'':i<15?'a':'b',authorAvailable:!oldServer,topic:'travel',topicAvailable:true,text:'shared',createdAt:i,color:'#fff'}));
  const slots=[],reads=[];let cursor=0,selected=null;
  const react={useMemo:fn=>fn(),useEffect(){},useCallback:fn=>fn,
    useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];},
    useRef:initial=>{const index=cursor++;return slots[index]??(slots[index]={current:initial});}};
  const members=[{user_id:'a',nickname:'same',avatar_url:null,bio:''},{user_id:'b',nickname:'same',avatar_url:null,bio:''}];
  const hook=compile('../src/hooks/use-group-constellation.ts',name=>name==='react'?react:name==='@/lib/constellation'?{allTopicStatus,groupTopicStatuses,selectMembers}:pure(name));
  const names={
    '@/components/app-scroll-view':['ScrollView'],'@/components/app-text':['Text'],'@/components/diary-universe':['DiaryUniverse'],
    '@/components/group-chat-dock':['GroupChatDock'],'@/components/group-quest-drawer':['GroupQuestDrawer'],
    '@/components/ui/group-universe-panels':['GroupMembersPanel'],'@/components/ui/group-member-records-panel':['GroupMemberRecordsPanel'],
    '@/components/ui/group-universe-header':['GroupUniverseHeader'],'@/components/ui/space-ui':['SpaceButton'],
    '@/components/ui/constellation-panel':['ConstellationModeToggle','ConstellationPanel'],
  };
  const {GroupExperience}=compile('../src/components/group-experience.tsx',name=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if(name==='react-native')return {View:'View',Pressable:'Pressable',Platform:{OS:'web'},StyleSheet:{create:value=>value},useWindowDimensions:()=>({width,height:900})};
    if(names[name])return Object.fromEntries(names[name].map(value=>[value,value]));
    if(name==='@/hooks/use-group-constellation')return hook;
    if(name==='@/lib/group-member-records')return {groupMemberEntries,memberUnreadIds};
    if(name==='@/lib/group-topic-health')return {groupTopicHealth};
    if(name==='@/lib/group-universe-layout')return {groupUniverseLayout};
    if(name==='@/lib/constellation')return {TOPIC_CONCEPTS:{travel:{color:'#fff'}}};
    if(name==='@/hooks/use-group-social')return {useGroupSocial:()=>({data:{members,unread_diary_ids:entries.map(e=>e.id),diary_ids:entries.map(e=>e.id)},refresh(){},forgetUnread(){}})};
    if(name==='@/hooks/use-font-scale')return {useFontScale:()=>1};
    if(name==='@/hooks/use-responsive-layout')return {useResponsiveLayout:()=>getResponsiveLayout(width,900,{top:0,bottom:0,left:0,right:0})};
    if(name==='@/lib/auth-session')return {authSession:{getRevision:()=>1}};
    if(name==='@/store/diary-context')return {useDiary:()=>({accessToken:'test',profile:{user_id:'viewer'}})};
    if(name==='@/lib/language')return {useLanguage:()=>({t:(key,params={})=>key.replace(/\{(\w+)\}/g,(_,key)=>params[key])})};
    if(name==='@/lib/group-social-api')return {markDiaryRead:async(token,group,id)=>{reads.push(id);}};
    if(['@/lib/group-push','@/lib/notice','@/lib/push-device'].includes(name))return {};
    throw Error(name);
  });
  const render=()=>{cursor=0;return nodes(GroupExperience({group:{id:'g',name:'group',members},entries,loading:false,error:null,onReload(){},onBack(){},onLeave(){},leaving:false,selection:{id:selected,onChange:id=>{selected=id;}}}));};
  const find=type=>render().find(node=>node.type===type);
  return {render,find,reads};
}

for(const width of [390,1440])test(`member diaries, constellation, read-all and returning to the group remain scoped at ${width}px`,async()=>{
  const f=fixture(width);
  assert.equal(f.find('DiaryUniverse').props.entries.length,30);
  f.find('GroupUniverseHeader').props.onMembers();
  f.find('GroupMembersPanel').props.onReadMember({user_id:'a',nickname:'same'});
  let universe=f.find('DiaryUniverse');
  assert.equal(universe.props.entries.length,15);assert.ok(universe.props.entries.every(e=>e.authorId==='a'));
  assert.match(universe.props.sceneKey,/-author-a$/);
  assert.equal(f.reads.length,0,'Opening a member filter never marks a diary read');
  f.find('GroupMemberRecordsPanel').props.onConstellation();
  const panel=f.find('ConstellationPanel');
  assert.equal(panel.props.statuses.find(item=>item.topic==='travel').count,15);
  panel.props.onSelectTemplate(panel.props.statuses.find(item=>item.topic==='travel').levels[0].template);
  universe=f.find('DiaryUniverse');assert.equal(universe.props.constellation.memberIds.length,5);
  assert.ok(universe.props.constellation.memberIds.every(id=>Number(id)<15));
  f.find('ConstellationModeToggle').props.onChange(false);
  f.find('GroupMemberRecordsPanel').props.onOpen('1');
  assert.equal(f.find('DiaryUniverse').props.popupAnchorMode,'center');
  assert.ok(!f.find('GroupMemberRecordsPanel'),'The list closes while a diary is open');
  f.find('DiaryUniverse').props.selection.onChange(null);
  f.find('GroupUniverseHeader').props.onReadAll();
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(f.reads.length,15);assert.ok(f.reads.every(id=>Number(id)<15));
  f.find('GroupUniverseHeader').props.onBack();
  universe=f.find('DiaryUniverse');assert.equal(universe.props.entries.length,30);assert.doesNotMatch(universe.props.sceneKey,/-author-/);
  f.find('ConstellationModeToggle').props.onChange(true);
  assert.equal(f.find('ConstellationPanel').props.statuses.find(item=>item.topic==='travel').levels[0].template.requiredPlanets,15,'Whole-group thresholds stay unchanged');
});

test('an old server explicitly disables author browsing instead of guessing by nickname',()=>{
  const f=fixture(390,true);f.find('GroupUniverseHeader').props.onMembers();
  assert.equal(f.find('GroupMembersPanel').props.recordsUnavailable,true);
});
