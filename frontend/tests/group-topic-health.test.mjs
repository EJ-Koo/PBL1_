import test from 'node:test';
import assert from 'node:assert/strict';
import {groupTopicHealth} from '../src/lib/group-topic-health.ts';
import {starFocusIds} from '../src/lib/star-focus.ts';

test('old group responses with stars but no topic field are diagnosed separately from an empty universe',()=>{
  const missing=groupTopicHealth(Array.from({length:20},()=>({topic:null,topicAvailable:false})));
  assert.equal(missing.classified,0);assert.equal(missing.missing,20);
  assert.match(missing.emptyText,/주제 정보/);assert.match(missing.message,/20개/);
  assert.equal(groupTopicHealth([]).emptyText,'아직 공유된 별이 없어요');
  assert.equal(groupTopicHealth([{topic:null,topicAvailable:true}]).missing,0);
  assert.equal(groupTopicHealth([{topic:'travel'},{topic:undefined}]).classified,1);
});

test('topic selection focuses matching planets; shape selection focuses only shape members without altering entries',()=>{
  const entries=[{id:'a',topic:'travel'},{id:'b',topic:'other'},{id:'c',topic:'travel'},{id:'d',topic:null}];
  const before=JSON.stringify(entries);
  assert.equal(starFocusIds(entries,null),null);
  assert.deepEqual([...starFocusIds(entries,'travel')],['a','c']);
  assert.deepEqual([...starFocusIds(entries,'travel',['c'])],['c']);
  assert.equal(starFocusIds(entries,'relationship').size,0);
  assert.equal(JSON.stringify(entries),before);
});

test('member focus dims other authors including same-topic stars, then intersects topic and shape focus',()=>{
  const entries=[{id:'a',authorId:'one',topic:'travel'},{id:'b',authorId:'two',topic:'travel'},{id:'c',authorId:'one',topic:'other'},{id:'d',authorId:'two',topic:'other'}];
  const before=JSON.stringify(entries);
  assert.deepEqual([...starFocusIds(entries,null,undefined,'one')],['a','c']);
  assert.deepEqual([...starFocusIds(entries,'travel',undefined,'one')],['a']);
  assert.deepEqual([...starFocusIds(entries,'travel',['a'],'one')],['a']);
  assert.equal(starFocusIds(entries,null,undefined,null),null);
  assert.equal(starFocusIds(entries,null,undefined,'missing').size,0);
  assert.equal(entries.length,4);assert.equal(JSON.stringify(entries),before);
});
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {groupTopicStatuses,selectMembers} from '../src/lib/constellation.ts';

test('topic focus waits for an unlocked shape card and resets when topics or mode change',()=>{
  let cursor=0;
  const slots=[];
  const react={useMemo:fn=>fn(),useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}};
  const exports={};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/hooks/use-group-constellation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{
    if(name==='react')return react;
    if(name==='@/lib/constellation')return {groupTopicStatuses,selectMembers};
    throw Error(name);
  }});
  const entries=Array.from({length:30},(_,i)=>({id:String(i),topic:i<15?'travel':'other',createdAt:i}));
  const render=()=>{cursor=0;return exports.useGroupConstellation(entries);};
  let hook=render();hook.setEnabled(true);hook=render();
  assert.equal(hook.enabled,true);assert.equal(hook.template,null);
  hook.selectTopic('travel');hook=render();assert.equal(hook.template,null);
  const travel=hook.statuses.find(s=>s.topic==='travel');
  assert.equal(travel.count,15);
  hook.selectTemplate(travel.levels[1].template.id);assert.equal(render().template,null,'locked card cannot draw');
  hook.selectTemplate(travel.levels[0].template.id);hook=render();
  assert.equal(hook.members.length,15);assert.equal(hook.template.topic,'travel');
  hook.selectTopic('other');hook=render();assert.equal(hook.template,null);assert.equal(hook.members.length,0);
  hook.selectTemplate(hook.statuses.find(s=>s.topic==='other').levels[0].template.id);hook=render();assert.ok(hook.template);
  hook.setEnabled(false);hook=render();assert.equal(hook.enabled,false);assert.equal(hook.template,null);
});
