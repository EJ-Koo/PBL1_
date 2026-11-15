/** One pending action; keep its key on failure so a retry cannot create a second server row. */
export class GroupCreation {
  action: { name: string; id: string; pending?: Promise<unknown> } | null = null;
  async run<T>(name: string, makeId: () => string, submit: (id: string) => Promise<T>): Promise<T> {
    if (this.action?.pending) return this.action.pending as Promise<T>;
    if (!this.action || this.action.name !== name) this.action = { name, id: makeId() };
    const action = this.action;
    const pending = submit(action.id).then(result => { if (this.action === action) this.action = null; return result; })
      .finally(() => { action.pending = undefined; });
    action.pending = pending;
    return pending;
  }
}
