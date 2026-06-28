const CACHE_NAME = 'lavenice-bball-v2';
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'FinalLogo.jfif'
];

// Install Lifecycle Event - Cache core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Lifecycle Event - Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// Fetch Network Requests with Offline Cache Fallback
self.addEventListener('fetch', (e) => {
  // Skip cross-origin requests (like Supabase API calls) so they don't break offline
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(e.request);
    })
  );
});