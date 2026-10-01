import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { buildDeviceSensorSnapshot, toDeviceSensorsResponse } = require("../../../lib/utils/deviceSensorSnapshot.ts");
function loadTs(url, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, require: (name) => {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    }, Request, Response, URL, URLSearchParams, Date, process, console, setTimeout, clearTimeout,
  });
  return loadedModule.exports;
}

test("RFID entry, exit, retry and authenticated owner snapshot through the route", async (t) => {
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
  const route = loadTs(new URL("./route.ts", import.meta.url), {
    "@/lib/utils/firestoreRest": { getFirestoreRestClient: () => client, FirestoreRestError: class extends Error {} },
    "@/lib/utils/sensorSync": loadTs(new URL("../../../lib/utils/sensorSync.ts", import.meta.url)),
    "@/lib/utils/gasUltrasonic": { ...require("../../../lib/utils/gasUltrasonic.ts"), fetchGasUltrasonic: async () => ({ gasUltrasonicOnline: false }) },
    "@/lib/utils/sensorEndpointDiagnostics": { shouldSkipServerSensorProxy: () => false },
    "@/lib/utils/deviceSensorSnapshot": { buildDeviceSensorSnapshot, toDeviceSensorsResponse },
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
  assert.equal(docs.get("users/owner-a/deviceState/current").data.sessionActive, true);
  assert.equal(visitIncrements, 0);
  const gas = { source: "gas-ultrasonic", mq135Raw: 0, mq136Raw: 1, distanceCm: 24.5 };
  const rfidBeforeGas = JSON.stringify(docs.get("users/owner-a/deviceState/current"));
  assert.equal((await post(gas)).status, 200);
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
  docs.get("users/owner-a/deviceState/gasUltrasonic").data.updatedAt = new Date(Date.now() - 181000).toISOString();
  displayed = await getOwner();
  assert.equal(displayed.gasUltrasonicOnline, false);
  assert.equal(displayed.distanceCm, null);
  assert.equal(displayed.sessionActive, true, "gas expiry must not clear RFID state");
  assert.equal((await post({ ...gas, distanceCm: null })).status, 200);
  assert.equal((await getOwner()).gasUltrasonicOnline, true);
  const exit = {sessionActive: false, events: [{eventId: "boot_1000_11000", status: "NORMAL", durationMs: 10000, rfidHex: entry.activeRfidHex, endedAtMs: Date.now()}]};
  assert.equal((await post(exit)).headers.get("x-litersense-ack"), "boot_1000_11000");
  assert.equal((await getOwner()).gasUltrasonicOnline, true, "RFID exit must not erase gas readings");
  const incrementsAfterExit = visitIncrements;
  assert.ok(incrementsAfterExit > 0);
  const retry = await post(exit);
  assert.equal((await retry.json()).duplicates, 1);
  assert.equal(retry.headers.get("x-litersense-ack"), "boot_1000_11000");
  assert.equal(visitIncrements, incrementsAfterExit);
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
  for (let sequence = 1; sequence <= 3; sequence++) {
    const response = await heartbeat({ id: enrollmentId, sequence, tag: newTag });
    const result = await response.json();
    assert.equal(result.enrollmentAck, sequence);
    assert.equal(result.recorded, 0, "enrollment must not create a visit");
    assert.equal(docs.get(enrollmentPath).data.tag, newTag, "the dialog can display the EPC from the first scan");
  }
  assert.equal(docs.get(enrollmentPath).data.status, "verified");
  assert.equal(docs.get(enrollmentPath).data.tag, newTag);
  assert.equal((await (await enrollmentRoute.GET(enrollmentRequest("GET"))).json()).tag, newTag);
  await enrollmentRoute.DELETE(enrollmentRequest("DELETE", "other-scan"));
  assert.equal(docs.get(enrollmentPath).data.status, "verified", "one dialog cannot cancel another scan");
  await enrollmentRoute.DELETE(enrollmentRequest("DELETE", enrollmentId));
  assert.equal((await (await enrollmentRoute.GET(enrollmentRequest("GET"))).json()).status, "expired");
});
