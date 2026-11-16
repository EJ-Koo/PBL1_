import { API_BASE_URL } from './api-config';
import { AuthError, createSessionManager, type UserSession } from './session-core';
import { sessionStorage } from './session-storage';

async function authFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export const authSession = createSessionManager({
  storage: sessionStorage,
  async refresh(refreshToken) {
    const response = await authFetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) throw new AuthError(response.status, response.status === 401
      ? '로그인이 만료됐어요. 다시 로그인해주세요.' : '로그인 연결을 확인해주세요.');
    const result = await response.json();
    if (!result.access_token || !result.refresh_token || !result.user_id) throw new Error('로그인 응답을 확인하지 못했어요.');
    return result as Omit<UserSession, 'email'>;
  },
  async validate(session) {
    const response = await authFetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) throw new AuthError(response.status);
    if ((await response.json()).user_id !== session.user_id) throw new AuthError(401);
  },
});

export function apiFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = headers.get('Authorization')?.replace(/^Bearer /, '');
  const path = url.slice(API_BASE_URL.length);
  // Admin authentication remains independent of the user's Supabase session.
  if (!token || path.startsWith('/admin/') || path.startsWith('/auth/')) return fetch(url, init);
  return authSession.request(token, accessToken => {
    const updated = new Headers(headers);
    updated.set('Authorization', `Bearer ${accessToken}`);
    return fetch(url, { ...init, headers: updated });
  });
}

export function signOut() {
  const token = authSession.getSnapshot().session?.access_token;
  authSession.clear();
  if (token) void fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}
