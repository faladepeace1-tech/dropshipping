const CACHE = 'nexatech-dm-v1';
const ASSETS = [
  '/manifest.webmanifest',
  '/inbox.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || 'Nexatech';
  const options = {
    body: data.body || 'You have a new message.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'nexatech-message',
    data: { url: data.url || '/messages' },
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data?.url || '/messages', self.location.origin).href; }
  catch { target = self.location.origin + '/messages'; }
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      let url;
      try { url = new URL(client.url); } catch { continue; }
      if (url.origin !== self.location.origin) continue;
      if (client.url === target) return client.focus();
      if ('navigate' in client) await client.navigate(target);
      return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
