import { API_BASE_URL } from './api-config';
import { apiFetch } from './auth-session';
import { Platform } from 'react-native';

export type ApiProfile = { id: string; user_id: string; nickname: string; bio: string; avatar_path: string | null; avatar_url: string | null };
export type ProfileDraft = { nickname: string; bio: string; avatar_path: string | null; avatarUri?: string };

async function result(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(typeof data?.detail === 'string' ? data.detail : '프로필을 처리하지 못했어요. 서버 연결을 확인해주세요.');
  return data;
}
export async function apiGetProfile(token: string): Promise<ApiProfile | null> {
  const response = await apiFetch(`${API_BASE_URL}/profiles/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  return result(response);
}
export async function apiSaveProfile(token: string, draft: Omit<ProfileDraft, 'avatarUri'>): Promise<ApiProfile> {
  return result(await apiFetch(`${API_BASE_URL}/profiles/me`, { method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }));
}
export async function apiUploadAvatar(token: string, uri: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    if (blob.size > 5 * 1024 * 1024) throw new Error('프로필 사진은 5MB 이하로 선택해주세요.');
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    form.append('file', blob, `profile.${ext}`);
  } else {
    const ext = uri.split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    form.append('file', { uri, name: `profile.${ext || 'jpg'}`, type } as unknown as Blob);
  }
  const data = await result(await apiFetch(`${API_BASE_URL}/uploads/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }));
  return data.avatar_path;
}
