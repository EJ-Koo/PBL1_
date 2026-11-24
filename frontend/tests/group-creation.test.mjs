import test from 'node:test';import assert from 'node:assert/strict';import { GroupCreation } from '../src/lib/group-creation.ts';
test('button and Enter in the same turn share a single network action',async()=>{
 const action=new GroupCreation();let done,calls=0,ids=0;
 const submit=id=>{calls++;return new Promise(resolve=>{done=()=>resolve(id);});};
 const a=action.run('우리 우주',()=>String(++ids),submit),b=action.run('우리 우주',()=>String(++ids),submit);
 assert.equal(calls,1);done();assert.equal(await a,await b);assert.equal(ids,1);
 const intentional=await action.run('우리 우주',()=>String(++ids),async id=>id);assert.equal(intentional,'2');
});
test('lost response retry keeps the same request key; changing name starts a new action',async()=>{
 const action=new GroupCreation();let ids=0;const sent=[];
 await assert.rejects(action.run('A',()=>String(++ids),async id=>{sent.push(id);throw Error('offline');}));
 await action.run('A',()=>String(++ids),async id=>sent.push(id));assert.deepEqual(sent,['1','1']);
 await assert.rejects(action.run('B',()=>String(++ids),async()=>{throw Error('offline');}));
 const id=await action.run('C',()=>String(++ids),async id=>id);assert.equal(id,'3');
});
