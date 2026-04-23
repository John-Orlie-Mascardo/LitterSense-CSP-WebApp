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
};

const sensorText = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const sensorNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

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
      return Response.json(
        { online: false, error: `ESP32 returned ${upstream.status}` },
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
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      { online: false, error: "ESP32 sensors unavailable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
