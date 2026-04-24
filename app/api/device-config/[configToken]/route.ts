import { getApp, getApps, initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore } from "firebase/firestore/lite";

export const runtime = "nodejs";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const FIREBASE_AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const FIREBASE_MESSAGING_SENDER_ID = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const FIREBASE_APP_ID = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
const FIREBASE_MEASUREMENT_ID = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

const getDb = () => {
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
    return null;
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey: FIREBASE_API_KEY,
        authDomain: FIREBASE_AUTH_DOMAIN,
        projectId: FIREBASE_PROJECT_ID,
        storageBucket: FIREBASE_STORAGE_BUCKET,
        messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
        appId: FIREBASE_APP_ID,
        measurementId: FIREBASE_MEASUREMENT_ID,
      });

  return getFirestore(app);
};

const getString = (value: unknown) => (typeof value === "string" ? value : "");

const getUpdatedAt = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return "";
};

const getErrorCode = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return "";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error.";
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ configToken: string }> },
) {
  const db = getDb();
  if (!db) {
    return Response.json(
      { error: "Missing Firebase configuration." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { configToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,}$/.test(configToken)) {
    return Response.json(
      { error: "Invalid config token." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const configSnap = await getDoc(doc(db, "deviceConfigs", configToken));
    if (!configSnap.exists()) {
      return Response.json(
        { error: "Device config not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data = configSnap.data();

    return Response.json(
      {
        configToken,
        deviceName: getString(data.deviceName),
        wifiSsid: getString(data.wifiSsid),
        wifiPassword: getString(data.wifiPassword),
        updatedAt: getUpdatedAt(data.updatedAt),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    console.error("Failed to read device provisioning config.", {
      configToken,
      code,
      message,
    });

    if (code === "permission-denied") {
      return Response.json(
        {
          error: "Device config is blocked by Firestore rules.",
          code,
          detail:
            "Deploy the latest firestore.rules so deviceConfigs/{configToken} allows public get access.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        error: "Device config unavailable.",
        code,
        detail: message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
