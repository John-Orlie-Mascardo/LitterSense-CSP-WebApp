import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./HomeAlertBanner.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
});
const loaded = { exports: {} };
vm.runInNewContext(outputText, {
  module: loaded,
  exports: loaded.exports,
  require: () => ({}),
});
const { isHomeAlert } = loaded.exports;

test("unread gas, abnormal, and litter alerts show on Home", () => {
  for (const source of ["ammonia_alert", "h2s_alert", "dashboard_abnormal", "litter_level"]) {
    assert.equal(isHomeAlert({ type: "health", source, isRead: false }), true, source);
  }
});

test("routine visit notices, system messages, and read alerts stay out of the banner", () => {
  assert.equal(isHomeAlert({ type: "cat_visit", source: "rfid_visit", isRead: false }), false);
  assert.equal(isHomeAlert({ type: "system", source: "system", isRead: false }), false);
  assert.equal(isHomeAlert({ type: "health", source: "admin", isRead: false }), false);
  assert.equal(isHomeAlert({ type: "health", source: "h2s_alert", isRead: true }), false);
});

test("health alerts without a source still show", () => {
  assert.equal(isHomeAlert({ type: "health", isRead: false }), true);
});

test("the banner reuses the existing notification context instead of subscribing again", () => {
  assert.match(source, /useNotifications\(\)/);
  assert.doesNotMatch(source, /onSnapshot|subscribeNotificationLive/);
});

test("offline boards show as a plain message with the time they went quiet", () => {
  const { formatOfflineBoardMessage } = loaded.exports;
  const message = formatOfflineBoardMessage({ board: "rfid", label: "RFID reader", lastSeenAt: "2026-11-09T02:42:00Z" });
  assert.match(message, /^RFID reader is offline/);
  assert.match(message, /10:42/);
});

test("Home passes offline boards from the sensor data it already loads", () => {
  const home = readFileSync(new URL("../../app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(home, /<HomeAlertBanner offlineBoards=\{getOfflineBoards\(sensorData\)\} \/>/);
  assert.match(source, /offlineBoards/);
});
