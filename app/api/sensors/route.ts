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
import {
  classifySensorProxyUrl,
  shouldSkipServerSensorProxy,
} from "@/lib/utils/sensorEndpointDiagnostics";
import {
  buildDeviceSensorSnapshot,
  DEVICE_SENSOR_SNAPSHOT_PATH,
  toDeviceSensorsResponse,
} from "@/lib/utils/deviceSensorSnapshot";
import { getAdminAuth } from "@/lib/configs/firebase-admin";

export const runtime = "nodejs";

const ESP32_SENSOR_URL =
  process.env.ESP32_SENSOR_URL ?? "http://192.168.68.131/sensors";

const SENSOR_REQUEST_TIMEOUT_MS = 8000;
const CONFIG_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

type Esp32SensorPayload = {
  connectedSsid?: string;
  connectedWifiSsid?: string;
  wifiSsid?: string;
  ssid?: string;
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

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    let ownerId: string;
    try {
      ownerId = (await getAdminAuth().verifyIdToken(authorization.replace(/^Bearer /, ""))).uid;
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    try {
      const snapshot = await getFirestoreRestClient().getDocument(`users/${ownerId}/deviceState/current`);
      return Response.json(toDeviceSensorsResponse(snapshot?.data ?? {}), { headers: NO_STORE_HEADERS });
    } catch {
      return Response.json({ error: "Unable to read device state" }, { status: 503, headers: NO_STORE_HEADERS });
    }
  }
  const sensorProxyTarget = classifySensorProxyUrl(ESP32_SENSOR_URL);
  const shouldFallbackToStoredSnapshot = shouldSkipServerSensorProxy(
    ESP32_SENSOR_URL,
    process.env.VERCEL === "1",
  );

  const getStoredSnapshot = async (options?: { forceOffline?: boolean }) => {
    try {
      const client = getFirestoreRestClient();
      const snapshotDoc = await client.getDocument(DEVICE_SENSOR_SNAPSHOT_PATH);
      if (!snapshotDoc) return null;
      return toDeviceSensorsResponse(snapshotDoc.data, options);
    } catch {
      return null;
    }
  };

  if (shouldFallbackToStoredSnapshot) {
    const storedSnapshot = await getStoredSnapshot();

    if (storedSnapshot) {
      return Response.json(storedSnapshot, {
        headers: {
          ...NO_STORE_HEADERS,
        },
      });
    }

    return Response.json(
      {
        online: false,
        error: "ESP32 LAN sensor URL is not reachable from Vercel",
        detail:
          "Vercel cannot poll private LAN or loopback addresses, and no stored sensor snapshot is available yet. Let the ESP32 post one successful sync so Vercel can read the stored snapshot.",
        sensorProxyTarget,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

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
        { headers: NO_STORE_HEADERS },
      );
    }

    const payload = (await upstream.json()) as Esp32SensorPayload;

    return Response.json(
      {
        online: true,
        connectedSsid: sensorText(
          payload.connectedSsid ??
            payload.connectedWifiSsid ??
            payload.wifiSsid ??
            payload.ssid,
          "",
        ),
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

    const storedSnapshot = await getStoredSnapshot();
    if (storedSnapshot) {
      return Response.json(storedSnapshot, {
        headers: {
          ...NO_STORE_HEADERS,
        },
      });
    }

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
      { headers: NO_STORE_HEADERS },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request) {
  const bodyResult = await getRequestBodyOrError(request);
  if (bodyResult instanceof Response) {
    return bodyResult;
  }

  const { body } = bodyResult;
  const tokenResult = getConfigTokenOrError(request, body);
  if (tokenResult instanceof Response) {
    return tokenResult;
  }

  const { configToken } = tokenResult;
  const normalized = normalizeSensorSyncRequest(
    {
      ...(typeof body === "object" && body !== null ? body : {}),
      configToken,
    },
    new Date(),
  );

  return handleSensorSync(body, configToken, normalized);
}

async function getRequestBodyOrError(
  request: Request,
): Promise<{ body: unknown } | Response> {
  try {
    const body = await readRequestBody(request);
    return { body };
  } catch {
    return Response.json(
      { ok: false, error: "Invalid sensor sync body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

function getConfigTokenOrError(
  request: Request,
  body: unknown,
): { configToken: string } | Response {
  const configToken = getConfigToken(request, body);
  if (!CONFIG_TOKEN_PATTERN.test(configToken)) {
    return Response.json(
      { ok: false, error: "Missing or invalid device config token." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  return { configToken };
}

function getDeviceIdFromBody(body: unknown): string {
  if (typeof body !== "object" || body === null || !("deviceId" in body)) {
    return "";
  }

  const deviceId = (body as { deviceId?: unknown }).deviceId;
  return typeof deviceId === "string" ? deviceId : "";
}

function getConfigDocOrError(
  configDoc: Awaited<ReturnType<ReturnType<typeof getFirestoreRestClient>["getDocument"]>>,
  ownerId: string,
): Response | undefined {
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

  return undefined;
}

function buildCatDetails(
  catDetailDocs: Awaited<ReturnType<ReturnType<typeof getFirestoreRestClient>["listDocuments"]>>,
) {
  return catDetailDocs.map((doc) => [
    doc.id,
    { rfidTag: doc.data.rfidTag },
  ] satisfies [string, { rfidTag?: unknown }]);
}

function buildSyncResponse(args: {
  normalized: ReturnType<typeof normalizeSensorSyncRequest>;
  recorded: Array<{ sessionId: string; catId: string }>;
  duplicates: Array<{ sessionId: string; catId: string }>;
  unmatched: Array<{ eventId: string; rfidCard: string; rfidHex: string }>;
}) {
  const { normalized, recorded, duplicates, unmatched } = args;
  const acknowledged = normalized.events.length === 1 && unmatched.length === 0 &&
    recorded.length + duplicates.length === 1 && /^[A-Za-z0-9_-]{1,96}$/.test(normalized.events[0].eventId) ? normalized.events[0].eventId : "";
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
    { headers: { ...NO_STORE_HEADERS, "x-litersense-ack": acknowledged } },
  );
}

async function processSensorEvents(args: {
  client: ReturnType<typeof getFirestoreRestClient>;
  normalized: ReturnType<typeof normalizeSensorSyncRequest>;
  catDetails: ReturnType<typeof buildCatDetails>;
  ownerId: string;
  configToken: string;
  serverNow: Date;
}) {
  const { client, normalized, catDetails, ownerId, configToken, serverNow } =
    args;
  const recorded: Array<{ sessionId: string; catId: string }> = [];
  const recordedEvents: typeof normalized.events = [];
  const duplicates: Array<{ sessionId: string; catId: string }> = [];
  const unmatched: Array<{ eventId: string; rfidCard: string; rfidHex: string }> = [];

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
    recordedEvents.push(event);
  }

  return { recorded, recordedEvents, duplicates, unmatched };
}

async function handleSensorSync(
  body: unknown,
  configToken: string,
  normalized: ReturnType<typeof normalizeSensorSyncRequest>,
): Promise<Response> {
  try {
    const client = getFirestoreRestClient();
    const deviceId = getDeviceIdFromBody(body);
    const configDoc = await client.getDocument(`deviceConfigs/${configToken}`);
    const ownerId = getString(configDoc?.data.ownerId).trim();
    const configError = getConfigDocOrError(configDoc, ownerId);
    if (configError) return configError;

    const catDetailDocs = await client.listDocuments(
      `users/${ownerId}/catDetails`,
    );
    const catDetails = buildCatDetails(catDetailDocs);
    const serverNow = new Date();
    const snapshotPath = `users/${ownerId}/deviceState/current`;
    const existingSensorSnapshot = await client.getDocument(
      snapshotPath,
    );
    const { recorded, recordedEvents, duplicates, unmatched } =
      await processSensorEvents({
        client,
        normalized,
        catDetails,
        ownerId,
        configToken,
        serverNow,
      });

    const sensorSnapshot = buildDeviceSensorSnapshot({
      deviceId,
      configToken,
      recordedEvents,
      ignoredEvents: normalized.ignored,
      liveSensors:
        typeof body === "object" && body !== null
          ? {
              sessionActive: "sessionActive" in body ? body.sessionActive : undefined,
              activeRfidHex: "activeRfidHex" in body && typeof body.activeRfidHex === "string" && /^[A-Fa-f0-9]{2,124}$/.test(body.activeRfidHex) ? body.activeRfidHex : undefined,
              activeSessionStartMs: "activeSessionStartMs" in body ? body.activeSessionStartMs : undefined,
              activeSessionDurationMs: "activeSessionDurationMs" in body ? body.activeSessionDurationMs : undefined,
              mq135: "mq135" in body ? body.mq135 : undefined,
              mq136: "mq136" in body ? body.mq136 : undefined,
              mq135Raw: "mq135Raw" in body ? body.mq135Raw : undefined,
              mq136Raw: "mq136Raw" in body ? body.mq136Raw : undefined,
            }
          : undefined,
      previous: existingSensorSnapshot?.data ?? {},
      now: serverNow,
    });

    await client.commit([
      client.createSetWrite(
        snapshotPath,
        sensorSnapshot as unknown as Record<string, unknown>,
        existingSensorSnapshot ? undefined : { exists: false },
      ),
    ]);

    return buildSyncResponse({ normalized, recorded, duplicates, unmatched });
  } catch (error) {
    const isFirestoreError = error instanceof FirestoreRestError;
    const status = isFirestoreError ? error.status : 500;
    const message = getErrorMessage(error);

    console.error("ESP32 sensor sync failed.", {
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
