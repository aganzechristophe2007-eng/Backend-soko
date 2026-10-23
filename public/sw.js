/* Service worker CBF SOKO : affiche les notifications push, fait sonner la page si elle est ouverte
   et ouvre la bonne page au clic. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const ICON = '/favicon.png'; // dans public/
const BADGE = '/favicon.png'; // idéal : un PNG blanc sur fond transparent (petite icône de la barre d'état)

// Seules les routes internes sont acceptées ("//" et les URL externes sont rejetées)
const safeUrl = (u) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : '/notifications');

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'CBF SOKO', body: event.data ? event.data.text() : '' };
  }

  const title = String(payload.title || 'CBF SOKO').slice(0, 80);

  event.waitUntil(
    (async () => {
      // 1. Notification système : logo, vibration, son du téléphone
      await self.registration.showNotification(title, {
        body: String(payload.body || '').slice(0, 200),
        icon: ICON,
        badge: BADGE,
        tag: payload.tag || undefined,
        renotify: !!payload.tag, // sonne même si elle remplace une notification du même tag
        vibrate: [200, 100, 200],
        silent: false,
        data: { url: safeUrl(payload.url) },
      });

      // 2. Appli ouverte : la page joue la sonnerie CBF SOKO
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({ type: 'PLAY_NOTIFICATION_SOUND' });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});