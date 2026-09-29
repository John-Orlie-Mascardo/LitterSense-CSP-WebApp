import { NO_STORE, CAMERA_TTL_SECONDS, cameraOwner, cameraRelayConfig, cameraTicket, ownerCamera } from "@/lib/server/cameraCloud";

export const runtime = "nodejs";
export async function GET(request: Request) {
  let ownerId: string;
  try { ownerId = await cameraOwner(request); }
  catch { return Response.json({ error: "Sign in to view your camera." }, { status: 401, headers: NO_STORE }); }
  try {
    const camera = await ownerCamera(ownerId);
    if (!camera) return Response.json({ error: "Pair your camera to enable remote viewing." }, { status: 404, headers: NO_STORE });
    const relay = cameraRelayConfig();
    const ticket = cameraTicket(camera.deviceId, "view", relay.secret);
    return Response.json({ frameUrl: `${relay.origin}/v1/frame?ticket=${ticket}`, expiresIn: CAMERA_TTL_SECONDS }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Remote camera hosting is not configured or is unavailable." }, { status: 503, headers: NO_STORE });
  }
}
