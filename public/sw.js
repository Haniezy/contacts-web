// Dafarche's service worker: the installed app opens without a connection.
// - Built assets (/_next/static, icons) never change: cache first.
// - Pages: network first; offline, when the server fails or is slow, the
//   last copy, or offline.html for a page never seen (see networkFirst).
// - Nothing else is stored: no API calls (the contacts page keeps its own
//   offline book in IndexedDB, src/lib/offline-book.ts), no public share
//   links, nothing but GET requests. Signing out deletes every cache and
//   the book (src/lib/offline.ts), so the next person here sees nothing.
// - The contacts page asks for itself and the files it runs on to be kept
//   (the 'keep' message): it is usually reached without a full page load
//   (after signing in), and its first files load before this worker runs.
const version = 'v3';
const assets = `assets-${version}`;
const pages = `pages-${version}`;
const fallback = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(assets)
      .then((cache) => cache.addAll([fallback, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== assets && key !== pages)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const isAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  url.pathname.startsWith('/icons/');
const isPage = (request, url) =>
  request.mode === 'navigate' &&
  !url.pathname.startsWith('/api/') &&
  !url.pathname.startsWith('/s/');

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(assets)).put(request, response.clone());
  return response;
}

// Bumped when someone signs out or in: a page fetched before that is never
// stored after it.
let generation = 0;
async function storePage(request, response, started) {
  // Redirects (say, to sign in) and errors are never kept.
  if (!response.ok || response.redirected) return;
  const cache = await caches.open(pages);
  if (started === generation) await cache.put(request, response);
}

const savedPage = (request) =>
  caches.match(request, { cacheName: pages, ignoreVary: true });
// The new-contact form, an edit form or a contact's page, never saved
// themselves (they open in place), open as the saved contacts page instead.
// Duplicates and the trash need the server: offline.html.
const inPlace = /^\/contacts\/(new|[0-9a-f-]{36}(\/edit)?)$/i;
async function savedFor(request) {
  return (
    (await savedPage(request)) ??
    (inPlace.test(new URL(request.url).pathname)
      ? await savedPage('/contacts')
      : undefined)
  );
}
// How long a page with a saved copy waits for the server. A server that
// cannot reach its database takes 10 s to fail; the saved copy is enough.
const patience = 4000;
// Pages opened from the saved copy; each asks once ('served'), so it can
// switch to the offline book straight away.
const servedSaved = new Set();

// Network first. Offline, on a server error (5xx: say, the app runs on
// this computer and its database is out of reach) or after `patience`,
// the saved copy; offline.html for a page never saved.
async function networkFirst(event) {
  const { request } = event;
  const started = generation;
  const network = fetch(request).then(async (response) => {
    if (response.status < 500)
      await storePage(request, response.clone(), started);
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  const saved = await savedFor(request);
  if (!saved)
    return network.catch(
      async (error) => (await caches.match(fallback)) ?? Promise.reject(error),
    );
  const fromSaved = () => {
    if (event.resultingClientId) servedSaved.add(event.resultingClientId);
    return saved;
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fromSaved()), patience);
    network.then(
      (response) => {
        clearTimeout(timer);
        resolve(response.status >= 500 ? fromSaved() : response);
      },
      () => {
        clearTimeout(timer);
        resolve(fromSaved());
      },
    );
  });
}

// Only the app's own built files, and only the contacts page.
const keptPages = ['/contacts'];
async function keep({ page, files }) {
  const assetCache = await caches.open(assets);
  await Promise.all(
    (Array.isArray(files) ? files : []).map(async (file) => {
      try {
        const url = new URL(file, self.location.origin);
        if (url.origin !== self.location.origin || !isAsset(url)) return;
        if (await assetCache.match(url)) return;
        const response = await fetch(url);
        if (response.ok) await assetCache.put(url, response);
      } catch {
        // The next visit tries again.
      }
    }),
  );
  if (!keptPages.includes(page)) return;
  const started = generation;
  try {
    const response = await fetch(page, { credentials: 'same-origin' });
    await storePage(page, response, started);
  } catch {
    // As above.
  }
}

async function forget(reply) {
  generation++;
  await caches.delete(pages);
  reply?.postMessage('done');
}

self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data?.type === 'keep') event.waitUntil(keep(event.data));
  if (event.data?.type === 'forget') event.waitUntil(forget(event.ports[0]));
  if (event.data?.type === 'served') {
    const id = event.source?.id;
    event.ports[0]?.postMessage(servedSaved.delete(id));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAsset(url)) event.respondWith(cacheFirst(request));
  else if (isPage(request, url)) event.respondWith(networkFirst(event));
});
