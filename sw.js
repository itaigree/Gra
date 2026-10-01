const CACHE_NAME = 'shir-shel-yom-cache-v2'; // שינינו את שם הגרסה כדי לאלץ את הדפדפן לנקות את הישנה

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // כופה על העובד החדש להשתלט מיד על האפליקציה ולא לחכות
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // מוחק כל זיכרון ישן שאינו הגרסה הנוכחית (v2)
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // מחיל את העדכון מיד על כל החלונות הפתוחים
  );
});

self.addEventListener('fetch', event => {
  // אסטרטגיית Network First: תמיד נסה להביא מהאינטרנט קודם כדי לקבל עדכונים
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // אם הצלחנו להביא מהאינטרנט, נשמור עותק חדש בזיכרון למקרה שנהיה באופליין אחר כך
        if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // אם ה-fetch נכשל (אין אינטרנט), נביא את מה ששמור בזיכרון
        return caches.match(event.request);
      })
  );
});
