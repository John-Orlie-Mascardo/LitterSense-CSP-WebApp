import { randomUUID } from "node:crypto";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { getFirestoreRestClient } from "@/lib/utils/firestoreRest";
import { isEnrollmentActive, RFID_ENROLLMENT_MS, RFID_ENROLLMENT_PATH, type RfidEnrollment } from "@/lib/utils/rfidEnrollment";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

async function owner(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  try { return (await getAdminAuth().verifyIdToken(token)).uid; } catch { return ""; }
}

export async function GET(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const doc = await getFirestoreRestClient().getDocument(`users/${uid}/${RFID_ENROLLMENT_PATH}`);
    const enrollment = doc?.data as RfidEnrollment | undefined;
    return Response.json((enrollment && isEnrollmentActive(enrollment)) || enrollment?.status === "verified" ? enrollment : { status: "expired" }, { headers });
  } catch { return Response.json({ error: "Unable to read scanner status" }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const client = getFirestoreRestClient();
    const snapshot = await client.getDocument(`users/${uid}/deviceState/current`);
    const deviceId = snapshot?.data.deviceId;
    const updatedAt = Date.parse(String(snapshot?.data.updatedAt ?? ""));
    if (typeof deviceId !== "string" || !deviceId || !Number.isFinite(updatedAt) || updatedAt > Date.now() || Date.now() - updatedAt > 180_000 || snapshot?.data.sessionActive === true) {
      return Response.json({ error: "RFID reader must be online and idle before scanning." }, { status: 409, headers });
    }
    const enrollment: RfidEnrollment = { id: randomUUID(), deviceId, status: "waiting", count: 0, tag: "", lastScanId: -1, error: "", expiresAt: Date.now() + RFID_ENROLLMENT_MS };
    await client.commit([client.createSetWrite(`users/${uid}/${RFID_ENROLLMENT_PATH}`, enrollment)]);
    return Response.json(enrollment, { headers });
  } catch { return Response.json({ error: "Unable to start RFID scan" }, { status: 503, headers }); }
}

export async function DELETE(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const id = (await request.json() as { id?: unknown }).id;
    if (typeof id !== "string") return Response.json({ error: "Invalid scan" }, { status: 400, headers });
    const client = getFirestoreRestClient();
    const path = `users/${uid}/${RFID_ENROLLMENT_PATH}`;
    const current = await client.getDocument(path);
    if (current?.data.id === id) await client.commit([client.createSetWrite(path, { ...current.data, status: "cancelled", expiresAt: 0, tag: "" })]);
    return Response.json({ ok: true }, { headers });
  } catch { return Response.json({ error: "Unable to stop RFID scan" }, { status: 503, headers }); }
}
