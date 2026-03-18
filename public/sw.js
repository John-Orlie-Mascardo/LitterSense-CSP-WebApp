// public/sw.js
// LitterSense Service Worker — handles push notification display

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "LitterSense Alert";
  const options = {
    body: data.body || "Your cat needs attention.",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    tag: data.tag || "littersense-alert",
    renotify: true,
    data: {
      url: data.url || "/dashboard",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});