import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./deviceOffline.ts", import.meta.url), "utf8");
const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: loaded, exports: loaded.exports });
const { getOfflineBoards, DEVICE_OFFLINE_AFTER_MS } = loaded.exports;

const now = Date.parse("2026-11-09T05:00:00Z");
const ago = (minutes) => new Date(now - minutes * 60000).toISOString();

test("a board silent for more than 5 minutes is reported with when it went quiet", () => {
  const offline = getOfflineBoards({ rfidUpdatedAt: ago(6), gasUltrasonicUpdatedAt: ago(1) }, now);
  assert.equal(offline.length, 1);
  assert.equal(offline[0].board, "rfid");
  assert.equal(offline[0].label, "RFID reader");
  assert.equal(offline[0].lastSeenAt, ago(6));
});

test("short blips under 5 minutes do not raise an alarm", () => {
  assert.equal(DEVICE_OFFLINE_AFTER_MS, 5 * 60000);
  assert.equal(getOfflineBoards({ rfidUpdatedAt: ago(4), gasUltrasonicUpdatedAt: ago(4.9) }, now).length, 0);
});

test("both boards can be offline at once", () => {
  const offline = getOfflineBoards({ rfidUpdatedAt: ago(30), gasUltrasonicUpdatedAt: ago(10) }, now);
  assert.equal(offline.map((board) => board.board).join(","), "rfid,gas-ultrasonic");
  assert.equal(offline[1].label, "Gas and doorway sensor");
});

test("a board that never reported is not called offline", () => {
  assert.equal(getOfflineBoards({ rfidUpdatedAt: "", gasUltrasonicUpdatedAt: undefined }, now).length, 0);
});

test("no data or a cloud read error gives no alarm, because the state is unknown", () => {
  assert.equal(getOfflineBoards(null, now).length, 0);
  assert.equal(getOfflineBoards({ rfidUpdatedAt: ago(60), rfidCloudError: true }, now).length, 0);
});
