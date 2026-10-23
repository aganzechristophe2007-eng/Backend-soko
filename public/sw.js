/* Service worker CBF SOKO : affiche les notifications push, fait sonner la page si elle est ouverte
   et ouvre la bonne page au clic. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Fichiers légers générés par make-notif-icons.mjs (dans public/).
// Un logo lourd retarde l'affichage : la notification attend que l'image soit téléchargée.
const ICON = '/notif-icon-192.png';  // grande image de la notification
const BADGE = '/notif-badge-96.png'; // petite icône d'en-tête (là où Chrome met son logo) et barre d'état

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

  // La notification s'affiche tout de suite ; la sonnerie de la page part en parallèle.
  const show = self.registration.showNotification(title, {
    body: String(payload.body || '').slice(0, 200),
    icon: ICON,
    badge: BADGE,
    tag: payload.tag || undefined,
    renotify: !!payload.tag, // sonne même si elle remplace une notification du même tag
    vibrate: [200, 100, 200],
    silent: false,
    data: { url: safeUrl(payload.url) },
  });

  const ring = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((client) => client.postMessage({ type: 'PLAY_NOTIFICATION_SOUND' })));

  event.waitUntil(Promise.all([show, ring]));
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