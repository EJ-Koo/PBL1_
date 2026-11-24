// Each authenticated session owns a cache. Pending calls share work only within one group.
export class GroupCache<T> {
  scope: number;
  constructor(scope: number) { this.scope = scope; }
  rows = new Map<string, T[]>();
  pending = new Map<string, Promise<T[]>>();
  load(groupId: string, fetcher: () => Promise<T[]>): Promise<T[]> {
    const pending = this.pending.get(groupId);
    if (pending) return pending;
    const request = fetcher().then(rows => {
      this.rows.set(groupId, rows);
      return rows;
    }).finally(() => { this.pending.delete(groupId); });
    this.pending.set(groupId, request);
    return request;
  }
}
