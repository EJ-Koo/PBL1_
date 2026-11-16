export function groupArchive<T extends { id: string; createdAt: number }>(entries: readonly T[]) {
  const groups = new Map<string, { id: string; year: number; half: number; entries: T[] }>();
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const year = date.getFullYear();
    const half = date.getMonth() < 6 ? 1 : 2;
    const id = `${year}-${half}`;
    if (!groups.has(id)) groups.set(id, { id, year, half, entries: [] });
    groups.get(id)!.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => b.year - a.year || b.half - a.half)
    .map(group => ({ ...group, entries: group.entries.sort((a, b) => b.createdAt - a.createdAt) }));
}
