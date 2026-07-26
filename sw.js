const CACHE_NAME = 'kota-kinabalu-guide-v58';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/firebase-config.js',
  './js/trip-room.js',
  './js/itinerary-data.js',
  './js/itinerary-editor.js',
  './js/image-url.js',
  './js/guide-context.js',
  './js/guide-content.js',
  './js/custom-sections.js',
  './js/ai-guide.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './images/kk-sunset.jpg',
  './images/kk-sunset-2.jpg',
  './images/kk-sunset-3.jpg',
  './images/kk-sunset-4.jpg',
  './images/kk-sunset-5.jpg',
  './images/tanjung-aru-islands.jpg',
  './images/manukan-beach.jpg',
  './images/kk-islands.jpg',
  './images/mangrove-boat.jpg',
  './images/gaya-market.jpg',
  './images/kkia-airport.jpg',
  './images/mount-kinabalu.jpg',
  './images/kk-tanjung-boat.jpg',
  './images/kk-sea-activity.jpg',
  './images/manukan-jetty.jpg',
  './images/manukan-view.jpg',
  './images/mamutik-sulug.jpg',
  './images/kk-jetski.jpg',
  './images/rasa-ria-shuttle.jpg'
];

function isNetworkFirst(url) {
  return url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/')
    || url.pathname.includes('/js/')
    || url.pathname.endsWith('/sw.js')
    || url.pathname.endsWith('/manifest.webmanifest');
}

function isNetworkOnlyRequest(url) {
  return /googleapis\.com|gstatic\.com|firebaseio\.com|firestore\.google|open\.er-api\.com|jsdelivr\.net|currency-api\.pages\.dev|openai\.com|api\.openai\.com/.test(url.hostname);
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'SET_APP_BADGE') return;
  const count = Math.max(0, Math.min(99, Number(data.count) || 0));
  const apply = async () => {
    try {
      if (count > 0 && self.registration.setAppBadge) {
        await self.registration.setAppBadge(count);
      } else if (count === 0 && self.registration.clearAppBadge) {
        await self.registration.clearAppBadge();
      }
    } catch (_) {}
  };
  event.waitUntil(apply());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 외부 이미지/CDN 요청은 SW가 건드리지 않음 (깨진 이미지·HTML 폴백 방지)
  if (url.origin !== self.location.origin) return;

  if (isNetworkOnlyRequest(url) || isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, copy);
          });
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
