import { apiFetch } from './auth-session';
import { API_BASE_URL } from './api-config';
export type SocialMember = { user_id: string; nickname: string; bio: string; avatar_url: string | null };
export type GroupQuest = { id: string; day: string; title: string; completed: number; total: number; done: boolean };
export type GroupSnapshot = { members: SocialMember[]; unread_diary_ids: string[]; diary_ids: string[]; chat_unread_count: number; quest: GroupQuest };
export type ChatMessage = { id: string; sender_id: string | null; body: string; nickname: string; avatar_url: string | null; created_at: string };
export type ChatPage = { items: ChatMessage[]; has_more: boolean };
export type HeartState = { count: number; liked: boolean };
export async function socialRequest<T>(token: string,path: string,method='GET',body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await apiFetch(`${API_BASE_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) throw new Error(typeof data?.detail === 'string' ? data.detail : '그룹 연결을 확인해주세요.');
    return data as T;
  } finally { clearTimeout(timer); }
}
export const groupSnapshot = (token: string,id: string) => socialRequest<GroupSnapshot>(token,`/groups/${id}/social`);
export const chatMessages = (token: string,id: string,before?: string) => socialRequest<ChatPage>(token,`/groups/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`);
export const sendChat = (token: string,id: string,body: string,client_id: string) => socialRequest<{id:string}>(token,`/groups/${id}/messages`,'POST',{body,client_id});
export const markChatRead = (token: string,id: string,message_id: string) => socialRequest(token,`/groups/${id}/messages/read`,'PUT',{message_id});
export const markDiaryRead = (token: string,id: string,diary: string) => socialRequest(token,`/groups/${id}/diaries/${diary}/read`,'PUT');
export const getHeart = (token: string,id: string,diary: string) => socialRequest<HeartState>(token,`/groups/${id}/diaries/${diary}/heart`);
export const setHeart = (token: string,id: string,diary: string,liked: boolean) => socialRequest<HeartState>(token,`/groups/${id}/diaries/${diary}/heart`,'PUT',{liked});
