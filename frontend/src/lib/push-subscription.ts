/** Compare browser subscription key bytes without logging keys or subscription endpoints. */
export function samePushKey(existing: ArrayBuffer | null | undefined, expected: Uint8Array) {
  if (!existing) return false;
  const bytes = new Uint8Array(existing);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}
export function publicPushKey(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized + '='.repeat((4 - normalized.length % 4) % 4)), letter => letter.charCodeAt(0));
}
