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

test("RFID entry, exit, retry and authenticated owner snapshot through the route", async () => {
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
    "@/lib/utils/sensorEndpointDiagnostics": {},
    "@/lib/utils/deviceSensorSnapshot": { buildDeviceSensorSnapshot, toDeviceSensorsResponse },
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
  const exit = {sessionActive: false, events: [{eventId: "boot_1000_11000", status: "NORMAL", durationMs: 10000, rfidHex: entry.activeRfidHex, endedAtMs: Date.now()}]};
  assert.equal((await post(exit)).headers.get("x-litersense-ack"), "boot_1000_11000");
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
});
