import { getAdminAuth } from "@/lib/configs/firebase-admin";
import { getFirestoreRestClient } from "@/lib/utils/firestoreRest";
import { buildSmsAccountBackup, saveSmsAccountBackup } from "@/lib/utils/smsAccountSync";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let uid: string;
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch { return Response.json({ error: "Unauthorized" }, { status: 401, headers }); }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ error: "SMS backup storage is not configured" }, { status: 503, headers });
  }
  try {
    const client = getFirestoreRestClient();
    const [profile, settings, cats, details, config] = await Promise.all([
      client.getDocument(`users/${uid}`),
      client.getDocument(`users/${uid}/settings/notifications`),
      client.listDocuments(`users/${uid}/cats`),
      client.listDocuments(`users/${uid}/catDetails`),
      client.getDocument(`users/${uid}/deviceConfig/default`),
    ]);
    if (!profile) return Response.json({ error: "Owner profile not found" }, { status: 409, headers });
    // Validate device ownership before copying the hashed token.
    if (config?.data.configToken) {
      const device = await client.getDocument(`deviceConfigs/${config.data.configToken}`);
      if (device?.data.ownerId !== uid) throw new Error("Device ownership mismatch");
    }
    const backup = buildSmsAccountBackup(uid, profile.data, settings?.data ?? {}, cats, details, config?.data ?? {});
    await saveSmsAccountBackup(backup);
    return Response.json({ synced: true, cats: cats.length, phoneConfigured: !!backup.p_phone_number, deviceConfigured: !!backup.p_token_hash }, { headers });
  } catch {
    return Response.json({ error: "SMS backup could not sync. The previous backup was preserved." }, { status: 503, headers });
  }
}
