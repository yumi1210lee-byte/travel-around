// Service worker：讓 App 在沒有網路時也能開啟。
// 策略：先用快取立即顯示，同時在背景向網路抓新版本更新快取（stale-while-revalidate）。
// 修改檔案清單時記得調高版本號。
const CACHE = 'travel-around-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/constants.js',
  './js/forms.js',
  './js/fx.js',
  './js/fxview.js',
  './js/icons.js',
  './js/sample.js',
  './js/share.js',
  './js/store.js',
  './js/ui.js',
  './js/utils.js',
  './js/views.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || (request.mode === 'navigate' ? cache.match('./') : undefined));
      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    }),
  );
});
