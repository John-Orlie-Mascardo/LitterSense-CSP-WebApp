import {
  FirestoreRestError,
  getFirestoreRestClient,
} from "@/lib/utils/firestoreRest";
import {
  buildSessionDocumentId,
  buildVisitWritePlan,
  findCatIdByRfid,
  normalizeSensorSyncRequest,
} from "@/lib/utils/sensorSync";

export const runtime = "nodejs";

const DEFAULT_ESP32_BASE_URL = "http://192.168.189.40";

const ESP32_SENSOR_URL =
  process.env.ESP32_SENSOR_URL ??
  `${process.env.ESP32_BASE_URL ?? DEFAULT_ESP32_BASE_URL}/sensors`;

const SENSOR_REQUEST_TIMEOUT_MS = 2500;
const CONFIG_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

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

const getString = (value: unknown) =>
  typeof value === "string" ? value : "";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
};

const getConfigToken = (request: Request, body: unknown) => {
  const queryToken = new URL(request.url).searchParams.get("configToken") ?? "";
  const headerToken =
    request.headers.get("x-litersense-config-token") ??
    request.headers.get("x-device-config-token") ??
    "";
  const bodyToken =
    typeof body === "object" &&
    body !== null &&
    "configToken" in body &&
    typeof body.configToken === "string"
      ? body.configToken
      : "";

  return (headerToken || queryToken || bodyToken).trim();
};

const readRequestBody = async (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  const text = await request.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
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
          ...NO_STORE_HEADERS,
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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await readRequestBody(request);
  } catch {
    return Response.json(
      { ok: false, error: "Invalid sensor sync body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const configToken = getConfigToken(request, body);
  if (!CONFIG_TOKEN_PATTERN.test(configToken)) {
    return Response.json(
      { ok: false, error: "Missing or invalid device config token." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const normalized = normalizeSensorSyncRequest(
    {
      ...(typeof body === "object" && body !== null ? body : {}),
      configToken,
    },
    new Date(),
  );

  try {
    const client = getFirestoreRestClient();
    const configDoc = await client.getDocument(`deviceConfigs/${configToken}`);
    const ownerId = getString(configDoc?.data.ownerId).trim();
    if (!configDoc || !ownerId) {
      return Response.json(
        {
          ok: false,
          error: "Device config not found or missing owner.",
          detail: "Save the ESP32 Wi-Fi provisioning settings again before syncing sensor logs.",
        },
        { status: configDoc ? 422 : 404, headers: NO_STORE_HEADERS },
      );
    }

    const catDetailDocs = await client.listDocuments(
      `users/${ownerId}/catDetails`,
    );
    const catDetails = catDetailDocs.map((doc) => [
      doc.id,
      { rfidTag: doc.data.rfidTag },
    ] satisfies [string, { rfidTag?: unknown }]);
    const recorded: Array<{ sessionId: string; catId: string }> = [];
    const duplicates: Array<{ sessionId: string; catId: string }> = [];
    const unmatched: Array<{ eventId: string; rfidCard: string; rfidHex: string }> = [];
    const serverNow = new Date();

    for (const event of normalized.events) {
      const catId = findCatIdByRfid(catDetails, event.rfidCard, event.rfidHex);
      if (!catId) {
        unmatched.push({
          eventId: event.eventId,
          rfidCard: event.rfidCard,
          rfidHex: event.rfidHex,
        });
        continue;
      }

      const sessionId = buildSessionDocumentId(configToken, event);
      const plan = buildVisitWritePlan({
        userId: ownerId,
        catId,
        configToken,
        event,
        sessionId,
        serverNow,
      });
      const existingSession = await client.getDocument(plan.sessionPath);
      if (existingSession) {
        duplicates.push({ sessionId, catId });
        continue;
      }

      await client.commit([
        client.createSetWrite(plan.sessionPath, plan.sessionData, {
          exists: false,
        }),
        ...plan.summaryPaths.map((path) =>
          client.createIncrementWrite(path, plan.summaryData, {
            visits: 1,
            totalDurationSecs: plan.durationSecs,
          }),
        ),
      ]);
      recorded.push({ sessionId, catId });
    }

    return Response.json(
      {
        ok: true,
        received: normalized.events.length + normalized.ignored.length,
        recorded: recorded.length,
        duplicates: duplicates.length,
        ignored: normalized.ignored,
        unmatched,
        recordedSessions: recorded,
        duplicateSessions: duplicates,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const isFirestoreError = error instanceof FirestoreRestError;
    const status = isFirestoreError ? error.status : 500;
    const message = getErrorMessage(error);

    console.error("ESP32 sensor sync failed.", {
      configToken,
      status,
      message,
      detail: isFirestoreError ? error.detail : undefined,
    });

    return Response.json(
      {
        ok: false,
        error: "Sensor sync failed.",
        detail: isFirestoreError ? error.detail : message,
      },
      {
        status: status >= 400 && status < 500 ? status : 503,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
