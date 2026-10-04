import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { loadVisitWriter } from './testing/catVisitWriter.mjs';
const require = createRequire(import.meta.url);
function load(url, imports, extra = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: (name) => imports[name], Date, Request, Response, URL, URLSearchParams, AbortSignal, process, console: { ...console, error() {}, warn() {} }, setTimeout, clearTimeout, ...extra });
  return loaded.exports;
}
const sensorSync = load(new URL("./sensorSync.ts", import.meta.url), {});
const gas = require("./gasUltrasonic.ts");
const thresholds = require("../configs/behaviorThresholds.ts");
const imports = { "node:crypto": require("node:crypto"), "./sensorSync": sensorSync, "./gasUltrasonic": gas, "../configs/behaviorThresholds": thresholds };

test("server SMS matches owner tags, excludes incomplete visits and never calls IPROG", async () => {
  let calls = [];
  const helper = load(new URL("./sensorSms.ts", import.meta.url), imports, {
    process: { env: { SUPABASE_URL: "https://storage.test", SUPABASE_SECRET_KEY: "server-only" } },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return Response.json(url.includes("sms_devices") ? [{ sms_accounts: { cats: [{ id: "cat-a", rfidTag: "AABB" }] } }] : { recognized: true, queued: 1 });
    },
  });
  const event = { eventId: "visit-1", status: "NORMAL", rfidHex: "AABB", durationSecs: 300, endedAt: new Date().toISOString() };
  const normalized = sensorSync.normalizeSensorSyncRequest({ events: [event, { ...event, eventId: "short", status: "SHORT_SESSION", durationSecs: 10 }, { ...event, eventId: "other", rfidHex: "CCDD" }, { ...event, eventId: "" }] });
  const visits = helper.buildSmsVisits({ cats: [{ id: "cat-a", rfidTag: "AABB" }] }, normalized);
  assert.equal(visits.length, 1);
  assert.equal(visits[0].reason, "Extended duration");
  assert.equal(helper.buildSmsVisits({ cats: [{ id: "cat-a", rfidTag: "AABB" }, { id: "cat-b", rfidTag: "AABB" }] }, normalized).length, 0);
  assert.equal((await helper.queueSensorSms({}, "cfg_secret_device", normalized)).queued, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => !call.url.includes("iprogsms")));
  assert.ok(calls.every((call) => !call.url.includes("cfg_secret_device")));
  const rpc = JSON.parse(calls[1].init.body);
  assert.equal(rpc.p_visits[0].catId, "cat-a");
  assert.equal(rpc.p_gas, null);
  calls = [];
  await helper.queueSensorSms({ source: "gas-ultrasonic", mq135Raw: 0, mq136Raw: 1, distanceCm: 20 }, "cfg_secret_device", { events: [] });
  assert.deepEqual(JSON.parse(calls[1].init.body).p_gas, { ammonia: true, h2s: false });
});

test("sensor route queues during Firestore quota failure, preserves retry status and rejects invalid tokens", async () => {
  class FirestoreRestError extends Error { constructor() { super("Quota exceeded"); this.status = 429; this.detail = "RESOURCE_EXHAUSTED"; } }
  let queued = 0;
  let quota = true;
  let queueFailure = false;
  const route = load(new URL("../../app/api/sensors/route.ts", import.meta.url), {
    "@/lib/utils/catVisitIngestion": { backupSensorVisits: async () => ({ inserted: 0, duplicates: 0, conflicts: 0 }) }, "@/lib/utils/catHistoryNormalization": {}, "@/lib/utils/catHistoryStore": {},
    '@/lib/utils/catVisitRecovery': loadVisitWriter({}, '', {}, {}, {}),
    "@/lib/utils/sensorSnapshotStore": { rememberSensorDevice: async () => {}, saveSensorMirror: async () => false },
    "@/lib/utils/firestoreRest": { FirestoreRestError, getFirestoreRestClient: () => ({ getDocument: async () => { if (quota) throw new FirestoreRestError(); return { data: { ownerId: "owner-a" } }; }, commit: async () => {}, createSetWrite: () => ({}) }) },
    "@/lib/utils/sensorSync": sensorSync,
    "@/lib/utils/sensorEndpointDiagnostics": {},
    "@/lib/utils/deviceSensorSnapshot": {},
    "@/lib/configs/firebase-admin": {},
    "@/lib/utils/rfidEnrollment": {},
    "@/lib/utils/gasUltrasonic": gas,
    "@/lib/utils/sensorSms": { queueSensorSms: async () => { if (queueFailure) throw new Error("Storage unavailable"); queued++; return { recognized: true, queued: 1 }; } },
    "@/lib/utils/smsDelivery": { processSmsOutbox: async () => ({ enabled: false }) },
    "next/server": { after: () => {} },
  });
  const post = (token) => route.POST(new Request("https://test/api/sensors", { method: "POST", headers: { "content-type": "application/json", "x-device-config-token": token }, body: JSON.stringify({ events: [{ eventId: "one", status: "ABNORMAL", durationSecs: 300, rfidHex: "AABB" }] }) }));
  assert.equal((await post("bad")).status, 400);
  assert.equal(queued, 0);
  const response = await post("cfg_abcdefghijklmnop");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("x-litersense-ack"), null);
  assert.equal(queued, 1);
  quota = false;
  queueFailure = true;
  const gasResponse = await route.POST(new Request("https://test/api/sensors", { method: "POST", headers: { "content-type": "application/json", "x-device-config-token": "cfg_abcdefghijklmnop" }, body: JSON.stringify({ source: "gas-ultrasonic", mq135Raw: 0, mq136Raw: 1, distanceCm: 20 }) }));
  assert.equal(gasResponse.status, 503);
  assert.equal(gasResponse.headers.get("x-litersense-ack"), null);
});
