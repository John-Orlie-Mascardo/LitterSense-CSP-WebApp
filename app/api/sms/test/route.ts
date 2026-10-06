import { createHash } from "node:crypto";
import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { smsStoreRequest } from "@/lib/utils/smsAccountSync";
import { processSmsOutbox } from "@/lib/utils/smsDelivery";
import { buildAlertMessage } from "@/lib/utils/smsTemplates";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "", true)).uid; }
  catch { return Response.json({ error: "Unauthorized" }, { status: 401, headers }); }
  if (process.env.SMS_SENDING_ENABLED !== "true") return Response.json({ error: "SMS sending is not enabled yet" }, { status: 409, headers });
  try {
    const body = await request.json();
    if (body.confirmed !== true) return Response.json({ error: "Confirm sending one test SMS first" }, { status: 400, headers });
    const response = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(uid)}&select=phone_number`);
    if (!response.ok) throw new Error();
    const account = (await response.json())[0];
    if (!/^\+639\d{9}$/.test(account?.phone_number ?? "")) return Response.json({ error: "Save a valid Philippine mobile number in Edit Profile first" }, { status: 409, headers });
    const eventKey = createHash("sha256").update(`test:${uid}:${new Date().toISOString().slice(0,13)}`).digest("hex");
    const queued = await smsStoreRequest("sms_outbox?on_conflict=event_key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ event_key: eventKey, owner_id: uid, reason: "Test SMS", message: buildAlertMessage("Test SMS"), push_status: "cancelled" }) });
    if (!queued.ok) throw new Error();
    await processSmsOutbox(uid);
    return Response.json({ queued: true, message: "Test queued. Check delivery status below. One test per hour." }, { headers });
  } catch { return Response.json({ error: "Test SMS could not be processed. Check recent delivery status before retrying." }, { status: 503, headers }); }
}
