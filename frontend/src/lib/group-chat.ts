import type { ChatMessage } from './group-social-api';
/** Device-local calendar day and 24-hour time, shared by real and practice chat. */
export function chatTimestamp(value: string, language = 'ko') {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return {day: null, date: '', time: ''};
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`,
    date: date.toLocaleDateString(language === 'en' ? 'en-US' : 'ko-KR', {year:'numeric', month:'long', day:'numeric'}),
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
/** IDs are SQL bigint strings; do not coerce them to an unsafe JavaScript Number. */
export function mergeChat(old: ChatMessage[], incoming: ChatMessage[]) {
  const unique = new Map(old.map(item => [item.id, item]));
  incoming.forEach(item => unique.set(item.id, item));
  return [...unique.values()].sort((a,b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
}
