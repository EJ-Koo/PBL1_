import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/tutorial.ts',import.meta.url),'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:name=>{throw Error(`Sandbox flow must not depend on runtime services: ${name}`);}});
const {TUTORIAL_STEPS:steps,createTutorialState:create,reduceTutorial:reduce,tutorialCanAdvance:canAdvance,
  personalPracticeStars,groupPracticeStars,tutorialStorageKey,hasSeenTutorial}=exports;
const at=id=>({...create(),step:steps.findIndex(step=>step.id===id)});
const event=(state,name,id)=>reduce(state,{type:'event',event:name,id,stepId:steps[state.step].id});

for(const chapter of ['main','group','settings'])test(`chapter ${chapter} starts independently and stops at its own boundary`,()=>{
  let state=create(chapter);
  const config=exports.TUTORIAL_CHAPTERS.find(item=>item.id===chapter);
  assert.equal(exports.tutorialStep(state).id,config.start);
  if(chapter==='group')assert.ok(state.personal?.text);
  let finished=false;
  for(let guard=0;guard<60;guard++){
    const step=exports.tutorialStep(state);
    if(step.event==='finish'){finished=true;break;}
    if(step.requires==='text')state=reduce(state,{type:'text',value:'연습 기록'});
    if(step.requires==='topic')state=reduce(state,{type:'topic',value:'travel'});
    if(step.id==='group-share')state=reduce(state,{type:'share',value:true});
    if(step.event==='chat-send')state=reduce(state,{type:'chat',value:'안녕'});
    const id=step.event==='read'?(step.scene==='home'?state.personal.id:state.unread[0]):undefined;
    const next=reduce(state,{type:'event',event:step.event,id,stepId:step.id});
    assert.equal(next.step,state.step+1,step.id);state=next;
  }
  assert.equal(finished,true);
  assert.equal(exports.tutorialChapterProgress(state).chapter.id,chapter);
  assert.equal(create(chapter).messages.length,0);
});

test('the complete practice journey requires real actions and keeps all writes inside sandbox state',()=>{
  const actualAccount={diaries:[],groups:[],coins:123,profile:{nickname:'실제 이름'}};
  const before=JSON.stringify(actualAccount);
  let state=create();
  const visited=[];
  for(let guard=0;guard<100;guard++){
    const step=steps[state.step];visited.push(step.id);
    if(step.event==='finish')break;
    if(step.requires==='text')state=reduce(state,{type:'text',value:step.scene==='write'?'오늘은 산책을 했다.':'친구들과 함께 걷고 싶다.'});
    if(step.requires==='topic')state=reduce(state,{type:'topic',value:'travel'});
    if(step.id==='group-share')state=reduce(state,{type:'share',value:true});
    if(step.event==='chat-send')state=reduce(state,{type:'chat',value:'안녕'});
    const id=step.event==='read'?(step.scene==='home'?state.personal.id:state.unread[0]):undefined;
    const next=event(state,step.event,id);
    assert.equal(next.step,state.step+1,step.id);
    state=next;
  }
  assert.equal(visited.length,steps.length);
  assert.equal(steps[state.step].id,'finish');
  assert.equal(state.personal.visibility,'private');
  assert.equal(state.groupEntry.visibility,'friends');
  assert.equal(state.groupEntry.topic,'travel');
  assert.equal(state.messages.length,3);
  assert.equal(state.messages[0].body,'안녕');
  assert.equal(state.unread.length,0);
  assert.equal(JSON.stringify(actualAccount),before);
});

test('blank text, absent topic and blank chat cannot advance',()=>{
  for(const id of ['write-text','write-topic']){
    const state=at(id);assert.equal(canAdvance(state),false);assert.equal(event(state,'next'),state);
  }
  const chat={...at('chat-send'),chat:'  \n '};assert.equal(event(chat,'chat-send'),chat);
  const share={...at('group-share'),text:'test',topic:'other',shared:false};
  assert.equal(event(share,'publish'),share);
});

