import { createHash } from "node:crypto";
import { findCatIdByRfid, type SensorSyncRequest } from "./sensorSync";
import { normalizeGasUltrasonic } from "./gasUltrasonic";
import { INCOMPLETE_SESSION_FLOOR_SECS, DASHBOARD_DURATION_UPPER_MINS, DASHBOARD_VISIT_WARNING_COUNT } from "../configs/behaviorThresholds";

type SmsAccount = { cats: Array<{ id: string; rfidTag: string }> };

export function buildSmsVisits(account: SmsAccount, normalized: SensorSyncRequest) {
  const tags: Array<[string, { rfidTag: string }]> = account.cats.map((cat) => [cat.id, { rfidTag: cat.rfidTag }]);
  return normalized.events.flatMap((event) => {
    // Stable firmware IDs are required: an inferred arrival timestamp changes on retry.
    if (!event.eventId || event.eventId.length > 128 || event.status === "SHORT_SESSION" || event.durationSecs < INCOMPLETE_SESSION_FLOOR_SECS) return [];
    const matches = tags.filter((tag) => findCatIdByRfid([tag], event.rfidCard, event.rfidHex));
    if (matches.length !== 1) return [];
    const catId = matches[0][0];
    const reason = event.status === "NO_EXIT_TIMEOUT" ? "No exit timeout" : event.durationSecs >= DASHBOARD_DURATION_UPPER_MINS * 60 ? "Extended duration" : event.status === "ABNORMAL" ? "Abnormal activity" : "";
    return [{ catId, eventId: event.eventId, occurredAt: event.endedAt, reason }];
  });
}

export async function queueSensorSms(body: unknown, configToken: string, normalized: SensorSyncRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { recognized: false, queued: 0 };
  const gasPayload = typeof body === "object" && body !== null && "source" in body && body.source === "gas-ultrasonic";
  const gas = gasPayload ? normalizeGasUltrasonic(body) : null;
  if (gasPayload && !gas) return { recognized: false, queued: 0 };
  if (!gas && normalized.events.length === 0) return { recognized: false, queued: 0 };
  if (normalized.events.length > 100) throw new Error("SMS event batch is too large");
  const tokenHash = createHash("sha256").update(configToken).digest("hex");
  const headers = { apikey: key, "Content-Type": "application/json" };
  const accountResponse = await fetch(`${url}/rest/v1/sms_devices?token_hash=eq.${tokenHash}&select=sms_accounts(owner_id,cats)`, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!accountResponse.ok) throw new Error(`SMS account lookup returned ${accountResponse.status}`);
  const accounts = await accountResponse.json() as Array<{ sms_accounts: SmsAccount & { owner_id: string } }>;
  const account = accounts[0]?.sms_accounts;
  if (!account) return { recognized: false, queued: 0 };
  const response = await fetch(`${url}/rest/v1/rpc/ingest_sensor_sms`, {
    method: "POST", headers, cache: "no-store", signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ p_token_hash: tokenHash, p_visits: buildSmsVisits(account, normalized), p_gas: gas ? { ammonia: gas.mq135Raw === 0, h2s: gas.mq136Raw === 0 } : null, p_visit_limit: DASHBOARD_VISIT_WARNING_COUNT }),
  });
  if (!response.ok) throw new Error(`SMS queue returned ${response.status}`);
  const result = await response.json() as { recognized: boolean; queued: number };
  return { ...result, ownerId: account.owner_id };
}
