import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { app, auth } from '@/lib/configs/firebase';

// Serialize renewal and repair so a focus event cannot restore the token being replaced.
let pending: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work, work);
  pending = result.catch(() => {});
  return result;
}
async function activeWorker() {
  if (!('serviceWorker' in navigator)) throw new Error('Push is unavailable in this browser.');
  const rootScope = new URL('/', globalThis.location.origin).href;
  const workerUrl = new URL('/sw.js', globalThis.location.origin).href;
  const isActiveWorker = (registration: ServiceWorkerRegistration | undefined) =>
    registration?.scope === rootScope && registration.active?.state === 'activated' && registration.active.scriptURL === workerUrl;
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      (async () => {
        // An already-installed worker can display locally without a network update.
        const existing = await navigator.serviceWorker.getRegistration('/');
        if (isActiveWorker(existing)) return existing!;
        await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
        const registration = await navigator.serviceWorker.ready;
        if (!isActiveWorker(registration)) throw new Error('Notification setup is incomplete. Reload and try again.');
        return registration;
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Notification setup took too long. Reload and try again.')), 15000); }),
    ]);
  } finally { clearTimeout(timer!); }
}
async function enroll(reconnect: boolean) {
  if (!(await isSupported())) return null;
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before enabling notifications.');
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error('Push notifications are not configured on the server yet.');
  const registration = await activeWorker();
  const messaging = getMessaging(app);
  const options = { vapidKey, serviceWorkerRegistration: registration };
  const save = async (token: string, remove = false) => {
    if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed. Enable notifications again.');
    const response = await fetch('/api/push/register', {
      method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...(remove ? { remove: true } : {}) }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Unable to save this device for push notifications. Try again.');
    if (auth.currentUser?.uid !== user.uid) throw new Error('Account changed. Enable notifications again.');
  };
  let token = await getToken(messaging, options);
  if (reconnect) {
    if (token) await save(token, true);
    await deleteToken(messaging);
    token = await getToken(messaging, options);
  }
  if (token) await save(token);
  return token;
}
export function getFirebaseMessagingToken() { return serialize(() => enroll(false)); }
export function reconnectFirebaseMessagingToken() { return serialize(() => enroll(true)); }

// Local display check deliberately bypasses FCM and never sends a server message.
export async function checkSystemNotification() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') throw new Error('Allow notifications in your browser settings first.');
  const registration = await activeWorker();
  const options: NotificationOptions & { renotify: boolean } = {
    body: 'This checks system notification display on this device. If no banner appears, check your notification panel and device notification settings.',
    icon: '/icons/icon-192x192.png', tag: 'littersense-local-check', renotify: true, data: { url: '/dashboard/settings' },
  };
  await registration.showNotification('LitterSense notification check', options);
}
export async function unregisterFirebaseMessagingToken() {
  if (!(await isSupported()) || !auth.currentUser || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return;
  return serialize(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const messaging = getMessaging(app);
    const registration = await activeWorker();
    const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
    if (token) {
      const response = await fetch('/api/push/register', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, remove: true }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Unable to remove this device notification registration. Try again.');
    }
    await deleteToken(messaging);
  });
}
