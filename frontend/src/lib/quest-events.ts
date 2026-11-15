import type { DailyQuest } from './quest-api';

type QuestEvent = { userId: string; revision: number; quest: DailyQuest };
const listeners = new Set<(event: QuestEvent) => void>();
export function publishQuest(event: QuestEvent) { listeners.forEach(listener => listener(event)); }
export function subscribeQuest(listener: (event: QuestEvent) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Ignore responses from before a reset or day rollover, and late pre-reward reads.
export function latestQuest(current: DailyQuest | null, next: DailyQuest): DailyQuest {
  if (!current) return next;
  if (next.day < current.day || (next.day === current.day && next.cycle < current.cycle)) return current;
  if (next.day === current.day && next.cycle === current.cycle && current.completed && !next.completed) return current;
  return next;
}
