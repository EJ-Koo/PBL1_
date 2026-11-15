export type MemberStar = { id: string; name: string; color: string; completed: boolean; known: boolean };
type Entry = { id: string; authorId: string; createdAt: number; color: string };
type Group = { diary_ids: string[]; members: { user_id: string; nickname: string | null }[] };

// Only shared diaries returned by the authorized API are available. Absence is
// unknown, not proof that another member has not written today.
export function getMemberStars(group: Group, entries: Entry[], today: string): MemberStar[] {
  const shared = new Set(group.diary_ids);
  const [year, month, day] = today.split('-').map(Number);
  const isToday = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
  };
  return group.members.map(member => {
    const latest = entries.filter(entry => shared.has(entry.id) && entry.authorId === member.user_id
      && isToday(entry.createdAt))
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const known = entries.some(entry => entry.authorId === member.user_id);
    return { id: member.user_id, name: member.nickname ?? '멤버', color: latest?.color ?? '#ffffff',
      completed: !!latest, known };
  });
}
