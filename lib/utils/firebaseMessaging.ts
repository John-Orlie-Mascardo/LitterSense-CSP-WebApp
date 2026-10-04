import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/configs/firebase";
import { auth } from "@/lib/configs/firebase";

export async function getFirebaseMessagingToken() {
  if (!(await isSupported())) return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Push notifications are not configured on the server yet.");

  const registration = "serviceWorker" in navigator
    ? await navigator.serviceWorker.register("/sw.js")
    : undefined;

  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (token && auth.currentUser) {
    const response = await fetch('/api/push/register', { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error('Unable to save this device for push notifications. Try again.');
  }
  return token;
}

export async function unregisterFirebaseMessagingToken() {
  if (!(await isSupported()) || !auth.currentUser || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return;
  const messaging = getMessaging(app);
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
    if (token) await fetch('/api/push/register', { method: 'POST', headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, remove: true }) });
  } finally { await deleteToken(messaging); }
}
