/* eslint-disable */
const CACHE_PREFIX = 'vila-da-lua-shell-';
const CACHE_VERSION =
  new URL(self.location.href).searchParams.get('v') || 'development';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isPrivateOrUnsupportedRequest(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html')),
    );
    return;
  }

  const isStaticShell =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/offline.html';

  if (!isStaticShell) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (isCacheableShellResponse(response, url)) {
            const copy = response.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

function isPrivateOrUnsupportedRequest(request, url) {
  return (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/ws' ||
    url.pathname.startsWith('/ws/') ||
    url.pathname.includes('/snapshot') ||
    url.pathname.includes('/commands')
  );
}

function isCacheableShellResponse(response, url) {
  const cacheControl = response.headers.get('cache-control') || '';
  const contentType = response.headers.get('content-type') || '';
  const privateResponse = /(?:private|no-store)/i.test(cacheControl);
  const unexpectedJson =
    contentType.includes('application/json') &&
    url.pathname !== '/manifest.webmanifest';
  return (
    response.ok &&
    response.type === 'basic' &&
    !privateResponse &&
    !unexpectedJson
  );
}
