import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const jsx=(type,props)=>({type,props:props??{}});
function compile(path,require){
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require});return exports;
}
const pureRequire=name=>{throw Error(`Unexpected runtime service: ${name}`);};
const {getResponsiveLayout}=compile('../src/lib/responsive-layout.ts',pureRequire);
const {groupUniverseLayout}=compile('../src/lib/group-universe-layout.ts',pureRequire);
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const uiRequire=name=>{
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
  if(name==='react')return {useState:initial=>[initial,()=>{}],useEffect(){}};
  if(name==='react-native')return {View:'View',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',Image:'Image',Platform:{OS:'web'},StyleSheet:{create:value=>value,absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}}};
  if(name==='@/components/app-text')return {Text:'Text'};
  if(name==='@/components/app-scroll-view')return {ScrollView:'ScrollView'};
  if(name==='@/constants/ui-design')return {DesignFonts:{regular:'font',bold:'font-bold'}};
  if(name==='@/lib/language')return {useLanguage:()=>({t:(value,params={})=>value.replace(/\{(\w+)\}/g,(_,key)=>params[key]??key)})};
  if(name==='@/hooks/use-font-scale')return {useFontScale:()=>1};
  if(name==='./group-profile-control')return {Avatar:'Avatar'};
  if(name==='./group-universe-decoration')return {GroupUniverseHeaderFrame:'GroupUniverseHeaderFrame',GroupUniverseIcon:'GroupUniverseIcon',GroupReadAllIcon:'GroupReadAllIcon',GroupChatChevron:'GroupChatChevron',GroupPanelFrame:'GroupPanelFrame'};
  throw Error(`Shared presentation must not import an account service: ${name}`);
};
const {GroupUniverseHeader}=compile('../src/components/ui/group-universe-header.tsx',uiRequire);
const {GroupChatFrame,GroupMembersPanel}=compile('../src/components/ui/group-universe-panels.tsx',uiRequire);

test('real and practice headers keep back left, read-all and members together right at phone/desktop/font sizes',()=>{
  for(const width of [320,390,768,1440])for(const font of [.8,1,1.2]){
    const layout=getResponsiveLayout(width,900,{top:0,left:0,right:0,bottom:0});
    const geometry=groupUniverseLayout(layout,font,900);
    let back=0,read=0,members=0;
    const tree=GroupUniverseHeader({name:'용사',layout,geometry,onBack:()=>back++,onReadAll:()=>read++,onMembers:()=>members++,unread:2});
    const all=nodes(tree),controls=all.find(node=>node.props.testID==='group-header-controls');
    assert.equal(controls.props.style[0].justifyContent,'space-between');
    assert.equal(controls.props.children[0].props.accessibilityLabel,'그룹으로 돌아가기');
    const right=controls.props.children[1];assert.equal(right.props.testID,'group-header-right-controls');
    assert.equal(right.props.style[0].flexDirection,'row');
    assert.equal(right.props.children[0].props.accessibilityLabel,'모두 읽음');
    assert.equal(right.props.children[1].props.accessibilityLabel,'그룹 멤버 목록');
    controls.props.children[0].props.onPress();right.props.children[0].props.onPress();right.props.children[1].props.onPress();
    assert.deepEqual([back,read,members],[1,1,1]);
    assert.ok(geometry.panelTop>geometry.controlsTop);
    assert.equal(geometry.chatLeft+geometry.chatWidth/2,layout.chromeLeft+layout.chromeWidth/2);
    const disabled=nodes(GroupUniverseHeader({name:'용사',layout,geometry,onBack(){},onReadAll(){},onMembers(){},unread:0})).find(node=>node.props.accessibilityLabel==='모두 읽음');
    assert.equal(disabled.props.disabled,true);
  }
});

test('shared chat preserves collapsed input-only design and invokes only the supplied toggle',()=>{
  let toggles=0;const props={left:20,bottom:24,width:320,scale:1,expanded:false,unread:2,onToggle:()=>toggles++,history:jsx('Messages',{}),children:jsx('Input',{})};
  const closed=GroupChatFrame(props),all=nodes(closed);
  assert.equal(all.some(node=>node.type==='Messages'),false);
  assert.equal(all.some(node=>node.type==='Input'),true);
  all.find(node=>node.props.accessibilityRole==='button').props.onPress();assert.equal(toggles,1);
  const open=nodes(GroupChatFrame({...props,expanded:true}));
  assert.equal(open.some(node=>node.type==='Messages'),true);
});

test('members use the same panel frame, code, avatars and geometry without any server hooks',()=>{
  const tree=GroupMembersPanel({left:600,top:140,width:236,height:488,scale:1,code:'TUTORIAL',members:[{user_id:'practice',nickname:'친구',bio:'안녕',avatar_url:null}]});
  assert.equal(tree.props.style.left,600);assert.equal(tree.props.style.top,140);
  const all=nodes(tree);assert.ok(all.some(node=>node.type==='GroupPanelFrame'));
  assert.ok(all.some(node=>node.type==='Avatar'));
  assert.ok(all.some(node=>node.props.children==='코드: TUTORIAL'));
});

test('practice diary popup overrides API heart while normal group popup retains it',()=>{
  const popupLayout=compile('../src/lib/star-popup-layout.ts',pureRequire);
  const {StarDiaryPopup}=compile('../src/components/ui/star-diary-popup.tsx',name=>{
    if(name==='@/lib/star-popup-layout')return popupLayout;
    if(name==='@/components/diary-heart')return {DiaryHeart:'ApiDiaryHeart'};
    if(name==='react-native-svg')return {__esModule:true,default:'Svg',Circle:'Circle',Path:'Path'};
    return uiRequire(name);
  });
  const props={entry:{id:'practice',authorId:'friend',text:'연습 글',createdAt:0,photos:[]},groupId:'practice-group',
    anchor:{id:'practice',x:450,y:450,radius:12,visible:true},viewport:{width:900,height:900,topInset:130,bottomInset:100},
    owned:false,editable:false,author:{nickname:'친구'},onClose(){},onEdit(){},onDecorate(){}};
  assert.ok(nodes(StarDiaryPopup(props)).some(node=>node.type==='ApiDiaryHeart'));
  const practice=nodes(StarDiaryPopup({...props,reaction:jsx('PracticeHeart',{})}));
  assert.ok(practice.some(node=>node.type==='PracticeHeart'));
  assert.ok(!practice.some(node=>node.type==='ApiDiaryHeart'));
});
