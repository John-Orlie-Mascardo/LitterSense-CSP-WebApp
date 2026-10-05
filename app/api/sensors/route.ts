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
import { acceptEnrollmentScan, isEnrollmentActive, RFID_ENROLLMENT_PATH, type RfidEnrollment } from "@/lib/utils/rfidEnrollment";

import { fetchGasUltrasonic, normalizeGasUltrasonic, toGasUltrasonicResponse } from "@/lib/utils/gasUltrasonic";
import { queueSensorSms } from "@/lib/utils/sensorSms";
import { processSmsOutbox } from "@/lib/utils/smsDelivery";
import { processPushOutbox } from '@/lib/utils/pushDelivery';
import { queueRfidNotifications } from '@/lib/utils/rfidNotifications';
import { rememberSensorDevice, saveSensorMirror, readSensorMirrors, selectSensorSnapshot, type StoredSensorSnapshot } from "@/lib/utils/sensorSnapshotStore";
import { after } from "next/server";
import { backupSensorVisits, preserveFirmwareVisitTime } from "@/lib/utils/catVisitIngestion";
import { buildVisitBackup } from "@/lib/utils/catHistoryNormalization";
import { readVisitBackupsById } from "@/lib/utils/catHistoryStore";
import type { VisitBackup } from "@/lib/interfaces/CatHistoryBackup";
import { createHash } from 'node:crypto';
import { persistVisitOnce, primaryVisitFailureStatus, VisitAuthorityError, VisitConflictError } from '@/lib/utils/catVisitRecovery';

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (process.env.VERCEL === "1" && !request.headers.get("authorization")) return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  const response = await getPrimarySensors(request);
  const url = process.env.ESP32_GAS_ULTRASONIC_URL?.trim();
  if (!url || !response.ok) return response;
  const data = await response.json();
  if ("gasUltrasonicOnline" in data) return Response.json(data, { headers: NO_STORE_HEADERS });
  const extra = shouldSkipServerSensorProxy(url, process.env.VERCEL === "1")
    ? { gasUltrasonicOnline: false, mq135: "Unknown", mq136: "Unknown", mq135Raw: null, mq136Raw: null, distanceCm: null }
    : await fetchGasUltrasonic(url);
  return Response.json({ ...data, ...extra }, { headers: NO_STORE_HEADERS });
}

