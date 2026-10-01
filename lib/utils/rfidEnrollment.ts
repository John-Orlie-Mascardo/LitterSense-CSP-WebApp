export const RFID_ENROLLMENT_PATH = "deviceState/rfidEnrollment";
export const RFID_ENROLLMENT_MS = 120_000;

export type RfidEnrollment = {
  id: string;
  deviceId: string;
  status: "waiting" | "ready" | "verified" | "cancelled";
  count: number;
  tag: string;
  lastScanId: number;
  error: string;
  expiresAt: number;
};

export const isEnrollmentActive = (value: RfidEnrollment, now = Date.now()) =>
  (value.status === "waiting" || value.status === "ready") && value.expiresAt > now;

export function acceptEnrollmentScan(
  enrollment: RfidEnrollment,
  scanId: number,
  tag: string,
  registeredTags: string[],
): RfidEnrollment {
  if (!Number.isSafeInteger(scanId) || scanId <= enrollment.lastScanId || !/^[A-F0-9]{4,124}$/.test(tag)) return enrollment;
  if (registeredTags.includes(tag)) return { ...enrollment, count: 0, tag: "", lastScanId: scanId, error: "This tag is already registered." };
  if (enrollment.count && enrollment.tag !== tag) return { ...enrollment, count: 0, tag: "", lastScanId: scanId, error: "Different tag detected. Scan the same tag three times again." };
  const count = enrollment.count + 1;
  return { ...enrollment, status: count === 3 ? "verified" : "ready", count, tag, lastScanId: scanId, error: "" };
}
