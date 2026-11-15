import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { AuthError, createSessionManager, parseSession } from '../src/lib/session-core.ts';

const jwt = (seconds = 3600) => `test.${Buffer.from(JSON.stringify({ exp: Date.now() / 1000 + seconds })).toString('base64url')}.test`;
const session = (id = 'user-a', seconds = 3600) => ({ user_id: id, access_token: jwt(seconds), refresh_token: 'test-refresh', email: 'test@example.invalid' });
function setup(stored = null, overrides = {}) {
  let raw = stored && JSON.stringify(stored);
  let refreshes = 0;
  const manager = createSessionManager({
    storage: { async getItem() { return raw; }, async setItem(value) { raw = value; }, async removeItem() { raw = null; } },
    validate: async () => {}, refresh: async () => { refreshes++; return session(); }, ...overrides,
  });
  return { manager, raw: () => raw, refreshes: () => refreshes };
}
test('restore waits for validation, persists login, and shares concurrent restoration', async () => {
  let resolve;
  const validation = new Promise(done => resolve = done);
  const { manager } = setup(session(), { validate: () => validation });
  const first = manager.restore();
  assert.equal(first, manager.restore());
  assert.equal(manager.getSnapshot().ready, false);
  resolve(); await first;
  assert.equal(manager.getSnapshot().ready, true);
  assert.equal(manager.getSnapshot().session.user_id, 'user-a');
});
test('corrupt saved data is rejected and removed', async () => {
  assert.equal(parseSession('{bad'), null);
  assert.equal(parseSession(JSON.stringify({ access_token: '', user_id: 'a' })), null);
  const { manager, raw } = setup({ invalid: true });
  await manager.restore(); await new Promise(setImmediate);
  assert.equal(manager.getSnapshot().session, null); assert.equal(raw(), null);
});
test('expired access is refreshed once for concurrent API calls and rotated token is saved', async () => {
  const { manager, refreshes, raw } = setup();
  const before = session('user-a', -60); await manager.establish(before);
  const [a, b] = await Promise.all([manager.getToken(before.access_token), manager.getToken(before.access_token)]);
  assert.equal(refreshes(), 1); assert.equal(a, b); assert.notEqual(a, before.access_token);
  assert.equal(JSON.parse(raw()).access_token, a);
});
test('401 retries once with a new session, 403 never refreshes', async () => {
  const { manager, refreshes } = setup(); const before = session(); await manager.establish(before);
  let requests = 0;
  const response = await manager.request(before.access_token, async () => new Response(null, { status: ++requests === 1 ? 401 : 200 }));
  assert.equal(response.status, 200); assert.equal(requests, 2); assert.equal(refreshes(), 1);
  await manager.request(before.access_token, async () => new Response(null, { status: 403 }));
  assert.equal(refreshes(), 1);
});
test('an invalid refresh clears login, a network failure preserves it', async () => {
  for (const invalid of [false, true]) {
    const { manager } = setup(session('user-a', -60), { refresh: async () => { throw invalid ? new AuthError(401) : new TypeError('offline'); } });
    await manager.restore();
    assert.equal(manager.getSnapshot().ready, true);
    assert.equal(!!manager.getSnapshot().session, !invalid);
  }
});
test('logout while refresh is pending cannot revive credentials or storage', async () => {
  let resolve;
  const { manager, raw } = setup(null, { refresh: () => new Promise(done => resolve = done) });
  const before = session('user-a', -60); await manager.establish(before);
  const pending = manager.getToken(before.access_token);
  manager.clear(); resolve(session());
  await assert.rejects(pending, AuthError); await new Promise(setImmediate);
  assert.equal(manager.getSnapshot().session, null); assert.equal(raw(), null);
});
test('late restoration and slow saves cannot undo a newer logout/account switch', async () => {
  let resolveRead;
  const { manager } = setup(null, { storage: { getItem: () => new Promise(done => resolveRead = done), async setItem() {}, async removeItem() {} } });
  const restoring = manager.restore();
  await manager.establish(session('user-b'));
  resolveRead(JSON.stringify(session('user-a'))); await restoring;
  assert.equal(manager.getSnapshot().session.user_id, 'user-b');
  await assert.rejects(manager.getToken('unknown-old-access'), AuthError);
});

test('storage failure cannot publish a half-saved login', async () => {
  const { manager } = setup(null, { storage: { async getItem() { return null; }, async setItem() { throw new Error('unavailable'); }, async removeItem() {} } });
  await assert.rejects(manager.establish(session()), /기기에 저장/);
  assert.equal(manager.getSnapshot().session, null);
});

test('a second unauthorized response stops retrying and clears the session', async () => {
  const { manager } = setup(); const before = session(); await manager.establish(before);
  let requests = 0;
  const result = await manager.request(before.access_token, async () => { requests++; return new Response(null, { status: 401 }); });
  assert.equal(result.status, 401); assert.equal(requests, 2);
  assert.equal(manager.getSnapshot().session, null);
});
