import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function apiClient(env = {}) {
  const requests = [];
  const modules = new Map();
  const fetchMock = async (url, init) => {
    requests.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ access_token: 'test-token', coins: 50 }) };
  };
  function load(name) {
    if (name.startsWith('@/lib/')) name = './' + name.slice('@/lib/'.length);
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === './auth-session') return { apiFetch: fetchMock };
    if (modules.has(name)) return modules.get(name);
    const source = readFileSync(new URL(`../src/lib/${name.slice(2)}.ts`, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    modules.set(name, exports);
    vm.runInNewContext(code, {
      exports, require: load, process: { env },
      fetch: fetchMock,
    });
    return exports;
  }
  return { auth: load('./api'), shop: load('./shop-api'), requests };
}

test('login and wallet requests use the working production API by default', async () => {
  const { auth, shop, requests } = apiClient();
  await auth.apiLogin('preview@example.test', 'test-only');
  await shop.apiGetWallet('test-token');
  assert.equal(requests[0].url, 'https://api.star2day.com/auth/login');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[1].url, 'https://api.star2day.com/me/wallet');
  assert.equal(requests[1].init.headers.Authorization, 'Bearer test-token');
});

test('existing API_BASE_URL environment overrides still apply to login and shop', async () => {
  const { auth, shop, requests } = apiClient({ EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8000' });
  await auth.apiLogin('preview@example.test', 'test-only');
  await shop.apiGetWallet('test-token');
  assert.equal(requests[0].url, 'http://localhost:8000/auth/login');
  assert.equal(requests[1].url, 'http://localhost:8000/me/wallet');
});

test('API_URL overrides take priority; empty values keep the production default', () => {
  assert.equal(apiClient({ EXPO_PUBLIC_API_URL: 'http://localhost:9000', EXPO_PUBLIC_API_BASE_URL: 'http://localhost:8000' }).auth.API_BASE_URL,
    'http://localhost:9000');
  assert.equal(apiClient({ EXPO_PUBLIC_API_URL: '', EXPO_PUBLIC_API_BASE_URL: '' }).auth.API_BASE_URL,
    'https://api.star2day.com');
});
