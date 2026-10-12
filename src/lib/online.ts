// Whether the app can reach its service: the browser has a connection and
// the server answers with its database (/ready). The browser's own flag is
// not enough: with a VPN or Docker network up it stays "online" without
// internet, and a server running on this computer still answers, only
// without its database. So a request that cannot get through asks /ready;
// if that fails too the app counts as offline, and /ready is asked again
// every few seconds and whenever the browser's connection comes back.
const recheck = 10000;
let reachable = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let checking: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function set(next: boolean) {
  clearTimeout(timer);
  if (!next) timer = setTimeout(() => void serviceDown(), recheck);
  if (next === reachable) return;
  reachable = next;
  emit();
}

// True when the service cannot be reached (checked now, once at a time).
export function serviceDown() {
  if (!navigator.onLine) return Promise.resolve(true);
  checking ??= fetch('/ready', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
    .then((response) => response.ok)
    .catch(() => false)
    .then((ok) => {
      checking = null;
      set(ok);
      return !ok;
    });
  return checking;
}

// The page came from the saved copy (the server failed or was slow; see
// public/sw.js): offline at once, while /ready is asked in the background.
export async function openedFromSavedCopy() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return false;
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => resolve(event.data === true);
    worker.postMessage({ type: 'served' }, [channel.port2]);
    setTimeout(() => resolve(false), 1000);
  });
}
export function markDown() {
  set(false);
  void serviceDown();
}

function onBrowserOnline() {
  emit();
  if (!reachable) void serviceDown();
}

export const onlineStore = {
  subscribe(listener: () => void) {
    if (!listeners.size) {
      addEventListener('online', onBrowserOnline);
      addEventListener('offline', emit);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      removeEventListener('online', onBrowserOnline);
      removeEventListener('offline', emit);
    };
  },
  get: () => navigator.onLine && reachable,
  server: () => true,
};
