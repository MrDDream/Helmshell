// Service worker de Helmshell : l'interface reste disponible (et s'ouvre vite) comme une application.
// Les données (/api, /auth, /hook) ne sont jamais mises en cache : elles passent toujours par le réseau.
const VERSION = 'helmshell-v2';
const SHELL = ['/', '/app.js', '/app.css', '/palettes.css', '/theme-init.js', '/load.js', '/editor.js', '/md.js', '/diff.js',
  '/chart.js', '/live.js', '/icons.js', '/i18n.js', '/locales/en.json', '/logo.svg', '/favicon.svg', '/offline.html', '/manifest.webmanifest',
  '/icone-192.png', '/icone-512.png', '/logos/claude.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const PRIVATE = /^\/(api|auth|hook)\//;
const IMMUTABLE = /^\/(logos|fonts)\//;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || PRIVATE.test(url.pathname)) return;   // réseau seul
  if (req.mode === 'navigate') {
    // Page : toujours la version du serveur ; hors connexion, une page qui le dit
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Fichiers de l'interface : le réseau d'abord (mises à jour immédiates), le cache en secours
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
