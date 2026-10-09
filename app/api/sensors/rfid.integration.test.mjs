import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadVisitWriter } from '../../../lib/utils/testing/catVisitWriter.mjs';

const require = createRequire(import.meta.url);
const { buildDeviceSensorSnapshot, toDeviceSensorsResponse, SENSOR_SNAPSHOT_STALE_AFTER_MS } = require("../../../lib/utils/deviceSensorSnapshot.ts");
function loadTs(url, imports = {}) {
  imports = { '@/lib/server/operationalStore': { rfidPrimaryEnabled: () => false }, '@/lib/server/operationalRfid': {}, '@/lib/server/operationalCats': {}, '@/lib/server/operationalRecords': {}, '@/lib/server/operationalDevices': {}, 'node:crypto': require('node:crypto'), '@/lib/utils/rfidNotifications': { queueRfidNotifications: async () => ({ queued: 0 }) }, '@/lib/utils/pushDelivery': { processPushOutbox: async () => ({ processed: 0 }) }, '@/lib/utils/catVisitRecovery': loadVisitWriter({}, '', {}, {}, {}), ...imports };
  const { outputText } = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    }, Request, Response, URL, URLSearchParams, Date, Buffer, process, console, setTimeout, clearTimeout,
  });
  return loadedModule.exports;
}

const { selectSensorSnapshot } = loadTs(new URL("../../../lib/utils/sensorSnapshotStore.ts", import.meta.url), { "node:crypto": {}, "./smsAccountSync": {} });

test("authenticated display falls back during quota and recovery, preserving source age and owner isolation", async () => {
  class FirestoreRestError extends Error { constructor(status) { super("failure"); this.status = status; } }
  let failure = 429, backupFailure = false, reads = 0, gasOnlyFailure = false;
  const fresh = new Date(Date.now() - 1000).toISOString(), old = new Date(Date.now() - 91000).toISOString();
  let receipt = fresh, primaryReceipt = old;
  const route = loadTs(new URL("./route.ts", import.meta.url), {
    "@/lib/utils/catVisitIngestion": {}, "@/lib/utils/catHistoryNormalization": {}, "@/lib/utils/catHistoryStore": {},
    "@/lib/utils/sensorSnapshotStore": { selectSensorSnapshot, readSensorMirrors: async (owner) => {
      reads++;
      if (backupFailure) throw new Error("backup unavailable");
      return owner === "owner-a" ? [{ source: "rfid", receivedAt: receipt, data: { online: true, sessionActive: true } }, { source: "gas-ultrasonic", receivedAt: fresh, data: { mq135Raw: 1, mq136Raw: 0, distanceCm: 15 } }] : [];
    } },
    "@/lib/utils/firestoreRest": { FirestoreRestError, getFirestoreRestClient: () => ({ getDocument: async (path) => {
      if (failure && (!gasOnlyFailure || path.endsWith("gasUltrasonic"))) throw new FirestoreRestError(failure);
      return { data: path.endsWith("current") ? { online: true, sessionActive: false, updatedAt: primaryReceipt } : { mq135Raw: 1, mq136Raw: 1, distanceCm: 20, updatedAt: fresh } };
    } }) },
    "@/lib/utils/sensorSync": {}, "@/lib/utils/sensorEndpointDiagnostics": {},
    "@/lib/utils/deviceSensorSnapshot": { toDeviceSensorsResponse, SENSOR_SNAPSHOT_STALE_AFTER_MS },
    "@/lib/utils/gasUltrasonic": require("../../../lib/utils/gasUltrasonic.ts"),
    "@/lib/utils/rfidEnrollment": {}, "@/lib/utils/sensorSms": {}, "@/lib/utils/smsDelivery": {}, "next/server": {},
    "@/lib/configs/firebase-admin": { getAdminAuth: () => ({ verifyIdToken: async (token) => { if (token === "bad") throw new Error("bad"); return { uid: token }; } }) },
  });
  const get = (owner = "owner-a") => route.GET(new Request("https://test/api/sensors", { headers: { Authorization: `Bearer ${owner}` } }));
  let response = await get(), data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.rfidDataSource, "supabase");
  assert.equal(data.online, true);
  assert.equal(data.gasUltrasonicOnline, true);
  assert.equal(data.rfidUpdatedAt, fresh);
  assert.equal(data.mq136, "Gas Detected");
  data = await (await get("owner-b")).json();
  assert.equal(data.rfidState, "unknown");
  assert.equal(data.online, false);
  assert.equal(data.rfidUpdatedAt, "", "empty storage must not invent a current heartbeat");
  failure = 0;
  data = await (await get()).json();
  assert.equal(data.rfidDataSource, "supabase", "recovery must not replace a newer backup with old Firebase data");
  assert.equal(data.gasUltrasonicDataSource, "firebase", "Firebase wins equal receipts");
  receipt = old;
  data = await (await get()).json();
  assert.equal(data.rfidState, "stale");
  assert.equal(data.sessionActive, false);
  assert.equal(data.gasUltrasonicState, "online");
  assert.equal(data.rfidUpdatedAt, old);
  primaryReceipt = fresh;
  const beforeHealthy = reads;
  data = await (await get()).json();
  assert.equal(data.rfidDataSource, "firebase");
  assert.equal(reads, beforeHealthy, "fresh Firebase readings should not require backup reads");
  failure = 403;
  const before = reads;
  assert.equal((await get()).status, 503);
  assert.equal(reads, before, "permission failures must not enable fallback");
  assert.equal((await get("bad")).status, 401);
  assert.equal(reads, before);
  failure = 503; backupFailure = true;
  assert.equal((await get()).status, 503);
  gasOnlyFailure = true;
  response = await get();
  assert.equal(response.status, 200, "an unavailable gas store must not hide fresh RFID");
  data = await response.json();
  assert.equal(data.rfidState, "online");
  assert.equal(data.gasUltrasonicState, "unknown");
  assert.equal(data.gasUltrasonicCloudError, true);
});

