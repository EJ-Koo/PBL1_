import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeChat,chatTimestamp} from '../src/lib/group-chat.ts';
const row=(id,body=id)=>({id,body,sender_id:'u',nickname:'name',avatar_url:null,created_at:'2026-11-17T00:00:00Z'});
test('paginated history and live results merge without duplicates or bigint precision loss',()=>{
 const result=mergeChat([row('9007199254740993'),row('2')],[row('9007199254740992'),row('2','updated'),row('10')]);
 assert.deepEqual(result.map(item=>item.id),['2','10','9007199254740992','9007199254740993']);
 assert.equal(result[0].body,'updated');
});

test('chat uses device-local calendar boundaries, stable 24-hour times and safe invalid dates',()=>{
  const first=new Date(2026,10,25,23,59),second=new Date(2026,10,26,0,1);
  assert.equal(chatTimestamp(first.toISOString()).day,'2026-11-25');
  assert.equal(chatTimestamp(first.toISOString()).time,'23:59');
  assert.equal(chatTimestamp(second.toISOString(),'en').day,'2026-11-26');
  assert.equal(chatTimestamp(second.toISOString()).time,'00:01');
  assert.notEqual(chatTimestamp(first.toISOString()).date,chatTimestamp(first.toISOString(),'en').date);
  assert.deepEqual(chatTimestamp('invalid'),{day:null,date:'',time:''});
});
