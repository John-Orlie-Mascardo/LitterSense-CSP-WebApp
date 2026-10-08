import { createHash } from "node:crypto";
import { smsStoreRequest } from "./smsAccountSync";

export type SensorSource = "rfid" | "gas-ultrasonic";
export type StoredSensorSnapshot = { source: SensorSource; data: Record<string, unknown>; receivedAt: string };

export function selectSensorSnapshot(source: SensorSource, firebase: StoredSensorSnapshot | null, mirrors: StoredSensorSnapshot[], now: number): StoredSensorSnapshot | null {
  let selected: StoredSensorSnapshot | null = null;
  for (const snapshot of [firebase, ...mirrors]) {
    if (!snapshot || snapshot.source !== source) continue;
    const receipt = Date.parse(snapshot.receivedAt);
    if (!Number.isFinite(receipt) || receipt > now) continue;
    if (!selected || receipt > Date.parse(selected.receivedAt)) selected = snapshot;
  }
  return selected;
}

const RFID_FIELDS = ["online", "rfidHex", "rfidCard", "lastRfidMs", "rfidEvent", "sessionActive", "activeRfidHex", "activeRfidCard", "activeSessionStartMs", "activeSessionDurationMs", "currentSessionStatus", "lastSessionStatus", "lastSessionDurationMs", "lastSessionEndMs", "completedSessionCount", "falseEntryCount", "noExitTimeoutCount", "noExitTimeoutMs", "lastRecordedEventId"];
const GAS_FIELDS = ["gasUltrasonicOnline", "mq135", "mq136", "mq135Raw", "mq136Raw", "distanceCm"];

function tokenHash(configToken: string) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(configToken)) throw new Error("Invalid sensor config token");
  return createHash("sha256").update(configToken).digest("hex");
}

function owner(ownerId: string) {
  if (!ownerId || ownerId.length > 128) throw new Error("Invalid sensor owner");
  return ownerId;
}

async function rpc(path: string, body: Record<string, unknown>, returnsJson = true) {
  const response = await smsStoreRequest(`rpc/${path}`, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Sensor mirror storage returned ${response.status}`);
  return returnsJson ? response.json() : undefined;
}

// Call only after the active primary store has verified ownership. This does not rotate other mappings.
export async function rememberSensorDevice(ownerId: string, configToken: string): Promise<void> {
  await rpc("remember_sensor_device", { p_owner_id: owner(ownerId), p_token_hash: tokenHash(configToken) }, false);
}

export async function saveSensorMirror(configToken: string, source: SensorSource, data: Record<string, unknown>, receivedAt: string): Promise<boolean> {
  if (source !== "rfid" && source !== "gas-ultrasonic") throw new Error("Invalid sensor source");
  const receipt = Date.parse(receivedAt);
  if (!Number.isFinite(receipt) || receipt > Date.now() + 5000) throw new Error("Invalid sensor receipt timestamp");
  const fields = source === "rfid" ? RFID_FIELDS : GAS_FIELDS;
  const clean: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data[field];
    if (value === null || typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) clean[field] = value;
  }
  if (JSON.stringify(clean).length > 16384) throw new Error("Sensor snapshot too large");
  return await rpc("save_sensor_mirror", { p_token_hash: tokenHash(configToken), p_source: source, p_data: clean, p_received_at: receivedAt }) === true;
}

// ownerId comes from verified Firebase identity, never the dashboard request body.
export async function readSensorMirrors(ownerId: string, configToken?: string): Promise<StoredSensorSnapshot[]> {
  let rows: Array<{ source: SensorSource; data: Record<string, unknown>; received_at: string }>;
  if (configToken) {
    // Primary reads use only the current credential, even if removal of an old alert mapping is pending.
    const response = await smsStoreRequest(`sensor_snapshots?token_hash=eq.${tokenHash(configToken)}&sms_devices.owner_id=eq.${encodeURIComponent(owner(ownerId))}&select=source,data,received_at,sms_devices!inner(owner_id)`);
    if (!response.ok) throw new Error('Sensor snapshot storage unavailable');
    rows = await response.json();
  } else rows = await rpc("read_sensor_mirrors", { p_owner_id: owner(ownerId) }) as typeof rows;
  return rows.map((row) => ({ source: row.source, data: row.data, receivedAt: row.received_at }));
}
