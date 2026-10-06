import { createHash } from "node:crypto";
import type { FirestoreRestDocument } from "./firestoreRest";

// Build exclusively from server-read Firebase records, never browser payloads.
export function buildSmsAccountBackup(ownerId: string, profile: Record<string, unknown>, notifications: Record<string, unknown>, cats: FirestoreRestDocument[], details: FirestoreRestDocument[], config: Record<string, unknown>) {
  const savedPhone = typeof profile.phoneNumber === "string" ? profile.phoneNumber.trim() : "";
  const phone = /^\+639\d{9}$/.test(savedPhone) ? savedPhone : "";
  if (!phone) console.warn("[sms] Skipping SMS: profile has no valid Philippine mobile number.");
  const token = typeof config.configToken === "string" ? config.configToken : "";
  const detailMap = new Map(details.map((cat) => [cat.id, cat.data]));
  return {
    p_owner_id: ownerId,
    p_phone_number: phone,
    p_notifications: {
      healthAlerts: notifications.healthAlerts !== false,
      ammoniaAlerts: notifications.ammoniaAlerts !== false,
      h2sAlerts: notifications.h2sAlerts !== false,
      rfidVisitAlerts: notifications.rfidVisitAlerts === true,
      litterLevelWarnings: notifications.litterLevelWarnings !== false,
      quietHours: notifications.quietHours ?? { enabled: false },
      perCat: Array.isArray(notifications.perCat) ? notifications.perCat.map((value) => {
        const pref = value as Record<string, unknown>;
        return { catId: String(pref.catId ?? ""), healthAlerts: pref.healthAlerts !== false, visitAlerts: pref.visitAlerts !== false };
      }) : [],
    },
    p_cats: cats.map((cat) => {
      const detail = detailMap.get(cat.id) ?? {};
      return { id: cat.id, name: String(cat.data.name ?? "Unnamed cat"), rfidTag: String(detail.rfidTag ?? "").replace(/[^a-f0-9]/gi, "").toUpperCase(), baseline: detail.baseline ?? null };
    }),
    p_token_hash: token ? createHash("sha256").update(token).digest("hex") : null,
  };
}

export async function saveSmsAccountBackup(backup: ReturnType<typeof buildSmsAccountBackup>) {
  const response = await smsStoreRequest("rpc/sync_sms_account", { method: "POST", body: JSON.stringify(backup) });
  if (!response.ok) throw new Error(`SMS backup storage returned ${response.status}`);
}

export async function smsStoreRequest(path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("SMS backup storage is not configured");
  return fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init, headers: { apikey: key, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
}
