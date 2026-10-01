import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { acceptEnrollmentScan, isEnrollmentActive } = require("./rfidEnrollment.ts");

test("three separate matching RFID scans verify one tag; retries and other tags do not", () => {
  let state = { id: "scan", deviceId: "reader", status: "ready", count: 0, tag: "", lastScanId: -1, error: "", expiresAt: Date.now() + 120000 };
  const tag = "300833B2DDD9014000000001";
  state = acceptEnrollmentScan(state, 1, tag, []);
  assert.equal(state.count, 1);
  assert.equal(acceptEnrollmentScan(state, 1, tag, []).count, 1);
  state = acceptEnrollmentScan(state, 2, "ABCD", []);
  assert.equal(state.count, 0);
  assert.match(state.error, /Different tag/);
  state = acceptEnrollmentScan(state, 3, tag, []);
  state = acceptEnrollmentScan(state, 4, tag, []);
  state = acceptEnrollmentScan(state, 5, tag, []);
  assert.equal(state.status, "verified");
  assert.equal(state.tag, tag);
  assert.equal(isEnrollmentActive(state), false);
  assert.equal(isEnrollmentActive({ ...state, status: "ready", expiresAt: Date.now() - 1 }), false);
  assert.match(acceptEnrollmentScan({ ...state, status: "ready", count: 0 }, 6, tag, [tag]).error, /already registered/);
});
