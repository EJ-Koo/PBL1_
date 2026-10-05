import { Platform } from 'react-native';

export const API_BASE_URL = 'https://diary-galaxy-backend-production-b42c.up.railway.app';

export type ApiVisibility = 'public' | 'friends' | 'private';

export type ApiDiary = {
  id: string;
  user_id: string;
  content: string;
  photo_url: string | null;
  visibility: ApiVisibility;
  created_at: string;
  updated_at: string;
};

function authHeaders(accessToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

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

export async function apiListDiaries(accessToken: string) {
  const res = await fetch(`${API_BASE_URL}/diaries`, {
    headers: authHeaders(accessToken),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 목록을 불러오지 못했습니다.');
  }
  return data as ApiDiary[];
}

export async function apiCreateDiary(
  accessToken: string,
  payload: { content: string; photo_url: string | null; visibility: ApiVisibility }
) {
  const res = await fetch(`${API_BASE_URL}/diaries`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 저장에 실패했습니다.');
  }
  return data as ApiDiary;
}

export async function apiUploadPhoto(accessToken: string, localUri: string) {
  const filename = localUri.split('/').pop()?.split('?')[0] || `photo-${Date.now()}.jpg`;
  const ext = /\.(\w+)$/.exec(filename)?.[1]?.toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    formData.append('file', blob, filename);
  } else {
    formData.append('file', { uri: localUri, name: filename, type: mimeType } as unknown as Blob);
  }

  const res = await fetch(`${API_BASE_URL}/uploads/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '사진 업로드에 실패했습니다.');
  }
  return data as { photo_path: string };
}

export async function apiUpdateDiary(
  accessToken: string,
  id: string,
  payload: Partial<{ content: string; photo_url: string | null; visibility: ApiVisibility }>
) {
  const res = await fetch(`${API_BASE_URL}/diaries/${id}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? '일기 수정에 실패했습니다.');
  }
  return data as ApiDiary;
}
