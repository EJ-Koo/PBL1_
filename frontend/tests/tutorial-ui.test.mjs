import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path,require){
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require});
  return exports;
}
const core=compile('../src/lib/tutorial.ts',name=>{throw Error(`Unexpected service: ${name}`);});
const responsive=compile('../src/lib/responsive-layout.ts',name=>{throw Error(name);});
function nodes(node){
  if(!node||typeof node!=='object')return [];
  if(Array.isArray(node))return node.flatMap(nodes);
  return [node,...nodes(node.props?.children)];
}
const jsx=(type,props)=>({type,props:props??{}});

function hostFixture(initialStorage=new Map(),getOverride){
  const slots=[],effects=[],writes=[];
  let cursor=0;
  const changed=(a,b)=>!a||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
  const react={
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
    useCallback(fn,deps){const index=cursor++;if(changed(slots[index]?.deps,deps))slots[index]={deps,fn};return slots[index].fn;},
    useEffect(fn,deps){const index=cursor++;if(changed(slots[index]?.deps,deps)){slots[index]?.cleanup?.();slots[index]={deps};effects.push(()=>{slots[index].cleanup=fn();});}},
  };
  const storage={getItem:key=>getOverride?getOverride(key):Promise.resolve(initialStorage.get(key)??null),
    setItem:async(key,value)=>{writes.push({key,value});initialStorage.set(key,value);}};
  const {TutorialHost}=compile('../src/components/tutorial-host.tsx',name=>{
    if(name==='react')return react;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='react-native')return {Modal:'Modal'};
    if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:storage};
    if(name==='@/lib/tutorial')return core;
    if(name==='./tutorial-universe')return {TutorialUniverse:'TutorialUniverse'};
    throw Error(name);
  });
  const render=props=>{cursor=0;const tree=TutorialHost(props);effects.splice(0).forEach(fn=>fn());return tree;};
  return {render,writes,storage:initialStorage};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('first visit auto-starts once; exit persists dismissal and manual replay starts a fresh run',async()=>{
  const f=hostFixture(),props={userId:'A',ready:true,autoEligible:true,request:0};
  assert.equal(f.render(props).props.visible,false);await settle();
  const active=f.render(props);assert.equal(active.props.visible,true);
  const firstId=active.props.children.props.sceneId;
  active.props.children.props.onExit(false);await settle();
  assert.equal(f.render(props).props.visible,false);
  assert.equal(f.storage.get(core.tutorialStorageKey('A')),'dismissed');
  f.render({...props,request:1});
  const replay=f.render({...props,request:1});assert.equal(replay.props.visible,true);
  assert.notEqual(replay.props.children.props.sceneId,firstId);
  replay.props.children.props.onExit(true);await settle();
  assert.equal(f.storage.get(core.tutorialStorageKey('A')),'completed');
  assert.ok(f.writes.every(write=>['started','dismissed','completed'].includes(write.value)));
});

test('stored completion and a stale replay counter never reopen the tutorial on remount',async()=>{
  const stored=new Map([[core.tutorialStorageKey('A'),'completed']]);
  const f=hostFixture(stored),props={userId:'A',ready:true,autoEligible:true,request:7};
  f.render(props);await settle();assert.equal(f.render(props).props.visible,false);
  assert.equal(f.writes.length,0);
});

test('account changes cancel a pending automatic start for the old account',async()=>{
  let resolveOld;
  const f=hostFixture(new Map(),key=>key===core.tutorialStorageKey('A')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve(null));
  f.render({userId:'A',ready:true,autoEligible:true,request:0});
  const props={userId:'B',ready:true,autoEligible:true,request:0};f.render(props);
  resolveOld(null);await settle();
  const tree=f.render(props);assert.equal(tree.props.visible,true);
  assert.ok(tree.props.children.props.sceneId.startsWith('B:'));
  assert.ok(!f.writes.some(write=>write.key===core.tutorialStorageKey('A')));
});

