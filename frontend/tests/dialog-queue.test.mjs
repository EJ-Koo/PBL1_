import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueDialog, getCurrentDialog, settleDialog, subscribeDialogs } from '../src/lib/dialog-queue.ts';

test('confirmation is explicit and a stale double click cannot confirm the next purchase', async () => {
  const purchase = enqueueDialog({ title: '구매', message: '상품 A', confirmLabel: '구매', cancelLabel: '취소' });
  const first = getCurrentDialog().id;
  const next = enqueueDialog({ title: '구매', message: '상품 B', confirmLabel: '구매', cancelLabel: '취소' });
  assert.equal(getCurrentDialog().id, first);
  settleDialog(first, true);
  const second = getCurrentDialog().id;
  settleDialog(first, true);
  assert.equal(getCurrentDialog().id, second);
  settleDialog(second, false);
  assert.equal(await purchase, true);
  assert.equal(await next, false);
  assert.equal(getCurrentDialog(), null);
});
test('cancel returns false and listeners detach cleanly', async () => {
  let notifications = 0;
  const unsubscribe = subscribeDialogs(() => notifications++);
  const pending = enqueueDialog({ title: '구매', message: '구매 취소', confirmLabel: '구매', cancelLabel: '취소' });
  settleDialog(getCurrentDialog().id, false);
  assert.equal(await pending, false);
  assert.equal(notifications, 2);
  unsubscribe();
  const notice = enqueueDialog({ title: '안내', message: '완료', confirmLabel: '확인' });
  settleDialog(getCurrentDialog().id, true);
  assert.equal(await notice, true);
  assert.equal(notifications, 2);
});
