import test from 'node:test';
import assert from 'node:assert/strict';
import { GroupCache } from '../src/lib/group-cache.ts';

test('same group deduplicates pending reads but allows later revalidation', async () => {
  const cache = new GroupCache(1);
  let resolve, calls = 0;
  const fetcher = () => { calls++; return new Promise(done => { resolve = done; }); };
  const first = cache.load('a', fetcher), second = cache.load('a', fetcher);
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolve([{ id: 'a-1' }]);
  await first;
  assert.deepEqual(cache.rows.get('a'), [{ id: 'a-1' }]);
  await cache.load('a', async () => []);
  assert.deepEqual(cache.rows.get('a'), []);
});

test('late group A response cannot replace group B or another account cache', async () => {
  const old = new GroupCache(1), current = new GroupCache(2);
  let resolve;
  const late = old.load('a', () => new Promise(done => { resolve = done; }));
  await old.load('b', async () => [{ id: 'b-1' }]);
  await current.load('a', async () => [{ id: 'new-account' }]);
  resolve([{ id: 'old-account' }]);
  await late;
  assert.equal(old.rows.get('b')[0].id, 'b-1');
  assert.equal(current.rows.get('a')[0].id, 'new-account');
});

test('failed fetch rejects instead of becoming an empty group and can retry', async () => {
  const cache = new GroupCache(1);
  await cache.load('a', async () => [{ id: 'saved' }]);
  await assert.rejects(cache.load('a', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(cache.rows.get('a')[0].id, 'saved');
  assert.equal(cache.pending.size, 0);
  await cache.load('a', async () => [{ id: 'latest' }]);
  assert.equal(cache.rows.get('a')[0].id, 'latest');
});
