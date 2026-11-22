/** Keep pointer decorations above native modal dialogs as they open and close. */
export function mountCursorLayer(element) {
  const observer = new MutationObserver(sync);
  const events = new AbortController();
  const options = { capture: true, passive: true, signal: events.signal };

  function sync() {
    const host = document.activeElement?.closest('dialog[open]') ?? document.querySelector('dialog[open]') ?? document.body;
    if (element.parentElement === host) return;
    observer.disconnect();
    host.appendChild(element);
    if (typeof HTMLDialogElement !== 'undefined' && host instanceof HTMLDialogElement && host.parentNode) {
      observer.observe(host, { attributes: true, attributeFilter: ['open'] });
      observer.observe(host.parentNode, { childList: true });
    }
  }

  function onDialogChange(event) {
    if (typeof HTMLDialogElement !== 'undefined' && event.target instanceof HTMLDialogElement) sync();
  }

  document.addEventListener('toggle', onDialogChange, options);
  document.addEventListener('close', onDialogChange, options);
  document.addEventListener('focusin', sync, options);
  sync();
  return {
    sync,
    dispose() {
      events.abort();
      observer.disconnect();
      element.remove();
    },
  };
}
