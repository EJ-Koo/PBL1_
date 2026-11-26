/** Never identify authors by nickname: members can share or change a name. */
export function groupStarAuthor(row: {author_id?: string | null}) {
  const authorId = typeof row.author_id === 'string' ? row.author_id : '';
  return {authorId, authorAvailable: authorId.length > 0};
}

/** Input must be this group's authorized shared records, never the personal diary list. */
export function groupMemberEntries<T extends {authorId: string}>(entries: readonly T[], authorId: string | null): T[] {
  return authorId === null ? [...entries] : entries.filter(entry => entry.authorId === authorId);
}

export function memberUnreadIds(entries: readonly {id: string}[], unread: readonly string[]) {
  const visible = new Set(entries.map(entry => entry.id));
  return unread.filter(id => visible.has(id));
}
