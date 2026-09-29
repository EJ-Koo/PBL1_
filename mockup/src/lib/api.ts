export const API_BASE_URL = 'https://diary-galaxy-backend-production.up.railway.app';

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '로그인에 실패했습니다.');
  }
  return data as { access_token: string; refresh_token: string; user_id: string };
}

export async function apiSignup(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '회원가입에 실패했습니다.');
  }
  return data as {
    user_id: string;
    access_token: string | null;
    refresh_token: string | null;
    email_confirmation_required: boolean;
  };
}
