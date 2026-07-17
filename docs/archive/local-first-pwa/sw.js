// sw.js — a small app-shell cache so Hearsay opens offline. The campaign data itself
// lives in IndexedDB (see js/db.js), never here; this only holds the static shell.
// Bump CACHE when shipping new assets so clients pick them up.

const CACHE = 'hearsay-shell-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/maskable.svg',
  './js/app.js',
  './js/home.js',
  './js/campaign.js',
  './js/panels.js',
  './js/state.js',
  './js/db.js',
  './js/viewport.js',
  './js/ui.js',
  './js/util.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for the shell, network fallback. Never caches non-GET or cross-origin.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
