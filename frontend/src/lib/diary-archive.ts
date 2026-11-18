export const ARCHIVE_QUARTERS = [
  { label: 'SPRING', range: '01.01 – 03.31' },
  { label: 'SUMMER', range: '04.01 – 06.30' },
  { label: 'AUTUMN', range: '07.01 – 09.30' },
  { label: 'WINTER', range: '10.01 – 12.31' },
] as const;

export function groupArchive<T extends { id: string; createdAt: number }>(entries: readonly T[], now: number = Date.now(), selectedYear?: number) {
  const groups = new Map<string, { id: string; year: number; quarter: number; entries: T[] }>();
  const current = new Date(now);
  const currentYear = selectedYear ?? current.getFullYear();
  for (let quarter = 1; quarter <= 4; quarter++) {
    const id = `${currentYear}-Q${quarter}`;
    groups.set(id, { id, year: currentYear, quarter, entries: [] });
  }
  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const year = date.getFullYear();
    if (selectedYear !== undefined && year !== selectedYear) continue;
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const id = `${year}-Q${quarter}`;
    if (!groups.has(id)) groups.set(id, { id, year, quarter, entries: [] });
    groups.get(id)!.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => b.year - a.year || a.quarter - b.quarter)
    .map(group => {
      const unlockAt = new Date(group.year, (group.quarter - 1) * 3, 1).getTime();
      const locked = now < unlockAt;
      return { ...group, unlockAt, locked, entries: locked ? [] : group.entries.sort((a, b) => b.createdAt - a.createdAt) };
    });
}
