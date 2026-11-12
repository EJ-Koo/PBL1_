import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { getCurrentDialog, getServerDialog, settleDialog, subscribeDialogs } from '@/lib/dialog-queue';

export function NoticeDialogHost() {
  const current = useSyncExternalStore(subscribeDialogs, getCurrentDialog, getServerDialog);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !current) return;
    if (!dialog.open) dialog.showModal();
    // Cancel receives initial focus so pressing Enter cannot purchase accidentally.
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [current]);
  if (!current) return null;
  const finish = (confirmed: boolean) => settleDialog(current.id, confirmed);
  return <>
    <style>{`
      .space-notice { position:fixed; inset:0; margin:auto; box-sizing:border-box;
        width:min(420px, calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto;
        padding:28px; border:1px solid #9ba6b8; border-radius:8px; background:#0c1018;
        color:#f4f6fa; box-shadow:0 24px 100px #000b; font-family:Inter_400Regular, sans-serif; }
      .space-notice::backdrop { background:#000a; backdrop-filter:blur(5px); }
      .space-notice h2 { margin:0 0 14px; font-size:21px; line-height:1.4; }
      .space-notice p { margin:0; color:#bfc7d3; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; line-height:1.8; }
      .space-notice-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:28px; }
      .space-notice button { min-height:44px; min-width:88px; padding:10px 20px; border:1px solid #758092;
        border-radius:4px; background:transparent; color:#fff; font:inherit; font-size:14px; cursor:pointer; }
      .space-notice button:last-child { background:#edf0f5; color:#10151d; border-color:#edf0f5; font-weight:700; }
      .space-notice button:focus-visible { outline:2px solid #b2c9ff; outline-offset:4px; }
      .space-notice button:hover { filter:brightness(.88); }
    `}</style>
    <dialog ref={dialogRef} className="space-notice" aria-labelledby={titleId} aria-describedby={messageId}
      onCancel={event => { event.preventDefault(); finish(false); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish(false);
      }}>
      <h2 id={titleId}>{current.title}</h2>
      <p id={messageId}>{current.message}</p>
      <div className="space-notice-actions">
        {current.cancelLabel && <button type="button" onClick={() => finish(false)}>{current.cancelLabel}</button>}
        <button type="button" onClick={() => finish(true)}>{current.confirmLabel}</button>
      </div>
    </dialog>
  </>;
}
