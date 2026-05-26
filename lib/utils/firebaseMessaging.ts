import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { app } from "@/lib/configs/firebase";

export async function getFirebaseMessagingToken() {
  if (!(await isSupported())) return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) return null;

  const registration = "serviceWorker" in navigator
    ? await navigator.serviceWorker.register("/sw.js")
    : undefined;

  return getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
}
