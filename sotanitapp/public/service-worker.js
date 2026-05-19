const CACHE_VERSION = 'sotanitapp-pwa-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-1024.png',
  '/icons/maskable-512.png',
  '/icons/monochrome-432.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      const responseClone = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
      return response;
    });
  });
}

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const responseClone = response.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, responseClone));
      return response;
    })
    .catch(() => caches.match(request));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      networkFirst(event.request).then((response) => response || caches.match('/index.html'))
    );
    return;
  }

  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