test("RFID entry, exit, retry and authenticated owner snapshot through the route", async (t) => {
  const previousStore = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = 'https://test.invalid';
  process.env.SUPABASE_SECRET_KEY = 'test-only';
  t.after(() => {
    for (const [name, value] of [['SUPABASE_URL', previousStore.url], ['SUPABASE_SECRET_KEY', previousStore.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const alerts = [];
  let alertFailure = false;
  const oldUrl = process.env.ESP32_GAS_ULTRASONIC_URL;
  process.env.ESP32_GAS_ULTRASONIC_URL = "http://old-board.test/sensors";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.ESP32_GAS_ULTRASONIC_URL;
    else process.env.ESP32_GAS_ULTRASONIC_URL = oldUrl;
  });
  const docs = new Map([["deviceConfigs/cfg_abcdefghijklmnop", { data: { ownerId: "owner-a" } }]]);
  let visitIncrements = 0;
  const client = {
    getDocument: async (path) => docs.get(path),
    listDocuments: async (path) => {
      if (path === "users/owner-a/cats") return [{ id: "cat-a", data: { name: "Cat" } }];
      assert.equal(path, "users/owner-a/catDetails");
      return [{ id: "cat-a", data: { rfidTag: "300833B2DDD9014000000001" } }];
    },
    createSetWrite: (path, data, condition) => ({path, data, condition}),
    createIncrementWrite: (path, data, increments) => ({path, data, increments}),
    commit: async (writes) => {
      for (const w of writes) {
        if (w.condition?.exists === false) assert.equal(docs.has(w.path), false);
        if (w.increments) visitIncrements += w.increments.visits;
        docs.set(w.path, {data: w.data});
      }
    },
  };
  const normalization = loadTs(new URL('../../../lib/utils/catHistoryNormalization.ts', import.meta.url), { 'node:crypto': require('node:crypto') });
  const sync = loadTs(new URL('../../../lib/utils/sensorSync.ts', import.meta.url));
  const ingestion = loadTs(new URL('../../../lib/utils/catVisitIngestion.ts', import.meta.url), { 'node:crypto': require('node:crypto'), './catHistoryNormalization': normalization, './catHistoryStore': {}, './sensorSync': sync });
  const route = loadTs(new URL("./route.ts", import.meta.url), {
    "@/lib/utils/catVisitIngestion": { backupSensorVisits: async () => ({ inserted: 0, duplicates: 0, conflicts: 0 }) },
    '@/lib/utils/catVisitRecovery': loadVisitWriter(client, 'cfg_abcdefghijklmnop', sync, ingestion, normalization),
    "@/lib/utils/catHistoryStore": { readVisitBackupsById: async () => [] },
    "@/lib/utils/catHistoryNormalization": loadTs(new URL("../../../lib/utils/catHistoryNormalization.ts", import.meta.url), { "node:crypto": require("node:crypto") }),
    "@/lib/utils/sensorSnapshotStore": { selectSensorSnapshot, readSensorMirrors: async () => [], rememberSensorDevice: async () => {}, saveSensorMirror: async () => true },
    "@/lib/utils/sensorSms": { queueSensorSms: async () => ({ recognized: false, queued: 0 }) },
    "@/lib/utils/rfidNotifications": { queueRfidNotifications: async (...args) => { if (alertFailure) throw new Error('temporary alert store failure'); alerts.push(args); return { queued: 1, ownerId: 'owner-a' }; } },
    "@/lib/utils/smsDelivery": { processSmsOutbox: async () => ({ enabled: false }) },
    "@/lib/utils/pushDelivery": { processPushOutbox: async () => ({ processed: 0 }) },
    "next/server": { after: () => {} },
    "@/lib/utils/firestoreRest": { getFirestoreRestClient: () => client, FirestoreRestError: class extends Error {} },
    "@/lib/utils/sensorSync": loadTs(new URL("../../../lib/utils/sensorSync.ts", import.meta.url)),
    "@/lib/utils/gasUltrasonic": { ...require("../../../lib/utils/gasUltrasonic.ts"), fetchGasUltrasonic: async () => ({ gasUltrasonicOnline: false }) },
    "@/lib/utils/sensorEndpointDiagnostics": { shouldSkipServerSensorProxy: () => false },
    "@/lib/utils/deviceSensorSnapshot": { buildDeviceSensorSnapshot, toDeviceSensorsResponse, SENSOR_SNAPSHOT_STALE_AFTER_MS },
    "@/lib/utils/rfidEnrollment": require("../../../lib/utils/rfidEnrollment.ts"),
    "@/lib/configs/firebase-admin": { getAdminAuth: () => ({verifyIdToken: async (token) => {
      if (token === "bad") throw new Error("bad token");
      return {uid: token};
    }}) },
  });
  const post = (body, token = "cfg_abcdefghijklmnop") => route.POST(new Request("https://test/api/sensors", {
    method: "POST", headers: {"Content-Type": "application/json", "x-device-config-token": token}, body: JSON.stringify(body),
  }));
  const entry = {sessionActive: true, activeRfidHex: "300833B2DDD9014000000001", activeSessionDurationMs: 0, activeSessionStartMs: Date.now(), events: []};
  assert.equal((await post(entry)).status, 200);
  assert.equal(alerts.length, 1, 'entry ingestion queues alerts without any dashboard process');
  assert.equal(alerts[0][0].sessionActive, true);
  assert.equal(alerts[0][4], 'owner-a');
  assert.equal(docs.get("users/owner-a/deviceState/current").data.sessionActive, true);
  assert.equal(visitIncrements, 0);
  const gas = { source: "gas-ultrasonic", mq135Raw: 0, mq136Raw: 1, distanceCm: 24.5 };
  const rfidBeforeGas = JSON.stringify(docs.get("users/owner-a/deviceState/current"));
  assert.equal((await post(gas)).status, 200);
  assert.equal(alerts.length, 1, 'gas uploads must not enter the RFID alert path');
  assert.ok(docs.has("users/owner-a/deviceState/gasUltrasonic"), "sensor push must save its own snapshot");
  assert.equal(JSON.stringify(docs.get("users/owner-a/deviceState/current")), rfidBeforeGas);
  assert.equal(visitIncrements, 0);
  const getOwner = async (owner = "owner-a") => (await route.GET(new Request("https://test/api/sensors", {
    headers: { Authorization: `Bearer ${owner}` },
  }))).json();
  let displayed = await getOwner();
  assert.equal(displayed.gasUltrasonicOnline, true, "old polling URL must not override a pushed reading");
  assert.equal(displayed.distanceCm, 24.5);
  assert.equal(displayed.mq135, "Gas Detected");
  assert.equal(displayed.sessionActive, true);
  assert.equal((await getOwner("owner-b")).gasUltrasonicOnline, false);
  const gasBeforeInvalid = JSON.stringify(docs.get("users/owner-a/deviceState/gasUltrasonic"));
  for (const invalid of [{ mq135Raw: 2 }, { mq136Raw: "1" }, { distanceCm: -1 }, { distanceCm: 516 }, { distanceCm: "24" }]) {
    assert.equal((await post({ ...gas, ...invalid })).status, 400);
  }
  assert.equal((await post(gas, "cfg_unknown_unknown")).status, 404);
  assert.equal((await post(gas, "")).status, 400);
  assert.equal(JSON.stringify(docs.get("users/owner-a/deviceState/gasUltrasonic")), gasBeforeInvalid);
  docs.get("users/owner-a/deviceState/gasUltrasonic").data.updatedAt = new Date(Date.now() - 94000).toISOString();
  displayed = await getOwner();
  assert.equal(displayed.gasUltrasonicOnline, true, 'gas stays online across the observed transport gap');
  assert.equal(displayed.gasUltrasonicState, 'online');
  docs.get("users/owner-a/deviceState/gasUltrasonic").data.updatedAt = new Date(Date.now() - 121000).toISOString();
  displayed = await getOwner();
  assert.equal(displayed.gasUltrasonicOnline, false);
  assert.equal(displayed.gasUltrasonicState, "stale");
  assert.equal(displayed.rfidState, "online");
  assert.equal(displayed.distanceCm, null);
  assert.equal(displayed.sessionActive, true, "gas expiry must not clear RFID state");
  assert.equal((await post({ ...gas, distanceCm: null })).status, 200);
  assert.equal((await getOwner()).gasUltrasonicOnline, true);
  const exit = {sessionActive: false, events: [{eventId: "boot_1000_11000", status: "NORMAL", durationMs: 10000, rfidHex: entry.activeRfidHex, endedAtMs: Date.now()}]};
  assert.equal((await post(exit)).headers.get("x-litersense-ack"), "boot_1000_11000");
  assert.equal(alerts.at(-1)[2][0].eventId, 'boot_1000_11000');
  assert.equal(alerts.at(-1)[5][0], 'sync_boot_1000_11000', 'exit notification requires a persisted visit');
  assert.equal((await getOwner()).gasUltrasonicOnline, true, "RFID exit must not erase gas readings");
  const incrementsAfterExit = visitIncrements;
  assert.ok(incrementsAfterExit > 0);
  const retry = await post(exit);
  assert.equal((await retry.json()).duplicates, 1);
  assert.equal(retry.headers.get("x-litersense-ack"), "boot_1000_11000");
  assert.equal(visitIncrements, incrementsAfterExit);
  alertFailure = true;
  assert.equal((await post(exit)).status, 503, 'alert queue failure requests retry without undoing the saved visit');
  assert.equal(visitIncrements, incrementsAfterExit);
  alertFailure = false;
  assert.equal((await post(exit)).headers.get('x-litersense-ack'), 'boot_1000_11000');
  assert.equal(visitIncrements, incrementsAfterExit, 'recovered alert queue does not count the visit again');
  assert.equal(docs.get("users/owner-a/sessions/sync_boot_1000_11000").data.durationSecs, 10);
  assert.equal(docs.has("deviceState/current"), false);
  for (const [token, online] of [["owner-a", true], ["owner-b", false]]) {
    const response = await route.GET(new Request("https://test/api/sensors", {headers: {Authorization: `Bearer ${token}`}}));
    assert.equal((await response.json()).online, online);
  }
  assert.equal((await route.GET(new Request("https://test/api/sensors", {headers: {Authorization: "Bearer bad"}}))).status, 401);
  assert.equal((await post(exit, "cfg_unknown_unknown")).status, 404);
  const unmatched = await post({...exit, events: [{...exit.events[0], eventId: "unknown", rfidHex: "ABCD"}]});
  assert.equal(unmatched.headers.get("x-litersense-ack"), "");
  const enrollmentPath = "users/owner-a/deviceState/rfidEnrollment";
  const enrollmentRoute = loadTs(new URL("../rfid-enrollment/route.ts", import.meta.url), {
    "node:crypto": require("node:crypto"),
    "@/lib/utils/firestoreRest": { getFirestoreRestClient: () => client },
    "@/lib/utils/rfidEnrollment": require("../../../lib/utils/rfidEnrollment.ts"),
    "@/lib/configs/firebase-admin": { getAdminAuth: () => ({ verifyIdToken: async (token) => {
      if (token === "bad") throw new Error("bad token");
      return { uid: token };
    } }) },
  });
  const enrollmentRequest = (method, id) => new Request("https://test/api/rfid-enrollment", { method, headers: { Authorization: "Bearer owner-a", ...(id ? { "Content-Type": "application/json" } : {}) }, ...(id ? { body: JSON.stringify({ id }) } : {}) });
  assert.equal((await enrollmentRoute.POST(new Request("https://test/api/rfid-enrollment", { method: "POST", headers: { Authorization: "Bearer bad" } }))).status, 401);
  docs.get("users/owner-a/deviceState/current").data.deviceId = "reader-1";
  docs.get("users/owner-a/deviceState/current").data.updatedAt = new Date(Date.now() - 60000).toISOString();
  const started = await enrollmentRoute.POST(enrollmentRequest("POST"));
  assert.equal(started.status, 200);
  const enrollmentId = (await started.json()).id;
  const newTag = "AABBCCDDEEFF001122334455";
  const heartbeat = (scan) => post({ deviceId: "reader-1", sessionActive: false, events: [], enrollmentReadyId: enrollmentId, ...(scan ? { enrollmentScan: scan } : {}) });
  assert.equal((await (await heartbeat()).json()).enrollmentId, enrollmentId);
  // Legacy scans cannot bypass a hold. The same authenticated endpoint accepts reader progress.
  for (let sequence = 1; sequence <= 3; sequence++) {
    assert.equal((await (await heartbeat({ id: enrollmentId, sequence, tag: newTag })).json()).enrollmentAck, sequence);
    assert.notEqual(docs.get(enrollmentPath).data.status, "verified");
  }
  const sample = (sequence, holdMs, tag = newTag, present = true) => heartbeat({ id: enrollmentId, sequence, tag, version: 2, holdMs, present });
  await sample(4, 2000);
  assert.equal(docs.get(enrollmentPath).data.status, "holding");
  assert.equal(docs.get(enrollmentPath).data.tag, newTag);
  docs.get(enrollmentPath).data.progressReceivedAt = Date.now() - 6000;
  const staleProgress = await (await enrollmentRoute.GET(enrollmentRequest("GET"))).json();
  assert.equal(staleProgress.holdMs, 0);
  assert.equal(staleProgress.status, "ready");
  await sample(5, 0, "", false);
  assert.equal(docs.get(enrollmentPath).data.holdMs, 0);
  assert.match(docs.get(enrollmentPath).data.error, /5 seconds/);
  await sample(4, 5000);
  assert.notEqual(docs.get(enrollmentPath).data.status, "verified", "older packet cannot restore progress");
  docs.set("users/owner-a/cats/cat-a", { data: { name: "Zeno" } });
  await sample(6, 5000, "300833B2DDD9014000000001");
  assert.match(docs.get(enrollmentPath).data.error, /Zeno/);
  assert.notEqual(docs.get(enrollmentPath).data.status, "verified");
  await sample(7, 4999);
  assert.equal(docs.get(enrollmentPath).data.status, "holding");
  const completedHold = await (await sample(8, 5000)).json();
  assert.equal(completedHold.recorded, 0, "registration never creates a visit");
  assert.equal(completedHold.enrollmentId, "", "completed enrollment releases the firmware from registration mode");
  assert.equal(docs.get(enrollmentPath).data.status, "verified");
  assert.equal(docs.get(enrollmentPath).data.tag, newTag);
  assert.equal((await (await enrollmentRoute.GET(enrollmentRequest("GET"))).json()).tag, newTag);
  await enrollmentRoute.DELETE(enrollmentRequest("DELETE", "other-scan"));
  assert.equal(docs.get(enrollmentPath).data.status, "verified", "one dialog cannot cancel another scan");
  await enrollmentRoute.DELETE(enrollmentRequest("DELETE", enrollmentId));
  assert.equal((await (await enrollmentRoute.GET(enrollmentRequest("GET"))).json()).status, "expired");
});

test("live upload mirroring survives quota but never acknowledges unsaved visits or invalid ownership", async (t) => {
  const previous = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  process.env.SUPABASE_URL = "https://mirror.test"; process.env.SUPABASE_SECRET_KEY = "test";
  t.after(() => { for (const [index, key] of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"].entries()) { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; } });
  class FirestoreRestError extends Error { constructor(status) { super("Storage failure"); this.status = status; this.detail = "test failure"; } }
  let failure = 0, missing = false, mirrorFailure = false, queueFailure = false;
  const remembered = [], mirrored = [], background = [];
  const route = loadTs(new URL("./route.ts", import.meta.url), {
    "@/lib/utils/catVisitIngestion": { backupSensorVisits: async () => ({ inserted: 0, duplicates: 0, conflicts: 0 }) }, "@/lib/utils/catHistoryNormalization": {}, "@/lib/utils/catHistoryStore": {},
    "@/lib/utils/sensorSnapshotStore": {
      rememberSensorDevice: async (...args) => { remembered.push(args); },
      saveSensorMirror: async (...args) => { mirrored.push(args); if (mirrorFailure) throw new Error("Mirror unavailable"); return args[0] === "cfg_abcdefghijklmnop"; },
    },
    "@/lib/utils/firestoreRest": { FirestoreRestError, getFirestoreRestClient: () => ({
      getDocument: async (path) => { if (failure) throw new FirestoreRestError(failure); return path.startsWith("deviceConfigs/") ? missing ? null : { data: { ownerId: "owner-a" } } : null; },
      listDocuments: async () => [], createSetWrite: (path, data) => ({ path, data }), commit: async () => {},
    }) },
    "@/lib/utils/sensorSync": loadTs(new URL("../../../lib/utils/sensorSync.ts", import.meta.url)),
    "@/lib/utils/gasUltrasonic": require("../../../lib/utils/gasUltrasonic.ts"),
    "@/lib/utils/deviceSensorSnapshot": { buildDeviceSensorSnapshot, toDeviceSensorsResponse, SENSOR_SNAPSHOT_STALE_AFTER_MS },
    "@/lib/utils/sensorEndpointDiagnostics": {}, "@/lib/configs/firebase-admin": {},
    "@/lib/utils/rfidEnrollment": require("../../../lib/utils/rfidEnrollment.ts"),
    "@/lib/utils/sensorSms": { queueSensorSms: async () => { if (queueFailure) throw new Error("SMS unavailable"); return { recognized: false }; } },
    "@/lib/utils/smsDelivery": {}, "next/server": { after: (callback) => { background.push(callback); } },
  });
  const rawPost = (body, token = "cfg_abcdefghijklmnop") => route.POST(new Request("https://test/api/sensors", { method: "POST", headers: { "Content-Type": "application/json", "x-device-config-token": token }, body: JSON.stringify(body) }));
  const post = async (body, token) => { const response = await rawPost(body, token); for (const callback of background.splice(0)) await callback(); return response; };
  const gas = { source: "gas-ultrasonic", mq135Raw: 1, mq136Raw: 1, distanceCm: 20 };
  await rawPost(gas);
  assert.equal(mirrored.length, 0, "mirror calls must wait until after the device response");
  assert.equal(background.length, 1);
  await background.shift()();
  assert.equal((await post(gas)).status, 200);
  assert.equal(remembered[0]?.[0], "owner-a");
  assert.equal(mirrored[0]?.[1], "gas-ultrasonic");
  assert.equal(mirrored[0]?.[2].distanceCm, 20);
  assert.ok(Number.isFinite(Date.parse(mirrored[0]?.[3])));
  mirrorFailure = true;
  assert.equal((await post(gas)).status, 200, "mirror failure must preserve primary success");
  mirrorFailure = false; failure = 429;
  const visit = { sessionActive: true, activeRfidHex: "AABB", activeSessionStartMs: 1000, activeSessionDurationMs: 4000, events: [{ eventId: "one", status: "NORMAL", durationSecs: 300, rfidHex: "AABB" }] };
  const beforeOwners = remembered.length;
  let response = await post(visit);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("x-litersense-ack"), null);
  assert.equal(remembered.length, beforeOwners, "outage cannot create a trusted ownership mapping");
  assert.equal(mirrored.at(-1)[1], "rfid");
  assert.equal(mirrored.at(-1)[2].sessionActive, true);
  assert.equal(mirrored.at(-1)[2].activeRfidHex, "AABB");
  assert.equal(mirrored.at(-1)[2].completedSessionCount, undefined, "outage cannot invent persisted history");
  assert.equal(mirrored.at(-1)[2].lastSessionStatus, undefined);
  await post({ events: [] });
  assert.equal(mirrored.at(-1)[2].sessionActive, undefined, "partial heartbeat must preserve previous live state");
  await post({ activeRfidHex: "AABB", activeSessionDurationMs: 5000, events: [] });
  assert.equal(mirrored.at(-1)[2].activeRfidHex, "AABB");
  assert.equal(mirrored.at(-1)[2].activeSessionDurationMs, 5000);
  failure = 503; const beforeService = mirrored.length;
  assert.equal((await post(gas)).status, 503);
  assert.equal(mirrored.length, beforeService + 1);
  const beforeInvalid = mirrored.length;
  assert.equal((await post({ ...gas, mq135Raw: 9 })).status, 400);
  assert.equal((await post({ ...visit, sessionActive: "true" })).status, 400);
  assert.equal(mirrored.length, beforeInvalid);
  assert.equal((await post(gas, "bad")).status, 400);
  failure = 403;
  assert.equal((await post(gas)).status, 403);
  assert.equal(mirrored.length, beforeInvalid, "Firestore permission errors must not authorize fallback");
  failure = 0; missing = true;
  assert.equal((await post(gas)).status, 404);
  assert.equal(mirrored.length, beforeInvalid);
  missing = false; queueFailure = true;
  response = await post(gas);
  assert.equal(response.status, 503, "existing SMS retry semantics are preserved");
  assert.equal(mirrored.length, beforeInvalid + 1, "SMS failure must not prevent mirror storage");
  failure = 429; queueFailure = false;
  response = await post(visit, "cfg_unknown_unknown");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("x-litersense-ack"), null);
});

test("durable outage visits acknowledge only verified storage; primary recovery counts once", async (t) => {
  const previous = [process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY];
  process.env.SUPABASE_URL = "https://backup.test"; process.env.SUPABASE_SECRET_KEY = "test";
  t.after(() => { for (const [index, key] of ["SUPABASE_URL", "SUPABASE_SECRET_KEY"].entries()) { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; } });
  class FirestoreRestError extends Error { constructor(status) { super('Storage unavailable'); this.status = status; } }
  const rows = new Map(), docs = new Map(), background = [], snapshots = [];
  let failure = 429, revoked = false, catalogComplete = true, storeFailure = false, increments = 0, smsCalls = 0, senderCalls = 0, beforeStore = null, duplicateTag = false, snapshotFailure = false, sdkFailure = 0;
  const token = 'cfg_abcdefghijklmnop';
  const tokenHash = require('node:crypto').createHash('sha256').update(token).digest('hex');
  const normalization = loadTs(new URL('../../../lib/utils/catHistoryNormalization.ts', import.meta.url), { 'node:crypto': require('node:crypto') });
  const sync = loadTs(new URL('../../../lib/utils/sensorSync.ts', import.meta.url));
  const backup = loadTs(new URL('../../../lib/utils/catVisitIngestion.ts', import.meta.url), {
    'node:crypto': require('node:crypto'), './sensorSync': sync, './catHistoryNormalization': normalization,
    './catHistoryStore': {
      resolveCatBackupDevice: async supplied => supplied === token && !revoked ? { ownerId: 'owner-a', tokenHash, catalog: { complete: catalogComplete, profiles: [{ catId: 'cat-a', cat: { name: 'Cat' }, details: { rfidTag: 'AABB' } }] } } : null,
      readVisitBackupsById: async (_owner, ids) => ids.flatMap(id => rows.has(id) ? [rows.get(id)] : []),
      saveVisitBackups: async (owner, visits) => {
        assert.equal(owner, 'owner-a'); if (beforeStore) await beforeStore(); if (storeFailure) throw new Error('Private failure detail');
        const counts = { inserted: 0, duplicates: 0, conflicts: 0 };
        for (const visit of visits) { const old = rows.get(visit.sessionId); if (!old) { rows.set(visit.sessionId, visit); counts.inserted++; } else if (old.digest === visit.digest) { counts.duplicates++; if (visit.state === 'primary_saved') rows.set(visit.sessionId, visit); } else counts.conflicts++; }
        return counts;
      },
    },
  });
  const client = {
    getDocument: async path => { if (failure) throw new FirestoreRestError(failure); return path.startsWith('deviceConfigs/') ? { data: { ownerId: 'owner-a' } } : docs.get(path); },
    listDocuments: async path => path.endsWith('/cats') ? [{ id: 'cat-a', data: { name: 'Cat' } }, ...(duplicateTag ? [{ id: 'cat-b', data: { name: 'Other' } }] : [])] : [{ id: 'cat-a', data: { rfidTag: 'AABB' } }, ...(duplicateTag ? [{ id: 'cat-b', data: { rfidTag: 'AABB' } }] : [])],
    createSetWrite: (path, data) => ({ path, data }), createIncrementWrite: (path, data, change) => ({ path, data, change }),
    commit: async writes => { if (sdkFailure) throw Object.assign(new Error('Private SDK failure'), { code: sdkFailure }); for (const write of writes) { if (snapshotFailure && write.path.endsWith('/deviceState/current')) throw new Error('Snapshot failed'); docs.set(write.path, { data: write.data }); if (write.change) increments += write.change.visits; } },
  };
  const route = loadTs(new URL('./route.ts', import.meta.url), {
    '@/lib/utils/catVisitIngestion': backup, '@/lib/utils/catHistoryNormalization': normalization,
    '@/lib/utils/catVisitRecovery': loadVisitWriter(client, token, sync, backup, normalization),
    '@/lib/utils/catHistoryStore': { readVisitBackupsById: async (_owner, ids) => ids.flatMap(id => rows.has(id) ? [rows.get(id)] : []) },
    '@/lib/utils/firestoreRest': { FirestoreRestError, getFirestoreRestClient: () => client }, '@/lib/utils/sensorSync': sync,
    '@/lib/utils/deviceSensorSnapshot': { buildDeviceSensorSnapshot, toDeviceSensorsResponse, SENSOR_SNAPSHOT_STALE_AFTER_MS }, '@/lib/utils/gasUltrasonic': require('../../../lib/utils/gasUltrasonic.ts'),
    '@/lib/utils/sensorSnapshotStore': { rememberSensorDevice: async () => {}, saveSensorMirror: async (...args) => snapshots.push(args) },
    '@/lib/utils/rfidEnrollment': require('../../../lib/utils/rfidEnrollment.ts'), '@/lib/utils/sensorEndpointDiagnostics': {}, '@/lib/configs/firebase-admin': {},
    '@/lib/utils/sensorSms': { queueSensorSms: async () => { smsCalls++; return { recognized: false }; } }, '@/lib/utils/smsDelivery': { processSmsOutbox: async () => { senderCalls++; } },
    'next/server': { after: callback => background.push(callback) },
  });
  const event = { eventId: '12345678_1000_33000', status: 'NORMAL', durationSecs: 32, rfidHex: 'AABB', endedAt: '2026-10-04T08:00:32Z' };
  const rawPost = (events, supplied = token) => route.POST(new Request('https://test/api/sensors', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-config-token': supplied }, body: JSON.stringify({ events, sessionActive: false, enrollmentScan: { id: 'scan', sequence: 3, tag: 'AABB' } }) }));
  const flush = async () => { for (const callback of background.splice(0)) await callback(); };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  beforeStore = () => gate;
  let answered = false;
  const waiting = rawPost([event]).then(response => { answered = true; return response; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(answered, false, 'Outage response must await durable visit storage');
  release(); beforeStore = null;
  let response = await waiting;
  assert.equal(response.status, 200); assert.equal(rows.size, 1);
  assert.equal(response.headers.get('x-litersense-ack'), event.eventId);
  assert.equal((await response.json()).enrollmentAck, undefined);
  await flush();
  response = await rawPost([event]); await flush();
  assert.equal(rows.size, 1); assert.equal(response.headers.get('x-litersense-ack'), event.eventId);
  assert.equal([...rows.values()][0].state, 'pending');
  assert.equal(snapshots.at(-1)[1], 'rfid'); assert.equal(increments, 0);
  revoked = true; await rawPost([{ ...event, eventId: 'revoked' }]); await flush();
  revoked = false; catalogComplete = false; await rawPost([{ ...event, eventId: 'partial' }]); await flush();
  assert.equal(rows.size, 1);
  catalogComplete = true; storeFailure = true;
  response = await rawPost([{ ...event, eventId: 'unsaved' }]); await flush();
  assert.equal(response.status, 429); assert.equal(response.headers.get('x-litersense-ack'), null);
  assert.equal(rows.size, 1);
  storeFailure = false; failure = 403;
  response = await rawPost([{ ...event, eventId: 'forbidden' }]); await flush();
  assert.equal(response.status, 403); assert.equal(rows.size, 1);
  assert.equal((await rawPost([event], 'bad')).status, 400);
  failure = 0;
  response = await rawPost([{ ...event, endedAt: '2026-10-04T08:00:32.500Z' }]);
  assert.equal(response.headers.get('x-litersense-ack'), event.eventId);
  assert.equal([...rows.values()][0].state, 'pending', 'Confirmed mirroring runs after the primary response');
  await flush();
  assert.equal([...rows.values()][0].state, 'primary_saved');
  const afterFirst = increments;
  response = await rawPost([event]); await flush();
  assert.equal(response.headers.get('x-litersense-ack'), event.eventId);
  assert.equal(increments, afterFirst);
  assert.equal(rows.size, 1);
  response = await rawPost([{ ...event, durationSecs: 33 }]); await flush();
  assert.equal(response.status, 409, 'Meaningful primary identity conflict must not acknowledge a saved visit');
  assert.equal(response.headers.get('x-litersense-ack'), null); assert.equal(increments, afterFirst);
  duplicateTag = true;
  response = await rawPost([{ ...event, eventId: 'ambiguous' }]); await flush();
  assert.equal(response.headers.get('x-litersense-ack'), '');
  assert.equal(rows.size, 1); assert.equal(increments, afterFirst);
  duplicateTag = false; snapshotFailure = true;
  response = await rawPost([{ ...event, eventId: 'snapshot-failed' }]);
  assert.equal(response.status, 503); assert.equal(response.headers.get('x-litersense-ack'), null);
  await flush();
  assert.equal(rows.get('sync_snapshot-failed').state, 'primary_saved', 'A later snapshot failure cannot lose the confirmed visit backup');
  snapshotFailure = false; sdkFailure = 14;
  response = await rawPost([{ ...event, eventId: 'sdk-unavailable' }]); await flush();
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-litersense-ack'), 'sdk-unavailable'); assert.equal(rows.get('sync_sdk-unavailable').state, 'pending');
  sdkFailure = 7;
  response = await rawPost([{ ...event, eventId: 'sdk-forbidden' }]); await flush();
  assert.equal(response.status, 403); assert.equal(rows.has('sync_sdk-forbidden'), false);
  assert.ok(smsCalls > 0); assert.equal(senderCalls, 0);
});
