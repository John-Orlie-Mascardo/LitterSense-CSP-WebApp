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
    const response = await smsStoreRequest(`sms_accounts?owner_id=eq.${encodeURIComponent(uid)}&select=phone_number`);
    const queue = await smsStoreRequest(`sms_outbox?owner_id=eq.${encodeURIComponent(uid)}&select=status,reason,created_at,error_code&order=created_at.desc&limit=5`);
    if (!response.ok || !queue.ok) throw new Error();
    const account = (await response.json())[0];
    return Response.json({ enabled: /^\+639\d{9}$/.test(account?.phone_number ?? ""), phone: account?.phone_number || "", sendingReady: process.env.SMS_SENDING_ENABLED === "true", recent: await queue.json() }, { headers });
  } catch { return Response.json({ error: "SMS settings unavailable" }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const uid = await owner(request);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json({ error: "SMS uses your Edit Profile phone number. Update it in your profile." }, { status: 410, headers });
}
