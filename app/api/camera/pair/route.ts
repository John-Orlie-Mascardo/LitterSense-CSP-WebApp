import { randomBytes } from "node:crypto";
import { getAdminFirestore } from "@/lib/configs/firebase-admin";
import { CAMERA_ID, NO_STORE, cameraKeyHash, cameraOwner, cameraRelayConfig } from "@/lib/server/cameraCloud";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let ownerId: string;
  try { ownerId = await cameraOwner(request); }
  catch { return Response.json({ error: "Sign in to pair your camera." }, { status: 401, headers: NO_STORE }); }
  try {
    cameraRelayConfig();
    const origin = new URL(process.env.CAMERA_APP_ORIGIN || request.url).origin;
    if (!origin.startsWith("https://")) return Response.json({ error: "Pair from the deployed HTTPS website." }, { status: 400, headers: NO_STORE });
    const deviceId = `cam_${randomBytes(16).toString("hex")}`;
    const key = randomBytes(32).toString("hex");
    const db = getAdminFirestore();
    const ownerRef = db.doc(`users/${ownerId}/deviceState/camera`);
    await db.runTransaction(async tx => {
      const previous = (await tx.get(ownerRef)).data()?.deviceId;
      if (typeof previous === "string" && CAMERA_ID.test(previous)) {
        const previousRef = db.doc(`cameraDevices/${previous}`);
        const old = await tx.get(previousRef);
        if (old.data()?.ownerId === ownerId) tx.update(previousRef, { revoked: true });
      }
      tx.create(db.doc(`cameraDevices/${deviceId}`), {
        ownerId, keyHash: cameraKeyHash(key), revoked: false, createdAt: new Date().toISOString(),
      });
      tx.set(ownerRef, { deviceId, pairedAt: new Date().toISOString() });
    });
    return Response.json({ pairingCode: `${origin}/api/camera/device-session#${deviceId}.${key}` }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Camera pairing unavailable. Check the cloud relay configuration." }, { status: 503, headers: NO_STORE });
  }
}