for(const width of [390,1440])test(`every practice step at width ${width} exposes exit without mounting account services`,()=>{
  let state=core.createTutorialState(),exits=0;
  let localSlots=[],localCursor=0;
  const native={View:'View',Pressable:'Pressable',Image:'Image',KeyboardAvoidingView:'KeyboardAvoidingView',
    Keyboard:{dismiss(){}},Platform:{OS:'web'},StyleSheet:{create:value=>value},useWindowDimensions:()=>({width,height:900})};
  const hooks={useState:initial=>{const index=localCursor++;if(!(index in localSlots))localSlots[index]=typeof initial==='function'?initial():initial;return [localSlots[index],value=>{localSlots[index]=typeof value==='function'?value(localSlots[index]):value;}];},
    useReducer:()=>[state,action=>{state=core.reduceTutorial(state,action);}],useRef:value=>({current:value}),
    useMemo:fn=>fn(),useEffect(){}};
  const require=name=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if(name==='react-native')return native;
    if(name==='react-native-safe-area-context')return {useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})};
    if(name==='expo-asset')return {Asset:{fromModule:()=>({uri:'/bundled-sample.png'})}};
    if(name.endsWith('.png'))return '/bundled-sample.png';
    if(name==='@/lib/tutorial')return core;
    if(name==='@/hooks/use-responsive-layout')return {useResponsiveLayout:()=>responsive.getResponsiveLayout(width,900,{top:0,bottom:0,left:0,right:0})};
    if(name==='@/lib/constellation')return {
      TOPIC_CONCEPTS:Object.fromEntries(['travel','relationship','study_achievement','rest_daily','challenge_activity','other'].map(topic=>[topic,{color:'#fff'}])),selectMembers:(entries,topic,count)=>entries.filter(e=>e.topic===topic).slice(0,count),
      allTopicStatus:()=>['travel','relationship','study_achievement','rest_daily','challenge_activity','other'].map(topic=>({topic,levels:[{unlocked:true,template:{requiredPlanets:5}}]})),
      groupTopicStatuses:()=>[{topic:'other',levels:[{unlocked:true,template:{requiredPlanets:15}}]}],
    };
    if(name==='@/lib/special-planet')return {DIARY_TOPICS:[{id:'other',label:'기타'}]};
    const components={
      '@/components/app-text':['Text','TextInput'],'@/components/app-scroll-view':['ScrollView'],
      '@/components/universe-scene':['UniverseCanvas'],'@/components/ui/diary-write-screen':['DiaryWriteScreen'],
      '@/components/ui/home-hud':['HomeHud'],'@/components/ui/universe-bottom-nav':['UniverseBottomNav'],
      '@/components/ui/group-space-screen':['GroupSpaceScreen'],'@/components/ui/constellation-panel':['ConstellationModeToggle','ConstellationPanel'],
      '@/components/group-quest-drawer':['GroupQuestDrawer'],
    };
    if(components[name])return Object.fromEntries(components[name].map(name=>[name,name]));
    throw Error(`Practice UI attempted to import a non-presentation service: ${name}`);
  };
  const {TutorialUniverse}=compile('../src/components/tutorial-universe.tsx',require);
  const render=()=>{localCursor=0;return TutorialUniverse({sceneId:'account:run',onExit:completed=>{assert.equal(completed,false);exits++;}});};
  for(let step=0;step<core.TUTORIAL_STEPS.length;step++){
    localSlots=[];
    state={...core.createTutorialState(),step,personal:core.practiceEntry('tutorial-diary','private practice',width===390?'rest_daily':'travel',0),
      groupEntry:core.practiceEntry('tutorial-shared','group practice','other',0)};
    const tree=render();
    const all=nodes(tree),exit=all.find(node=>node.props.label==='종료하기');
    assert.ok(exit,core.TUTORIAL_STEPS[step].id);
    const overlay=all.find(node=>node.props.testID==='tutorial-guide-overlay');
    assert.equal(overlay.props.style.position,'absolute');
    assert.equal(overlay.props.style.justifyContent,'center');
    assert.equal(tree.props.children[0].type,'KeyboardAvoidingView','The scene occupies the full screen; the guide is not a header');
    assert.ok(!all.some(node=>['화면 보기','직접 해보기'].includes(node.props.label)));
    if(core.TUTORIAL_STEPS[step].event==='finish')exit.props.onPress();
    else {
      all.find(node=>node.props.label==='다음').props.onPress();
      const after=nodes(render());
      if(state.step===step){
        assert.ok(!after.some(node=>node.props.testID==='tutorial-guide-dialog'));
        assert.ok(after.some(node=>node.props.testID==='tutorial-guide-controls'));
        after.find(node=>node.props.label==='종료하기').props.onPress();
        after.find(node=>node.props.label==='설명 보기').props.onPress();
        assert.ok(nodes(render()).some(node=>node.props.testID==='tutorial-guide-dialog'));
      }else{
        assert.ok(after.some(node=>node.props.testID==='tutorial-guide-dialog'));
        after.find(node=>node.props.label==='종료하기').props.onPress();
      }
    }
    const composer=all.find(node=>node.type==='DiaryWriteScreen');
    if(composer){assert.equal(typeof composer.props.onOpenHistory,'function');composer.props.onOpenHistory();}
    const groups=all.find(node=>node.type==='GroupSpaceScreen');
    if(groups)assert.ok(groups.props.profileControl,'Never mount the actual server-backed profile editor');
    const canvas=all.find(node=>node.type==='UniverseCanvas');
    if(canvas)assert.ok(canvas.props.sceneKey.startsWith('tutorial-account-run:'));
    if(core.TUTORIAL_STEPS[step].id==='constellation-info'){
      const panel=all.find(node=>node.type==='ConstellationPanel');
      assert.equal(panel.props.topic,width===390?'rest_daily':'travel');
      assert.equal(panel.props.members.length,5);
      assert.equal(canvas.props.entries.length,5);
    }
  }
  assert.equal(exits,core.TUTORIAL_STEPS.length);
  localSlots=[];state=core.createTutorialState();
  nodes(render()).find(node=>node.props.label==='다음').props.onPress();
  assert.equal(core.TUTORIAL_STEPS[state.step].id,'open-diary');
  assert.ok(nodes(render()).some(node=>node.props.testID==='tutorial-guide-dialog'),'A new step reopens its centered explanation');
  nodes(render()).find(node=>node.props.label==='다음').props.onPress();
  assert.ok(!nodes(render()).some(node=>node.props.testID==='tutorial-guide-dialog'));
  nodes(render()).find(node=>node.type==='UniverseBottomNav').props.onDiary();
  assert.equal(core.TUTORIAL_STEPS[state.step].id,'write-intro');
  assert.ok(nodes(render()).some(node=>node.props.testID==='tutorial-guide-dialog'));
});

