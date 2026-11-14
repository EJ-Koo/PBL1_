export type DialogRequest = {
  id: number; title: string; message: string; confirmLabel: string; cancelLabel?: string;
};
type Pending = { request: DialogRequest; resolve: (confirmed: boolean) => void };
let sequence = 0;
let pending: Pending[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const subscribeDialogs = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getCurrentDialog = (): DialogRequest | null => pending[0]?.request ?? null;
export const getServerDialog = (): null => null;
export function enqueueDialog(options: Omit<DialogRequest, 'id'>): Promise<boolean> {
  return new Promise(resolve => {
    pending = [...pending, { request: { ...options, id: ++sequence }, resolve }];
    notify();
  });
}
export function settleDialog(id: number, confirmed: boolean) {
  if (pending[0]?.request.id !== id) return;
  const current = pending[0];
  pending = pending.slice(1);
  notify();
  current.resolve(confirmed);
}
