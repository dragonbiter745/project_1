// REVA Food Court service worker: shows web push notifications and opens the right screen on tap.
// Pushes are data-only ({ title, body, link, tag }) so this file decides how they look.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || payload;
  const title = data.title || 'REVA Food Court';
  event.waitUntil(
    (async () => {
      // The app is open and in front: it shows the message itself instead of a system notification.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const front = windows.find((w) => w.focused && w.visibilityState === 'visible');
      if (front) {
        front.postMessage({ type: 'fc-push', title, body: data.body || '', link: data.link || '/' });
        return;
      }
      await self.registration.showNotification(title, {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        vibrate: [120, 60, 120],
        data: { link: data.link || '/' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    (async () => {
      const url = new URL(link, self.location.origin);
      if (url.origin !== self.location.origin) return;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) await w.navigate(url.href).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })()
  );
});
