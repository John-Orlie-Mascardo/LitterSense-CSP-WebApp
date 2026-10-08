import { getAdminFirestore } from "@/lib/configs/firebase-admin";
import { CAMERA_ID, CAMERA_TTL_SECONDS, NO_STORE, cameraRelayConfig, cameraTicket, matchesCameraKey, authorizeOperationalCamera } from "@/lib/server/cameraCloud";
import { rfidPrimaryEnabled } from '@/lib/server/operationalStore';

export const runtime = "nodejs";
export async function POST(request: Request) {
  const deviceId = request.headers.get("x-camera-id") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const key = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!CAMERA_ID.test(deviceId)) return new Response(null, { status: 401, headers: NO_STORE });
  try {
    if (rfidPrimaryEnabled()) {
      const relay = cameraRelayConfig();
      if (!await authorizeOperationalCamera(deviceId, key)) return new Response(null, { status: 401, headers: NO_STORE });
      return new Response(null, { status: 200, headers: { ...NO_STORE, 'X-Camera-Relay': relay.origin, 'X-Camera-Ticket': cameraTicket(deviceId, 'publish', relay.secret), 'X-Camera-Ttl': String(CAMERA_TTL_SECONDS) } });
    }
    const db = getAdminFirestore();
    const ref = db.doc(`cameraDevices/${deviceId}`);
    const config = (await ref.get()).data();
    if (!config || config.revoked || !matchesCameraKey(key, config.keyHash)) return new Response(null, { status: 401, headers: NO_STORE });
    const relay = cameraRelayConfig();
    await ref.update({ lastSeenAt: new Date().toISOString() });
    return new Response(null, { status: 200, headers: {
      ...NO_STORE,
      "X-Camera-Relay": relay.origin,
      "X-Camera-Ticket": cameraTicket(deviceId, "publish", relay.secret),
      "X-Camera-Ttl": String(CAMERA_TTL_SECONDS),
    } });
  } catch { return new Response(null, { status: 503, headers: NO_STORE }); }
}
