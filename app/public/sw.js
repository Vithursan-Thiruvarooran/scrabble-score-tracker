self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Skip OS notification when user already has this game page focused
      const focused = clients.some(
        c => data.game_id && c.url.includes(data.game_id) && c.visibilityState === 'visible'
      );
      if (focused) return;
      return self.registration.showNotification(data.title ?? 'Scrabble', {
        body: data.body,
        icon: '/scrabble/icons/icon-192.png',
        badge: '/scrabble/icons/icon-192.png',
        data: { url: data.url ?? '/' },
      });
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.endsWith(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
