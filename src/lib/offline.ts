// Everything the service worker keeps for offline use is this account's
// data, so signing out (or in as someone else) deletes it all.
export async function forgetOfflineData() {
  try {
    if (!('caches' in window)) return;
    await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
  } catch {
    // Storage may be unavailable (private mode); nothing was kept then.
  }
}
