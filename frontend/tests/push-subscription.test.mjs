import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPushKey, samePushKey } from '../src/lib/push-subscription.ts';

test('subscriptions with an older VAPID key are detected instead of silently reused',()=>{
  const key=Uint8Array.from([4,12,253,254,255]);
  const encoded=Buffer.from(key).toString('base64url');
  assert.deepEqual(publicPushKey(encoded),key);
  assert.equal(samePushKey(key.buffer,publicPushKey(encoded)),true);
  assert.equal(samePushKey(Uint8Array.from([4,12,253,254,254]).buffer,key),false);
  assert.equal(samePushKey(null,key),false);
  assert.equal(samePushKey(new ArrayBuffer(1),key),false);
});
