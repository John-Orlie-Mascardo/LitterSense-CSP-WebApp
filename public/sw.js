globalThis.addEventListener('install', () => globalThis.skipWaiting());
globalThis.addEventListener('activate', event => event.waitUntil(clients.claim()));
function notificationUrl(value) {
  const url = new URL(value || '/dashboard', location.origin);
  return url.origin === location.origin ? url.href : new URL('/dashboard', location.origin).href;
}
globalThis.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { /* Keep a usable notification for malformed payloads. */ }
  const notification = payload.notification ?? payload;
  const data = payload.data ?? payload;
  const title = notification.title || 'LitterSense Alert';
  const body = notification.body || 'Open LitterSense to review the alert.';
  const url = notificationUrl(data.url);
  event.waitUntil((async () => {
    await globalThis.registration.showNotification(title, { body, icon: '/icons/icon-192x192.png', badge: '/icons/icon-192x192.png', tag: data.eventKey || data.tag || undefined, data: { url } });
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) if (client.visibilityState === 'visible') client.postMessage({ type: 'littersense-push', title, body, url });
  })());
});
globalThis.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = notificationUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find(client => client.url === url);
    if (current) return current.focus();
    return clients.openWindow(url);
  })());
});