test('wrong buttons and stale double-clicks cannot skip steps',()=>{
  let state=at('welcome');assert.equal(event(state,'publish'),state);
  state=event(state,'next');
  assert.equal(reduce(state,{type:'event',event:'next',stepId:'welcome'}),state);
  assert.equal(event(state,'next'),state); // This step requires clicking the diary tab.
});

test('individual read clears only its halo; mark all is a separate later action',()=>{
  const state=at('group-read'),id=state.unread[0];
  assert.equal(event(state,'read','real-account-diary-id'),state);
  const next=event(state,'read',id);
  assert.equal(next.unread.length,14);assert.ok(!next.unread.includes(id));
  assert.equal(next.selected,id);
  assert.equal(event(next,'read-all'),next);
  const all={...next,step:steps.findIndex(step=>step.id==='group-read-all')};
  assert.equal(event(all,'read-all').unread.length,0);
});

test('group sharing reuses the first diary without repeating writing lessons',()=>{
  const personal={...exports.practiceEntry('tutorial-diary','first private draft','travel',0),photos:[{id:'p',uri:'local'}]};
  const state={...at('group-write'),personal};
  const next=event(state,'write');assert.equal(next.text,personal.text);assert.equal(next.topic,'travel');assert.equal(next.photos.length,1);
  assert.equal(steps[next.step].id,'group-share');
  assert.equal(next.shared,false);
  assert.equal(event(next,'publish'),next);
  const selected=reduce(next,{type:'share',value:true});
  assert.equal(selected.shared,true);
  assert.equal(selected.step,next.step,'Selecting the group does not open another instruction');
  const saved=event(selected,'publish');assert.equal(steps[saved.step].id,'group-read');
  assert.equal(saved.groupEntry.text,personal.text);
  assert.ok(!steps.some(step=>['group-text','group-photo','group-topic','group-publish'].includes(step.id)));
});

test('photo attachment is optional, capped at five, and restart contains no prior drafts',()=>{
  const state=at('write-photo');assert.equal(event(state,'next').step,state.step+1);
  const full=reduce(state,{type:'photos',value:Array.from({length:8},(_,id)=>({id:String(id),uri:'bundled-sample'}))});
  assert.equal(full.photos.length,5);
  const fresh=create();assert.equal(fresh.text,'');assert.equal(fresh.messages.length,0);assert.equal(fresh.personal,null);
  assert.equal(fresh.photos.length,0);assert.equal(fresh.unread.length,15);
});

test('practice fixtures meet constellation thresholds, have unique IDs, and do not mutate across runs',()=>{
  const personal=personalPracticeStars('other'),group=groupPracticeStars();
  assert.equal(personal.length,4);assert.equal(group.length,15);
  assert.ok([...personal,...group].every(entry=>entry.topic==='other'&&entry.id.startsWith('tutorial-')));
  assert.equal(new Set([...personal,...group].map(entry=>entry.id)).size,19);
  assert.ok(group.every(entry=>entry.visibility==='friends'&&entry.authorId.startsWith('tutorial-member-')));
  personal[0].text='changed';assert.notEqual(personalPracticeStars('other')[0].text,'changed');
});

for(const topic of ['travel','relationship','study_achievement','rest_daily','challenge_activity','other'])test(`the chosen ${topic} diary plus exactly four matching examples unlocks its first constellation`,()=>{
  const own=exports.practiceEntry('tutorial-diary','내 기록',topic,0);
  const entries=[own,...personalPracticeStars(topic)];
  assert.equal(entries.length,5);
  assert.equal(entries.filter(entry=>entry.topic===topic).length,5);
  assert.ok(entries.every(entry=>entry.topic===topic));
  assert.equal(new Set(entries.map(entry=>entry.id)).size,5);
});

test('only progress status is persisted, scoped by account; dismissal also prevents automatic repeats',()=>{
  assert.notEqual(tutorialStorageKey('A'),tutorialStorageKey('B'));
  for(const value of ['started','dismissed','completed'])assert.equal(hasSeenTutorial(value),true);
  for(const value of [null,'','{"text":"private draft"}'])assert.equal(hasSeenTutorial(value),false);
});
