import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, "sensorSync.ts");

function loadSensorSync() {
  const source = readFileSync(sourcePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const sandboxModule = { exports: {} };
  const context = {
    module: sandboxModule,
    exports: sandboxModule.exports,
  };

  vm.runInNewContext(outputText, context, { filename: sourcePath });

  return sandboxModule.exports;
}

const {
  buildSessionDocumentId,
  buildVisitWritePlan,
  findCatIdByRfid,
  normalizeSensorSyncRequest,
} = loadSensorSync();

test("normalizes a root ESP32 replay payload into one countable sync event", () => {
  const receivedAt = new Date("2026-05-07T06:30:00.000Z");
  const result = normalizeSensorSyncRequest(
    {
      configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
      completedSessionCount: 7,
      lastSessionStatus: "NORMAL",
      lastSessionDurationMs: 125000,
      endedAt: "2026-05-07T06:29:00.000Z",
      activeRfidCard: "00967D97",
      activeRfidHex: "0200967D9703",
    },
    receivedAt,
  );

  assert.equal(result.configToken, "cfg_abcdefghijklmnopqrstuvwxyz");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].durationSecs, 125);
  assert.equal(result.events[0].status, "NORMAL");
  assert.equal(result.events[0].endedAt, "2026-05-07T06:29:00.000Z");
});

test("filters false entries out of offline replay writes", () => {
  const result = normalizeSensorSyncRequest(
    {
      configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
      events: [
        {
          eventId: "false-entry-1",
          lastSessionStatus: "FALSE_ENTRY_IGNORED",
          lastSessionDurationMs: 2000,
          rfidCard: "00967D97",
        },
      ],
    },
    new Date("2026-05-07T06:30:00.000Z"),
  );

  assert.equal(result.events.length, 0);
  assert.equal(result.ignored.length, 1);
  assert.equal(result.ignored[0].reason, "status_not_countable");
});

test("normalizes the actual firmware SD session payload shape", () => {
  const result = normalizeSensorSyncRequest(
    {
      deviceId: "ESP32-CAM-TEST",
      events: [
        {
          type: "rfid",
          tagHex: "00967D97",
          tagDec: "9862551",
          event: "ENTER",
          timestamp: 1778205600,
        },
        {
          type: "session",
          tagHex: "00967D97",
          duration: 150000,
          status: "NORMAL",
          timestamp: 1778205750,
        },
      ],
    },
    new Date("2026-05-08T02:20:00.000Z"),
  );

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].rfidHex, "00967D97");
  assert.equal(result.events[0].durationSecs, 150);
  assert.equal(result.events[0].endedAt, "2026-05-08T02:02:30.000Z");
  assert.equal(result.ignored.length, 1);
});

test("matches replayed RFID cards to registered cat details only", () => {
  const match = findCatIdByRfid(
    [
      ["cat-1", { rfidTag: "00967D97" }],
      ["cat-2", { rfidTag: "11223344" }],
    ],
    "00967D97",
    "",
  );
  const miss = findCatIdByRfid([["cat-1", { rfidTag: "00967D97" }]], "9862551", "00968457");

  assert.equal(match, "cat-1");
  assert.equal(miss, null);
});

test("builds idempotent Firestore write plans for synced visits", () => {
  const event = normalizeSensorSyncRequest(
    {
      configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
      events: [
        {
          eventId: "sd-log-42",
          lastSessionStatus: "SHORT_SESSION",
          lastSessionDurationMs: 45000,
          endedAt: "2026-05-07T06:29:00.000Z",
          rfidCard: "00967D97",
          mq135Delta: 3,
          mq136Delta: 1,
        },
      ],
    },
    new Date("2026-05-07T06:30:00.000Z"),
  ).events[0];

  const sessionId = buildSessionDocumentId("cfg_abcdefghijklmnopqrstuvwxyz", event);
  const plan = buildVisitWritePlan({
    userId: "owner-1",
    catId: "cat-1",
    configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
    event,
    sessionId,
    serverNow: new Date("2026-05-07T06:31:00.000Z"),
  });

  assert.equal(sessionId, buildSessionDocumentId("cfg_abcdefghijklmnopqrstuvwxyz", event));
  assert.equal(plan.sessionPath, "users/owner-1/sessions/sync_sd-log-42");
  assert.equal(plan.sessionData.catId, "cat-1");
  assert.equal(plan.sessionData.durationSecs, 45);
  assert.equal(plan.sessionData.anomaly, true);
  assert.equal(plan.sessionData.anomalyType, "Short session");
  assert.deepEqual(Array.from(plan.summaryPaths), [
    "users/owner-1/dailyCatStats/2026-05-07/cats/cat-1",
    "users/owner-1/catStats/cat-1/daily/2026-05-07",
    "users/owner-1/catStats/cat-1",
  ]);
});
