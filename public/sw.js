// Dafarche's service worker: the installed app opens without a connection.
// - Built assets (/_next/static, icons) never change: cache first.
// - Pages and the contacts list: network first; offline, the last copy,
//   or offline.html for a page never seen.
// - Nothing else is stored: no sign-in or account calls, no public share
//   links, nothing but GET requests. Signing out deletes every cache
//   (src/lib/offline.ts), so the next person on this browser sees nothing.
const version = 'v1';
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
// The list and the duplicates count, which the contacts page reads.
const isListApi = (url) =>
  url.pathname === '/api/contacts' ||
  url.pathname === '/api/contacts/duplicates';
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

async function networkFirst(request, page) {
  try {
    const response = await fetch(request);
    // Redirects (say, to sign in) and errors are never kept.
    if (response.ok && !response.redirected)
      (await caches.open(pages)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { cacheName: pages });
    if (cached) return cached;
    if (page) return caches.match(fallback);
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isAsset(url)) event.respondWith(cacheFirst(request));
  else if (isListApi(url)) event.respondWith(networkFirst(request, false));
  else if (isPage(request, url)) event.respondWith(networkFirst(request, true));
});
