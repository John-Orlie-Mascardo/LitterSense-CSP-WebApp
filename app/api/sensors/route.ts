const DEFAULT_ESP32_BASE_URL = "http://192.168.68.116";

const ESP32_SENSOR_URL =
  process.env.ESP32_SENSOR_URL ??
  `${process.env.ESP32_BASE_URL ?? DEFAULT_ESP32_BASE_URL}/sensors`;

const SENSOR_REQUEST_TIMEOUT_MS = 2500;

type Esp32SensorPayload = {
  mq135?: string;
  mq136?: string;
  mq135Raw?: number;
  mq136Raw?: number;
  rfidHex?: string;
  rfidCard?: string;
  lastRfidMs?: number;
  rfidEvent?: string;
  sessionActive?: boolean;
  activeRfidHex?: string;
  activeRfidCard?: string;
  activeSessionStartMs?: number;
  activeSessionDurationMs?: number;
  currentSessionStatus?: string;
  lastSessionStatus?: string;
  lastSessionDurationMs?: number;
  lastSessionEndMs?: number;
  completedSessionCount?: number;
  falseEntryCount?: number;
  noExitTimeoutCount?: number;
  noExitTimeoutMs?: number;
};

const sensorText = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const sensorNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const sensorBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : false;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
};

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SENSOR_REQUEST_TIMEOUT_MS,
  );

  try {
    const upstream = await fetch(ESP32_SENSOR_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");

      return Response.json(
        {
          online: false,
          error: `ESP32 returned ${upstream.status}`,
          detail,
        },
        { status: 502 },
      );
    }

    const payload = (await upstream.json()) as Esp32SensorPayload;

    return Response.json(
      {
        online: true,
        mq135: sensorText(payload.mq135, "Unknown"),
        mq136: sensorText(payload.mq136, "Unknown"),
        mq135Raw: sensorNumber(payload.mq135Raw),
        mq136Raw: sensorNumber(payload.mq136Raw),
        rfidHex: sensorText(payload.rfidHex, ""),
        rfidCard: sensorText(payload.rfidCard, ""),
        lastRfidMs: sensorNumber(payload.lastRfidMs),
        rfidEvent: sensorText(payload.rfidEvent, "none"),
        sessionActive: sensorBoolean(payload.sessionActive),
        activeRfidHex: sensorText(payload.activeRfidHex, ""),
        activeRfidCard: sensorText(payload.activeRfidCard, ""),
        activeSessionStartMs: sensorNumber(payload.activeSessionStartMs),
        activeSessionDurationMs: sensorNumber(payload.activeSessionDurationMs),
        currentSessionStatus: sensorText(payload.currentSessionStatus, "IDLE"),
        lastSessionStatus: sensorText(payload.lastSessionStatus, "NONE"),
        lastSessionDurationMs: sensorNumber(payload.lastSessionDurationMs),
        lastSessionEndMs: sensorNumber(payload.lastSessionEndMs),
        completedSessionCount: sensorNumber(payload.completedSessionCount),
        falseEntryCount: sensorNumber(payload.falseEntryCount),
        noExitTimeoutCount: sensorNumber(payload.noExitTimeoutCount),
        noExitTimeoutMs: sensorNumber(payload.noExitTimeoutMs),
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = getErrorMessage(error);
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || message.toLowerCase().includes("aborted"));

    console.error("ESP32 sensor proxy failed.", {
      url: ESP32_SENSOR_URL,
      timedOut,
      message,
    });

    return Response.json(
      {
        online: false,
        error: timedOut ? "ESP32 sensors timed out" : "ESP32 sensors unavailable",
        detail: message,
      },
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