async function getPrimarySensors(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    let ownerId: string;
    try {
      ownerId = (await getAdminAuth().verifyIdToken(authorization.replace(/^Bearer /, ""))).uid;
    } catch {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    try {
      const client = getFirestoreRestClient();
      const results = await Promise.allSettled([
        client.getDocument(`users/${ownerId}/deviceState/current`),
        client.getDocument(`users/${ownerId}/deviceState/gasUltrasonic`),
      ]);
      for (const result of results) {
        if (result.status === "rejected" && !(result.reason instanceof FirestoreRestError && (result.reason.status === 429 || result.reason.status >= 500))) throw result.reason;
      }
      const sources = ["rfid", "gas-ultrasonic"] as const;
      const firebase = results.map((result, index): StoredSensorSnapshot | null => {
        if (result.status !== "fulfilled" || !result.value) return null;
        const data = result.value.data;
        return { source: sources[index], data, receivedAt: getString(data.updatedAt) };
      });
      let now = Date.now();
      const fresh = (snapshot: StoredSensorSnapshot | null) => !!snapshot && now - Date.parse(snapshot.receivedAt) >= 0 && now - Date.parse(snapshot.receivedAt) <= 180000;
      let mirrors: StoredSensorSnapshot[] = [];
      let mirrorUnavailable = false;
      if (!firebase.every(fresh)) {
        try {
          mirrors = await readSensorMirrors(ownerId);
        } catch {
          mirrorUnavailable = true;
          if (results.every((result) => result.status === "rejected")) throw new Error("Sensor stores unavailable");
        }
      }
      now = Date.now();
      const rfid = selectSensorSnapshot("rfid", firebase[0], mirrors, now);
      const gas = selectSensorSnapshot("gas-ultrasonic", firebase[1], mirrors, now);
      const rfidResponse = toDeviceSensorsResponse(rfid ? { ...rfid.data, updatedAt: rfid.receivedAt } : {}, { now: new Date(now) });
      return Response.json({
        ...rfidResponse,
        sessionActive: rfidResponse.online && rfidResponse.sessionActive,
        updatedAt: rfid?.receivedAt ?? "",
        ...toGasUltrasonicResponse(gas ? { ...gas.data, updatedAt: gas.receivedAt } : {}, now),
        rfidUpdatedAt: rfid?.receivedAt ?? "",
        gasUltrasonicUpdatedAt: gas?.receivedAt ?? "",
        rfidDataSource: rfid ? rfid === firebase[0] ? "firebase" : "supabase" : undefined,
        gasUltrasonicDataSource: gas ? gas === firebase[1] ? "firebase" : "supabase" : undefined,
        rfidState: !rfid ? "unknown" : fresh(rfid) && rfidResponse.online ? "online" : "stale",
        gasUltrasonicState: !gas ? "unknown" : fresh(gas) && normalizeGasUltrasonic(gas.data) ? "online" : "stale",
        rfidCloudError: mirrorUnavailable && results[0].status === "rejected",
        gasUltrasonicCloudError: mirrorUnavailable && results[1].status === "rejected",
      }, { headers: NO_STORE_HEADERS });
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
  const mirror: SensorMirrorContext = { receivedAt: new Date(), fallbackAllowed: false, saved: [] };
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
  const payload = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  if (payload.source === "gas-ultrasonic") {
    if (!normalizeGasUltrasonic(body)) return Response.json({ ok: false, error: "Invalid gas/ultrasonic readings." }, { status: 400, headers: NO_STORE_HEADERS });
  } else if (("sessionActive" in payload && typeof payload.sessionActive !== "boolean") ||
    ("activeRfidHex" in payload && (typeof payload.activeRfidHex !== "string" || !/^(?:[A-Fa-f0-9]{2,124})?$/.test(payload.activeRfidHex))) ||
    ["activeSessionStartMs", "activeSessionDurationMs"].some((field) => field in payload && payload[field] !== null && (typeof payload[field] !== "number" || !Number.isFinite(payload[field]) || (payload[field] as number) < 0))) {
    return Response.json({ ok: false, error: "Invalid RFID live readings." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const normalized = normalizeSensorSyncRequest(
    {
      ...(typeof body === "object" && body !== null ? body : {}),
      configToken,
    },
    mirror.receivedAt,
  );

  const response = await handleSensorSync(body, configToken, normalized, mirror);
  if ((response.ok || mirror.fallbackAllowed) && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    after(async () => {
      try {
        if (mirror.ownerId) await rememberSensorDevice(mirror.ownerId, configToken);
        const source = payload.source === "gas-ultrasonic" ? "gas-ultrasonic" : "rfid";
        const snapshot = mirror.snapshot ?? (source === "gas-ultrasonic" ? normalizeGasUltrasonic(body) : buildOutageRfidSnapshot(payload, mirror.receivedAt));
        if (snapshot) await saveSensorMirror(configToken, source, snapshot, mirror.receivedAt.toISOString());
      } catch {
        // A mirror failure cannot undo primary persistence or acknowledge an unsaved visit.
        console.warn("Sensor mirror unavailable; original sensor response preserved.");
      }
    });
  }
  if (!mirror.fallbackAllowed && mirror.saved.length && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    after(async () => {
      try {
        const result = await backupSensorVisits(configToken, normalized, { ownerId: mirror.ownerId, saved: mirror.saved, fallbackAllowed: false }, mirror.receivedAt);
        if (result.conflicts) console.warn("Visit backup detected conflicting history; recovery requires review.");
      } catch { console.warn("Confirmed visit backup is pending; repair will retry it."); }
    });
  }
  if (mirror.fallbackAllowed && payload.source !== "gas-ultrasonic" && normalized.events.length && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      const result = await backupSensorVisits(configToken, normalized, { ownerId: mirror.ownerId, saved: mirror.saved, fallbackAllowed: true }, mirror.receivedAt);
      if (result.conflicts) console.warn("Visit backup detected conflicting history; recovery requires review.");
    } catch { console.warn("Outage visit backup unavailable; original device retry response preserved."); }
  }
  if ((response.ok || mirror.fallbackAllowed) && payload.source !== 'gas-ultrasonic' && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      const alerts = await queueRfidNotifications(payload, configToken, normalized.events, mirror.receivedAt, mirror.ownerId, mirror.fallbackAllowed ? undefined : mirror.saved.map(visit => visit.sessionId));
      if (alerts.ownerId) after(async () => {
        try { await processPushOutbox(alerts.ownerId); }
        catch { console.warn('Queued RFID push will be processed on the next worker run.'); }
      });
    } catch {
      console.warn('RFID alert queue unavailable; device retry required.');
      // The visit remains saved. Firmware retries its stable event ID without counting it twice.
      if (response.ok) return Response.json({ ok: false, error: 'RFID alert queue unavailable. Retry sensor sync.' }, { status: 503, headers: NO_STORE_HEADERS });
    }
  }
  // During a Firestore outage, use the previously verified device ownership backup.
  // Preserve the original status and ack: SMS storage never acknowledges visit history.
  if (response.ok || response.status === 429 || response.status === 503) {
    try {
      const queued = await queueSensorSms(body, configToken, normalized);
      if (queued.recognized && "ownerId" in queued && queued.ownerId) {
        const ownerId = queued.ownerId;
        after(async () => {
          try { await processSmsOutbox(ownerId); }
          catch { console.warn("Queued SMS will be processed on the next worker run."); }
          try { await processPushOutbox(ownerId); }
          catch { console.warn('Queued push alerts will be processed on the next worker run.'); }
        });
      }
    }
    catch (error) {
      console.warn("SMS queue unavailable:", getErrorMessage(error));
      // A saved visit can be retried safely; do not discard its unsaved SMS alert.
      if (response.ok) return Response.json({ ok: false, error: "SMS queue unavailable. Retry sensor sync." }, { status: 503, headers: NO_STORE_HEADERS });
    }
  }
  return response;
}

interface SensorMirrorContext {
  receivedAt: Date;
  ownerId?: string;
  snapshot?: Record<string, unknown>;
  fallbackAllowed: boolean;
  saved: VisitBackup[];
}

function buildOutageRfidSnapshot(payload: Record<string, unknown>, now: Date): Record<string, unknown> {
  const snapshot = buildDeviceSensorSnapshot({
    deviceId: "", configToken: "", recordedEvents: [], ignoredEvents: [], liveSensors: payload, now,
  });
  const live: Record<string, unknown> = { online: true };
  if ("sessionActive" in payload) {
    live.sessionActive = snapshot.sessionActive;
    live.currentSessionStatus = snapshot.currentSessionStatus;
    if (payload.sessionActive === false) {
      live.activeRfidHex = ""; live.activeRfidCard = "";
      live.activeSessionStartMs = null; live.activeSessionDurationMs = null;
    }
  }
  for (const field of ["activeRfidHex", "activeSessionStartMs", "activeSessionDurationMs"] as const) {
    if (field in payload && payload.sessionActive !== false) live[field] = payload[field];
  }
  return live;
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
  enrollmentId?: string;
  enrollmentAck?: number;
}) {
  const { normalized, recorded, duplicates, unmatched, enrollmentId = "", enrollmentAck = -1 } = args;
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
      enrollmentId,
      enrollmentAck,
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
  saved: VisitBackup[];
}) {
  const { client, normalized, catDetails, ownerId, configToken, serverNow, saved } =
    args;
  const recorded: Array<{ sessionId: string; catId: string }> = [];
  const recordedEvents: typeof normalized.events = [];
  const duplicates: Array<{ sessionId: string; catId: string }> = [];
  const unmatched: Array<{ eventId: string; rfidCard: string; rfidHex: string }> = [];

  for (const event of normalized.events) {
    const matches = catDetails.filter(tag => findCatIdByRfid([tag], event.rfidCard, event.rfidHex));
    const catId = matches.length === 1 ? matches[0][0] : null;
    if (!catId) {
      unmatched.push({
        eventId: event.eventId,
        rfidCard: event.rfidCard,
        rfidHex: event.rfidHex,
      });
      continue;
    }

    const sessionId = buildSessionDocumentId(configToken, event);
    let plan = buildVisitWritePlan({
      userId: ownerId,
      catId,
      configToken,
      event,
      sessionId,
      serverNow,
    });
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
      try {
        const original = (await readVisitBackupsById(ownerId, [sessionId]))[0];
        if (original) {
          const candidate = buildVisitBackup(sessionId, plan.sessionData, null, "primary_saved");
          const preserved = preserveFirmwareVisitTime(candidate, original);
          if (preserved !== candidate) plan = buildVisitWritePlan({ userId: ownerId, catId, configToken, sessionId, serverNow, activityDay: preserved.data.date as string, event: { ...event, startedAt: preserved.data.startedAt as string, endedAt: preserved.data.endedAt as string } });
        }
      } catch { console.warn("Visit backup lookup unavailable; primary persistence continues."); }
    }

    const candidate = buildVisitBackup(sessionId, plan.sessionData, createHash('sha256').update(configToken).digest('hex'), 'primary_saved');
    const outcome = await persistVisitOnce(ownerId, candidate);
    if (outcome === 'conflict') throw new VisitConflictError();
    if (outcome === 'duplicate') {
      const existingSession = await client.getDocument(plan.sessionPath);
      if (existingSession) {
        try { saved.push(buildVisitBackup(sessionId, existingSession.data, candidate.tokenHash, 'primary_saved')); }
        catch { console.warn('Existing visit could not be serialized; history repair requires review.'); }
      }
      duplicates.push({ sessionId, catId });
      continue;
    }
    saved.push(candidate);
    recorded.push({ sessionId, catId });
    recordedEvents.push(event);
  }

  return { recorded, recordedEvents, duplicates, unmatched };
}

