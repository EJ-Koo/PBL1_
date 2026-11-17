import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeChat} from '../src/lib/group-chat.ts';
const row=(id,body=id)=>({id,body,sender_id:'u',nickname:'name',avatar_url:null,created_at:'2026-11-17T00:00:00Z'});
test('paginated history and live results merge without duplicates or bigint precision loss',()=>{
 const result=mergeChat([row('9007199254740993'),row('2')],[row('9007199254740992'),row('2','updated'),row('10')]);
 assert.deepEqual(result.map(item=>item.id),['2','10','9007199254740992','9007199254740993']);
 assert.equal(result[0].body,'updated');
});