test('HUD and bottom-nav highlights follow their original SVG geometry at every scale',()=>{
  const frames=compile('../src/components/ui/design-decoration.tsx',name=>{
    if(name==='react')return {useId:()=>':stable:'};
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if(name==='react-native-svg')return {__esModule:true,default:'Svg',Path:'Path',Rect:'Rect',G:'G',Defs:'Defs',ClipPath:'ClipPath'};
    if(name==='@/components/coin-icon')return {CoinIcon:'CoinIcon'};
    if(name==='@/constants/ui-design')return {DesignColors:{black:'#000',gray:'#777'},DesignPaint:{ink:'#fff',quest:'#444',bottomBar:'#444'}};
    throw Error(name);
  });
  for(const width of [320,390,768,1440]){
    const layout=responsive.getResponsiveLayout(width,900,{top:0,bottom:0,left:0,right:0});
    const cases=[
      [frames.HomeHudFrame,{scale:layout.hudScale,width:layout.chromeWidth,wide:layout.wide},{highlightMenu:true}],
      [frames.QuestFrame,{scale:layout.hudScale},{highlighted:true}],
      [frames.BottomNavFrame,{layout:layout.navLayout},{highlighted:'diary'}],
      [frames.BottomNavFrame,{layout:layout.navLayout},{highlighted:'group'}],
    ];
    for(const [render,props,highlight] of cases){
      const normal=render(props),active=render({...props,...highlight});
      assert.equal(active.props.width,normal.props.width);assert.equal(active.props.height,normal.props.height);
      assert.deepEqual(nodes(active).filter(node=>node.type==='Path').map(node=>node.props.d),nodes(normal).filter(node=>node.type==='Path').map(node=>node.props.d));
      assert.equal(nodes(active).filter(node=>node.type==='Path'&&node.props.stroke==='#f6d879').length,1);
    }
  }
});
