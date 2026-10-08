// Idle firmware uploads every 60 seconds; allow 30 seconds for transport delays.
export const GAS_ULTRASONIC_STALE_AFTER_MS = 90000;

export const GAS_ULTRASONIC_OFFLINE = {
  gasUltrasonicOnline: false, mq135: "Unknown", mq136: "Unknown",
  mq135Raw: null, mq136Raw: null, distanceCm: null,
};

export function normalizeGasUltrasonic(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if ((data.mq135Raw !== 0 && data.mq135Raw !== 1) ||
      (data.mq136Raw !== 0 && data.mq136Raw !== 1) ||
      !(data.distanceCm === null || (typeof data.distanceCm === "number" &&
        Number.isFinite(data.distanceCm) && data.distanceCm > 0 && data.distanceCm <= 515))) return null;
  return {
    gasUltrasonicOnline: true,
    mq135: data.mq135Raw === 0 ? "Gas Detected" : "Clear",
    mq136: data.mq136Raw === 0 ? "Gas Detected" : "Clear",
    mq135Raw: data.mq135Raw,
    mq136Raw: data.mq136Raw,
    distanceCm: data.distanceCm,
  };
}

export function toGasUltrasonicResponse(data: Record<string, unknown>, now = Date.now()) {
  const age = now - Date.parse(typeof data.updatedAt === "string" ? data.updatedAt : "");
  return age >= 0 && age <= GAS_ULTRASONIC_STALE_AFTER_MS
    ? normalizeGasUltrasonic(data) ?? GAS_ULTRASONIC_OFFLINE
    : GAS_ULTRASONIC_OFFLINE;
}

export async function fetchGasUltrasonic(url: string) {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return GAS_ULTRASONIC_OFFLINE;
    return normalizeGasUltrasonic(await response.json()) ?? GAS_ULTRASONIC_OFFLINE;
  } catch {
    return GAS_ULTRASONIC_OFFLINE;
  }
}
