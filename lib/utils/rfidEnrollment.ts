export const RFID_ENROLLMENT_PATH = "deviceState/rfidEnrollment";
export const RFID_ENROLLMENT_MS = 120_000;
export const RFID_HOLD_MS = 5_000;
export const RFID_PROGRESS_STALE_MS = 5_000;
export type RfidEnrollment = {
  id: string; deviceId: string;
  status: "waiting" | "ready" | "holding" | "verified" | "cancelled";
  count: number; tag: string; lastScanId: number; error: string; expiresAt: number;
  holdMs?: number; progressReceivedAt?: number;
};
export const isEnrollmentActive = (value: RfidEnrollment, now = Date.now()) =>
  ["waiting", "ready", "holding"].includes(value.status) && value.expiresAt > now;

export function acceptEnrollmentScan(
  enrollment: RfidEnrollment, scanId: number, tag: string,
  registeredTags: Array<{ tag: string; name: string }>, evidence?: unknown, now = Date.now(),
): RfidEnrollment {
  if (!isEnrollmentActive(enrollment, now) || !Number.isSafeInteger(scanId) || scanId <= enrollment.lastScanId) return enrollment;
  const next = { ...enrollment, status: "ready" as const, count: 0, holdMs: 0, tag: "", lastScanId: scanId, progressReceivedAt: now };
  const proof = evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : {};
  if (proof.version !== 2 || !Number.isSafeInteger(proof.holdMs) || Number(proof.holdMs) < 0 || Number(proof.holdMs) > RFID_HOLD_MS || typeof proof.present !== "boolean") {
    return { ...next, error: "The reader needs the five-second registration firmware. Update the reader before scanning." };
  }
  if (!proof.present) return { ...next, error: enrollment.status === "holding" || enrollment.error ? "Keep the tag on the reader for 5 seconds." : "" };
  if (!/^[A-F0-9]{4,124}$/.test(tag)) return enrollment;
  const existing = registeredTags.find(cat => cat.tag === tag);
  if (existing) return { ...next, error: `This tag belongs to ${existing.name || "another cat"}. Use a different tag.` };
  const holdMs = Number(proof.holdMs);
  return { ...next, status: holdMs === RFID_HOLD_MS ? "verified" : "holding", count: holdMs === RFID_HOLD_MS ? 1 : 0, holdMs, tag, error: "" };
}
