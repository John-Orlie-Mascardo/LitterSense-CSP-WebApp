import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { smsStoreRequest } from "@/lib/utils/smsAccountSync";
const headers = { "Cache-Control": "no-store" };
export const runtime = "nodejs";
async function owner(request: Request) {
  try { return (await getAdminAuth().verifyIdToken(request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "", true)).uid; }
  catch { return ""; }
}
export function normalizeSmsPhone(value: string) {
  const digits = value.replace(/[\s()-]/g, "");
  const phone = digits.startsWith("09") ? `+63${digits.slice(1)}` : digits.startsWith("639") ? `+${digits}` : digits;
  return /^\+639\d{9}$/.test(phone) ? phone : "";
}
export async function GET(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const response = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(uid)}&select=sms_enabled,sms_phone_number,phone_number`);
    const queue = await smsStoreRequest(`sms_outbox?owner_id=eq.${encodeURIComponent(uid)}&select=status,reason,created_at,error_code&order=created_at.desc&limit=5`);
    if (!response.ok || !queue.ok) throw new Error();
    const account = (await response.json())[0];
    return Response.json({ enabled: account?.sms_enabled === true, phone: account?.sms_phone_number || account?.phone_number || "", sendingReady: process.env.SMS_SENDING_ENABLED === "true", recent: await queue.json() }, { headers });
  } catch { return Response.json({ error: "SMS settings unavailable" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  let body: { phone?: unknown; enabled?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid SMS settings" }, { status: 400, headers }); }
  const phone = typeof body.phone === "string" ? normalizeSmsPhone(body.phone) : "";
  if (typeof body.enabled !== "boolean" || (body.enabled && !phone) || (body.phone && !phone)) return Response.json({ error: "Enter a Philippine mobile number, such as 09171234567." }, { status: 400, headers });
  try {
    const response = await smsStoreRequest("rpc/set_sms_controls", { method: "POST", body: JSON.stringify({ p_owner_id: uid, p_phone: phone, p_enabled: body.enabled }) });
    if (!response.ok) throw new Error();
    return Response.json({ saved: true }, { headers });
  } catch { return Response.json({ error: "Could not save SMS settings" }, { status: 503, headers }); }
}
