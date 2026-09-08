// Service worker for "فهرست" checklist PWA.
// Caches all app shell files on install so the app works fully offline
// after the first successful load, and serves from cache with a
// network-fallback-then-update strategy.

var CACHE_NAME = 'checklist-app-cache-v1';

var ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './qrcode-lib.js',
  './manifest.json',
  './icons/icon-48.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(function(){
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(cacheNames){
      return Promise.all(
        cacheNames
          .filter(function(name){ return name !== CACHE_NAME; })
          .map(function(name){ return caches.delete(name); })
      );
    }).then(function(){
      return self.clients.claim();
    })
  );
});

// Strategy: try the network first (so updates are picked up when online),
// fall back to cache when offline. Google Fonts requests are excluded from
// this app-shell cache management (browser's own HTTP cache handles those,
// and the app must still work offline even if fonts can't load).
self.addEventListener('fetch', function(event){
  var requestUrl = new URL(event.request.url);

  // Only handle same-origin requests for the app shell; let cross-origin
  // requests (like the Google Fonts CSS/font files) pass through normally.
  if (requestUrl.origin !== self.location.origin){
    return;
  }

  event.respondWith(
    fetch(event.request).then(function(networkResponse){
      var responseClone = networkResponse.clone();
      caches.open(CACHE_NAME).then(function(cache){
        cache.put(event.request, responseClone);
      });
      return networkResponse;
    }).catch(function(){
      return caches.match(event.request).then(function(cachedResponse){
        return cachedResponse || caches.match('./index.html');
      });
    })
  );
});
