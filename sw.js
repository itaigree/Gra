const CACHE_NAME = 'shir-shel-yom-cache-v3'; // שינינו את שם הגרסה כדי לאלץ את הדפדפן לנקות את הישנה

const urlsToCache = [
  './',
  './index.html',
  './gra-logic.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// הספריות שהאפליקציה טוענת מאתרים אחרים (אותן כתובות כמו ב-index.html), כדי שתיפתח באופליין כבר מהפעם הראשונה.
// אם אחת מהן לא נטענת עכשיו ההתקנה לא נכשלת בגללה; היא תישמר בפעם הבאה שהאפליקציה תיפתח.
const externalUrls = [
  ['https://unpkg.com/react@18.3.1/umd/react.production.min.js', 'cors'],
  ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', 'cors'],
  ['https://unpkg.com/@babel/standalone@8.0.9/babel.min.js', 'cors'],
  ['https://cdn.tailwindcss.com', 'no-cors']
];

// דף האפליקציה עצמו (/Gra/)
const APP_PAGE = new URL('./', self.location).href;

self.addEventListener('install', event => {
  self.skipWaiting(); // כופה על העובד החדש להשתלט מיד על האפליקציה ולא לחכות
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all([
          cache.addAll(urlsToCache),
          ...externalUrls.map(([url, mode]) => fetch(new Request(url, { mode }))
            .then(response => (response.ok || response.type === 'opaque') && cache.put(url, response))
            .catch(() => {}))
        ]);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // מוחק כל זיכרון ישן של האפליקציה הזו שאינו הגרסה הנוכחית
          // הזיכרון משותף לכל האפליקציות ב-itaigree.github.io, לכן לא נוגעים בזיכרון של אפליקציות אחרות
          if (cacheName.startsWith('shir-shel-yom-cache-') && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // מחיל את העדכון מיד על כל החלונות הפתוחים
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // דף האפליקציה נשמר תמיד תחת './', גם כשהוא נפתח מקישור עם פרמטרים (למשל ?fbclid=...)
  const url = new URL(request.url);
  const page = url.origin + url.pathname;
  const isAppPage = request.mode === 'navigate' && (page === APP_PAGE || page === APP_PAGE + 'index.html');
  const cacheKey = isAppPage ? './' : request;
  // רק מהזיכרון של האפליקציה הזו, לא של אפליקציות אחרות באותו אתר. ignoreVary: אתר שמוסיף Vary (למשל Vary: Origin)
  // לא ימנע שימוש בעותק ששמרנו בהתקנה
  const fromCache = () => caches.open(CACHE_NAME).then(cache => cache.match(cacheKey, { ignoreVary: true }));

  // אסטרטגיית Network First: תמיד נסה להביא מהאינטרנט קודם כדי לקבל עדכונים
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.status >= 400) {
          // שגיאת שרת (למשל 404 או 500): עדיף העותק השמור, אם יש כזה
          return fromCache().then(cached => cached || response);
        }
        // אם הצלחנו להביא מהאינטרנט, נשמור עותק חדש בזיכרון למקרה שנהיה באופליין אחר כך.
        // שומרים גם את מה שמגיע מאתרים אחרים (React, Babel, Tailwind, גופנים, Hebcal, Sefaria) -
        // בלעדיהם האפליקציה נפתחת באופליין כדף לבן. תשובה opaque (בלי CORS) אי אפשר לבדוק אם היא תקינה,
        // ולכן היא נשמרת רק אם עוד אין עותק.
        if (response.ok || response.type === 'opaque') {
          const responseToCache = response.clone();
          const saving = caches.open(CACHE_NAME).then(cache => response.type === 'opaque'
            ? cache.match(cacheKey, { ignoreVary: true }).then(cached => cached || cache.put(cacheKey, responseToCache))
            : cache.put(cacheKey, responseToCache)).catch(() => {});
          try { event.waitUntil(saving); } catch (e) { /* העותק נשמר בכל מקרה */ }
        }
        return response;
      })
      .catch(() => {
        // אם ה-fetch נכשל (אין אינטרנט), נביא את מה ששמור בזיכרון
        return fromCache().then(cached => cached || Response.error());
      })
  );
});
