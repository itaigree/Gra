const CACHE_NAME = 'shir-shel-yom-cache-v1';

// הקבצים הסטטיים שנשמור כדי שהאפליקציה תטען מהר ותעבוד (חלקית) באופליין
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // אם הקובץ נמצא בזיכרון המטמון - נחזיר אותו. אחרת, נמשוך מהרשת.
        if (response) {
          return response;
        }
        
        // עבור קריאות ל-API של הלוח והפסוקים, נשתמש תמיד ברשת קודם
        return fetch(event.request).catch(() => {
            console.log('Network request failed, user might be offline.');
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
