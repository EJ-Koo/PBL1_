export const ARCHIVE_QUARTERS = [
  { label: 'JAN – MAR', range: '01.01 – 03.31' },
  { label: 'APR – JUN', range: '04.01 – 06.30' },
  { label: 'JUL – SEP', range: '07.01 – 09.30' },
  { label: 'OCT – DEC', range: '10.01 – 12.31' },
] as const;

export function groupArchive<T extends { id: string; createdAt: number }>(entries: readonly T[]) {
  const groups = new Map<string, { id: string; year: number; quarter: number; entries: T[] }>();
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const year = date.getFullYear();
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const id = `${year}-Q${quarter}`;
    if (!groups.has(id)) groups.set(id, { id, year, quarter, entries: [] });
    groups.get(id)!.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter)
    .map(group => ({ ...group, entries: group.entries.sort((a, b) => b.createdAt - a.createdAt) }));
}
