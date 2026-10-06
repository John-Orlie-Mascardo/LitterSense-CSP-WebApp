import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

test("selects the newest receipt for each source without refreshing stale data", () => {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./sensorSnapshotStore.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, Date, require: () => ({}) });
  const now = Date.parse("2026-10-04T12:00:00Z");
  const firebase = { source: "rfid", data: {}, receivedAt: "2026-10-04T11:50:00Z" };
  const backup = { source: "rfid", data: {}, receivedAt: "2026-10-04T11:59:00Z" };
  const select = loaded.exports.selectSensorSnapshot;
  assert.equal(select("rfid", firebase, [backup], now), backup);
  assert.equal(select("rfid", backup, [{ ...backup }], now), backup);
  assert.equal(select("gas-ultrasonic", null, [backup], now), null);
  assert.equal(select("rfid", firebase, [{ ...backup, receivedAt: "invalid" }, { ...backup, receivedAt: "2026-10-05T12:00:00Z" }], now), firebase);
  assert.equal(select("rfid", firebase, [], now).receivedAt, firebase.receivedAt);
});

test("sensor mirror hashes ownership, filters secrets, scopes reads, and fails closed", async () => {
  const calls = [];
  let status = 200, result = true, emptyResponse = false;
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./sensorSnapshotStore.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports, Date,
    require: (name) => name === "node:crypto" ? crypto : { smsStoreRequest: async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) });
      return { ok: status === 200, status, json: async () => { if (emptyResponse) throw new SyntaxError("Empty response"); return result; } };
    } },
  });
  const helper = loaded.exports;
  const token = "cfg_abcdefghijklmnop", hash = crypto.createHash("sha256").update(token).digest("hex");
  await helper.rememberSensorDevice("owner-a", token);
  assert.deepEqual(calls.pop(), { path: "rpc/remember_sensor_device", body: { p_owner_id: "owner-a", p_token_hash: hash } });
  emptyResponse = true;
  await helper.rememberSensorDevice("owner-a", token);
  calls.pop();
  emptyResponse = false;
  const receipt = new Date().toISOString();
  assert.equal(await helper.saveSensorMirror(token, "rfid", { sessionActive: true, configToken: token, wifiPassword: "omit", ownerId: "other-owner", arbitrary: "omit" }, receipt), true);
  const saved = calls.pop();
  assert.equal(saved.path, "rpc/save_sensor_mirror");
  assert.deepEqual(saved.body, { p_token_hash: hash, p_source: "rfid", p_data: { sessionActive: true }, p_received_at: receipt });
  result = false;
  assert.equal(await helper.saveSensorMirror(token, "rfid", {}, receipt), false);
  result = [{ source: "rfid", data: { sessionActive: true }, received_at: receipt }];
  const snapshots = await helper.readSensorMirrors("owner-a");
  assert.equal(calls.pop().body.p_owner_id, "owner-a");
  assert.equal(snapshots[0].receivedAt, receipt);
  const before = calls.length;
  await assert.rejects(helper.readSensorMirrors(""));
  await assert.rejects(helper.saveSensorMirror(token, "camera", {}, receipt));
  await assert.rejects(helper.saveSensorMirror(token, "rfid", {}, "invalid"));
  await assert.rejects(helper.saveSensorMirror(token, "rfid", {}, new Date(Date.now() + 60000).toISOString()));
  await assert.rejects(helper.rememberSensorDevice("owner-a", "invalid"));
  assert.equal(calls.length, before);
  await helper.rememberSensorDevice("owner-a", "abcdefghijklmnop");
  assert.equal(calls.pop().body.p_token_hash, crypto.createHash("sha256").update("abcdefghijklmnop").digest("hex"));
  status = 503;
  await assert.rejects(helper.readSensorMirrors("owner-a"), /503/);
  await assert.rejects(helper.saveSensorMirror(token, "rfid", {}, receipt), /503/);
});
