/* global self, caches */
/*
 * Service worker BioAuth (PWA). Кэширует только оболочку интерфейса и статику; запросы к API, OIDC и
 * биометрии всегда идут в сеть и в кэш не попадают — данные пользователя и токены на устройстве не хранятся.
 */
const VERSION = 'bioauth-v3.2.0';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
const NETWORK_ONLY = /^\/(api|oidc|\.well-known)\//;

// Страница «Нет соединения» кэшируется вместе со своими скриптами и стилями — иначе без сети она не оживёт.
async function precache() {
  const cache = await caches.open(STATIC);
  await cache.addAll(PRECACHE);
  const html = await (await fetch('/offline', { cache: 'no-store' })).text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
  await cache.addAll(assets);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || NETWORK_ONLY.test(url.pathname)) return;

  // Хэшированная статика Next.js, иконки и шрифты не меняются — сначала кэш.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(woff2|svg|png|ico)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Страницы — сначала сеть (всегда свежая версия), без сети — сохранённая копия или страница «Нет сети».
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Адреса с параметрами (код авторизации, идентификатор запроса) и экраны OAuth не сохраняются.
          if (res.ok && res.type === 'basic' && !url.search && !url.pathname.startsWith('/oauth/')) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/offline'))),
    );
  }
});
