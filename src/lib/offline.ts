import { forgetBooks } from './offline-book';

const keptKey = 'contacts-offline-kept';

// A new sign-in starts without anyone's saved pages. The app's own files
// (and the offline page) stay: they hold nothing personal, and the app
// cannot open offline without them. The offline book is kept per account
// instead: the contacts page drops any other account's, and the same
// account signing in again (its session had expired) keeps its unsynced
// changes.
export async function forgetSavedPages() {
  try {
    // The next account's contacts page asks to be kept again.
    sessionStorage.removeItem(keptKey);
    // The service worker first: a page it is still fetching must not be
    // stored after this.
    const worker =
      navigator.serviceWorker?.controller ??
      (await navigator.serviceWorker?.getRegistration())?.active;
    if (worker)
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        worker.postMessage({ type: 'forget' }, [channel.port2]);
        setTimeout(resolve, 2000);
      });
    if (!('caches' in window)) return;
    await Promise.all(
      (await caches.keys())
        .filter((key) => key.startsWith('pages-'))
        .map((key) => caches.delete(key)),
    );
  } catch {
    // Storage may be unavailable (private mode); nothing was kept then.
  }
}

// Everything of this account kept for offline use: the pages the service
// worker saved and the book with its unsynced changes. Signing out (or
// deleting the account) deletes it all.
export async function forgetOfflineData() {
  await forgetSavedPages();
  await forgetBooks();
}

// Asks the service worker to keep the contacts page and every built file
// this page has loaded, so the installed app opens offline even when the
// page was reached without a full load. The date picker's code, which
// otherwise loads on first use, is fetched first so it is kept too.
export async function keepForOffline(preload: () => Promise<unknown>) {
  try {
    if (!('serviceWorker' in navigator)) return;
    // Once per visit is enough; full page loads keep the page as they go.
    if (sessionStorage.getItem(keptKey)) return;
    await preload().catch(() => {});
    const files = new Set<string>();
    for (const entry of performance.getEntriesByType('resource'))
      files.add(entry.name);
    for (const script of document.scripts)
      if (script.src) files.add(script.src);
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"]',
    ))
      files.add(link.href);
    const worker = (await navigator.serviceWorker.ready).active;
    sessionStorage.setItem(keptKey, '1');
    worker?.postMessage({
      type: 'keep',
      page: '/contacts',
      files: [...files].filter((file) =>
        file.startsWith(`${location.origin}/_next/static/`),
      ),
    });
  } catch {
    // Without it the app still works online.
  }
}
