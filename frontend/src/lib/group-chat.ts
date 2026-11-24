import type { ChatMessage } from './group-social-api';
/** IDs are SQL bigint strings; do not coerce them to an unsafe JavaScript Number. */
export function mergeChat(old: ChatMessage[], incoming: ChatMessage[]) {
  const unique = new Map(old.map(item => [item.id, item]));
  incoming.forEach(item => unique.set(item.id, item));
  return [...unique.values()].sort((a,b) => a.id.length - b.id.length || a.id.localeCompare(b.id));
}
