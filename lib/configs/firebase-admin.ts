/**
 * Firebase Admin SDK — server-side only.
 *
 * Reads the service account from FIREBASE_SERVICE_ACCOUNT_BASE64 (base64-encoded JSON).
 * Never expose this to the client — no NEXT_PUBLIC_ prefix.
 */

import { cert, getApps, initializeApp, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";

let adminApp: App;
let adminAuth: Auth;

function getAdminApp(): App {
  if (getApps().length > 0) {
    return (adminApp = getApps()[0]);
  }

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!base64) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable. " +
      "Set it in .env.local as the base64-encoded service account JSON."
    );
  }

  const serviceAccount = JSON.parse(
    Buffer.from(base64, "base64").toString("utf-8")
  );

  adminApp = initializeApp({ credential: cert(serviceAccount) });
  return adminApp;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}