async function handleSensorSync(
  body: unknown,
  configToken: string,
  normalized: ReturnType<typeof normalizeSensorSyncRequest>,
  mirror: SensorMirrorContext,
): Promise<Response> {
  try {
    const client = getFirestoreRestClient();
    const deviceId = getDeviceIdFromBody(body);
    const configDoc = await client.getDocument(`deviceConfigs/${configToken}`);
    const ownerId = getString(configDoc?.data.ownerId).trim();
    const configError = getConfigDocOrError(configDoc, ownerId);
    if (configError) return configError;
    mirror.ownerId = ownerId;

    // Keep independent sensor heartbeats from clearing RFID sessions or refreshing their age.
    if (typeof body === "object" && body !== null && "source" in body && body.source === "gas-ultrasonic") {
      const readings = normalizeGasUltrasonic(body);
      if (!readings) return Response.json({ ok: false, error: "Invalid gas/ultrasonic readings." }, { status: 400, headers: NO_STORE_HEADERS });
      await client.commit([client.createSetWrite(`users/${ownerId}/deviceState/gasUltrasonic`, {
        ...readings, deviceId, updatedAt: mirror.receivedAt.toISOString(),
      })]);
      mirror.snapshot = readings;
      return Response.json({ ok: true, source: "gas-ultrasonic" }, {
        headers: { ...NO_STORE_HEADERS, "x-litersense-ack": "gas-ultrasonic" },
      });
    }

    const snapshotPath = `users/${ownerId}/deviceState/current`;
    const enrollmentPath = `users/${ownerId}/${RFID_ENROLLMENT_PATH}`;
    const [catDetailDocs, existingSensorSnapshot, enrollmentDoc] = await Promise.all([
      client.listDocuments(`users/${ownerId}/catDetails`),
      client.getDocument(snapshotPath),
      client.getDocument(enrollmentPath),
    ]);
    const allCatDetails = buildCatDetails(catDetailDocs);
    const activeCats = normalized.events.length ? new Set((await client.listDocuments(`users/${ownerId}/cats`)).map(cat => cat.id)) : null;
    const catDetails = activeCats ? allCatDetails.filter(([catId]) => activeCats.has(catId)) : allCatDetails;
    const serverNow = mirror.receivedAt;
    let enrollment = enrollmentDoc?.data as RfidEnrollment | undefined;
    let enrollmentAck = -1;
    if (enrollment && enrollment.deviceId === deviceId && isEnrollmentActive(enrollment, serverNow.getTime()) && typeof body === "object" && body !== null) {
      const payload = body as Record<string, unknown>;
      if (payload.enrollmentReadyId === enrollment.id && enrollment.status === "waiting") enrollment = { ...enrollment, status: "ready" };
      const scan = payload.enrollmentScan;
      if (typeof scan === "object" && scan !== null) {
        const { id, sequence, tag } = scan as Record<string, unknown>;
        if (id === enrollment.id && typeof sequence === "number" && typeof tag === "string") {
          const normalizedTag = tag.toUpperCase();
          const registeredTags = allCatDetails.map(([, details]) => String(details.rfidTag ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase());
          const next = acceptEnrollmentScan(enrollment, sequence, normalizedTag, registeredTags);
          if (next.lastScanId === sequence) enrollmentAck = sequence;
          enrollment = next;
        }
      }
      if (enrollment !== enrollmentDoc?.data) await client.commit([client.createSetWrite(enrollmentPath, enrollment)]);
    }
    const { recorded, recordedEvents, duplicates, unmatched } =
      await processSensorEvents({
        client,
        normalized,
        catDetails,
        ownerId,
        configToken,
        serverNow,
        saved: mirror.saved,
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
    mirror.snapshot = sensorSnapshot as unknown as Record<string, unknown>;

    return buildSyncResponse({ normalized, recorded, duplicates, unmatched, enrollmentId: enrollment && enrollment.deviceId === deviceId && isEnrollmentActive(enrollment, serverNow.getTime()) ? enrollment.id : "", enrollmentAck });
  } catch (error) {
    const isFirestoreError = error instanceof FirestoreRestError;
    const sdkStatus = primaryVisitFailureStatus(error);
    const status = isFirestoreError ? error.status : error instanceof VisitAuthorityError ? 403 : error instanceof VisitConflictError ? 409 : sdkStatus ?? 500;
    mirror.fallbackAllowed = (isFirestoreError || sdkStatus !== null) && (status === 429 || status >= 500);
    const message = !isFirestoreError && (sdkStatus !== null || error instanceof VisitAuthorityError || error instanceof VisitConflictError) ? 'Visit persistence failed; retry or review the device authority and session identity.' : getErrorMessage(error);

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
