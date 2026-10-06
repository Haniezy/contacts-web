// The browser's "install this app" offer (Chrome, Edge, Samsung Internet)
// arrives once as an event; it is kept here so the menu can use it later.
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type State = { offer: InstallEvent | null; installed: boolean };

let state: State = { offer: null, installed: false };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};

let listening = false;
export function listenForInstall() {
  if (listening) return;
  listening = true;
  addEventListener('beforeinstallprompt', (event) => {
    // Our own menu offers it; the browser's mini bar would be a second ask.
    event.preventDefault();
    set({ offer: event as InstallEvent });
  });
  addEventListener('appinstalled', () => set({ offer: null, installed: true }));
}

// Start as soon as this module loads: the offer can come before React has
// finished starting the page.
if (typeof window !== 'undefined') listenForInstall();

export const installState = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
  server: (): State => ({ offer: null, installed: false }),
};

// Shows the browser's install window; true when the user installed.
export async function install() {
  const offer = state.offer;
  if (!offer) return false;
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  set({ offer: null, installed: outcome === 'accepted' || state.installed });
  return outcome === 'accepted';
}

// Already running as the installed app (no browser bars)?
export function runningInstalled() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Platform = 'ios' | 'android' | 'desktop';
export function platform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch gives it away.
  if (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
    return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
