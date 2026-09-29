import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAdminAuth, getAdminFirestore } from "@/lib/configs/firebase-admin";

export const CAMERA_ID = /^cam_[a-f0-9]{32}$/;
export const CAMERA_KEY = /^[a-f0-9]{64}$/;
export const CAMERA_TTL_SECONDS = 300;
export const NO_STORE = { "Cache-Control": "no-store, private" };

export function cameraRelayConfig() {
  const secret = process.env.CAMERA_RELAY_SECRET ?? "";
  const url = new URL(process.env.CAMERA_RELAY_URL ?? "https://unconfigured.invalid");
  if (secret.length < 32 || !process.env.CAMERA_RELAY_URL || url.protocol !== "https:" ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Remote camera hosting is not configured yet.");
  }
  return { secret, origin: url.origin };
}

export function cameraTicket(deviceId: string, scope: "view" | "publish", secret: string, now = Date.now()) {
  if (!CAMERA_ID.test(deviceId)) throw new Error("Invalid camera ID");
  const payload = Buffer.from(JSON.stringify({ v: 1, deviceId, scope, exp: Math.floor(now / 1000) + CAMERA_TTL_SECONDS })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function cameraKeyHash(key: string) { return createHash("sha256").update(key).digest("hex"); }

export function matchesCameraKey(key: string, hash: unknown) {
  if (!CAMERA_KEY.test(key) || typeof hash !== "string" || !CAMERA_KEY.test(hash)) return false;
  return timingSafeEqual(Buffer.from(cameraKeyHash(key), "hex"), Buffer.from(hash, "hex"));
}

export async function cameraOwner(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  if (!value.startsWith("Bearer ")) throw new Error("Unauthorized");
  return (await getAdminAuth().verifyIdToken(value.slice(7), true)).uid;
}

export async function ownerCamera(ownerId: string) {
  const db = getAdminFirestore();
  const saved = await db.doc(`users/${ownerId}/deviceState/camera`).get();
  const id = saved.data()?.deviceId;
  if (typeof id !== "string" || !CAMERA_ID.test(id)) return null;
  const camera = await db.doc(`cameraDevices/${id}`).get();
  if (camera.data()?.ownerId !== ownerId || camera.data()?.revoked === true) return null;
  return { deviceId: id };
}
