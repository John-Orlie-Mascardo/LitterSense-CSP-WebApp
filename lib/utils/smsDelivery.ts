import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { smsStoreRequest } from "./smsAccountSync";
import { buildAlertMessage, type AlertContext } from "./smsTemplates";

type NotificationPrefs = { healthAlerts?: boolean; ammoniaAlerts?: boolean; h2sAlerts?: boolean; perCat?: Array<{ catId: string; healthAlerts?: boolean }>; quietHours?: { enabled?: boolean; from?: string; to?: string } };
type SmsAccount = { phone_number: string; notifications: NotificationPrefs; cats: Array<{ id: string; name?: string }> };
type SmsRecord = { id: string; owner_id: string; cat_id: string | null; reason: string; message: string; context?: AlertContext; created_at?: string; provider_message_id?: string };

export function smsDeliveryDecision(account: SmsAccount, record: SmsRecord, now = new Date()) {
  if (!/^\+639\d{9}$/.test(account.phone_number)) return "cancel";
  const prefs = account.notifications;
  if (record.cat_id && (!account.cats.some((cat) => cat.id === record.cat_id) || prefs.healthAlerts === false || prefs.perCat?.some((pref) => pref.catId === record.cat_id && pref.healthAlerts === false))) return "cancel";
  if (record.reason === "Ammonia detected" && prefs.ammoniaAlerts === false) return "cancel";
  if (record.reason === "Hydrogen sulfide detected" && prefs.h2sAlerts === false) return "cancel";
  const quiet = prefs.quietHours;
  if (quiet?.enabled) {
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!quiet.from || !quiet.to || !valid.test(quiet.from) || !valid.test(quiet.to)) return "defer";
    if (quiet.from === quiet.to || (quiet.from < quiet.to ? time >= quiet.from && time < quiet.to : time >= quiet.from || time < quiet.to)) return "defer";
  }
  return "send";
}

export function providerDeliveryStatus(value: unknown) {
  if (value === "completed" || value === "delivered") return "delivered";
  if (value === "failed" || value === "undelivered" || value === "rejected") return "failed";
  return "accepted";
}

async function updateRecord(id: string, patch: Record<string, unknown>, current: string) {
  const response = await smsStoreRequest(`sms_outbox?id=eq.${encodeURIComponent(id)}&status=eq.${current}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!response.ok) throw new Error("Unable to record SMS delivery status");
}

export async function processSmsOutbox(ownerId?: string) {
  // Deployment gate: preparing settings or running a build never sends SMS.
  if (process.env.SMS_SENDING_ENABLED !== "true") return { enabled: false, processed: 0 };
  const apiToken = process.env.IPROGSMS_API_TOKEN;
  if (!apiToken) throw new Error("SMS provider is not configured");
  const claimed = await smsStoreRequest("rpc/claim_sms_outbox", { method: "POST", body: JSON.stringify({ p_owner_id: ownerId ?? null, p_limit: 2 }) });
  if (!claimed.ok) throw new Error("Unable to claim SMS queue");
  const records = await claimed.json() as SmsRecord[];
  for (const record of records) {
    // Re-read after the atomic claim to honor opt-out and device removal before dispatch.
    const latest = await smsStoreRequest(`sms_outbox?id=eq.${encodeURIComponent(record.id)}&status=eq.sending&select=sms_accounts(phone_number,notifications,cats)`);
    if (!latest.ok) throw new Error("Unable to verify current SMS recipient");
    const account = (await latest.json() as Array<{ sms_accounts: SmsAccount }>)[0]?.sms_accounts;
    if (!account) continue;
    const decision = smsDeliveryDecision(account, record);
    if (decision !== "send") {
      if (!/^\+639\d{9}$/.test(account.phone_number)) console.warn("[sms] Skipping SMS: profile has no valid Philippine mobile number.");
      await updateRecord(record.id, { status: decision === "defer" ? "pending" : "cancelled", error_code: decision === "defer" ? "quiet_hours" : "recipient_disabled" }, "sending");
      continue;
    }
    try {
      const owner = await getAdminAuth().getUser(record.owner_id);
      if (owner.disabled) { await updateRecord(record.id, { status: "cancelled", error_code: "account_disabled" }, "sending"); continue; }
    } catch (error) {
      const deleted = typeof error === "object" && error !== null && "code" in error && error.code === "auth/user-not-found";
      await updateRecord(record.id, { status: deleted ? "cancelled" : "pending", error_code: deleted ? "account_deleted" : "account_check_unavailable" }, "sending");
      continue;
    }
    let outcome: Record<string, unknown>;
    try {
      const response = await fetch("https://www.iprogsms.com/api/v1/sms_messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_token: apiToken, phone_number: account.phone_number.slice(1), message: buildAlertMessage(record.reason, { ...record.context, catName: account.cats.find(cat => cat.id === record.cat_id)?.name, occurredAt: record.context?.occurredAt ?? record.created_at }) }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = await response.json().catch(() => null) as { status?: unknown; message_id?: unknown } | null;
      outcome = response.ok && result?.status === 200 && typeof result.message_id === "string" && result.message_id
        ? { status: "accepted", provider_message_id: result.message_id, error_code: null }
        : { status: response.status >= 400 && response.status < 500 ? "failed" : "unknown", error_code: "provider_not_confirmed" };
    } catch {
      // IPROG has no documented idempotency key. A timeout might already have sent.
      outcome = { status: "unknown", error_code: "provider_outcome_unknown" };
    }
    await updateRecord(record.id, outcome, "sending");
  }
  const query = `sms_outbox?status=eq.accepted&select=id,provider_message_id&order=last_checked_at.asc.nullsfirst,created_at.asc&limit=2${ownerId ? `&owner_id=eq.${encodeURIComponent(ownerId)}` : ""}`;
  const accepted = await smsStoreRequest(query);
  if (!accepted.ok) throw new Error("Unable to read SMS delivery checks");
  for (const record of await accepted.json() as SmsRecord[]) {
    if (!record.provider_message_id) continue;
    const url = new URL("https://www.iprogsms.com/api/v1/sms_messages/status");
    url.searchParams.set("api_token", apiToken);
    url.searchParams.set("message_id", record.provider_message_id);
    let status = "accepted";
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      const result = await response.json() as { status?: unknown; message_status?: unknown };
      if (response.ok && result.status === 200) status = providerDeliveryStatus(result.message_status);
    } catch { /* Check again on the next run; never resend an accepted message. */ }
    await updateRecord(record.id, { status, last_checked_at: new Date().toISOString() }, "accepted");
  }
  return { enabled: true, processed: records.length };
}
