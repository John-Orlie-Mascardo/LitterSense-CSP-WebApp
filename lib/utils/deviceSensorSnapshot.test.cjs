const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDeviceSensorSnapshot,
  toDeviceSensorsResponse,
} = require("./deviceSensorSnapshot.ts");

test("increments snapshot counters and preserves the latest recorded event", () => {
  const previous = {
    completedSessionCount: 2,
    falseEntryCount: 1,
    noExitTimeoutCount: 3,
    mq135: "Clear",
    mq136: "Clear",
  };

  const snapshot = buildDeviceSensorSnapshot(
    {
      deviceId: "ESP32-CAM-TEST",
      configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
      recordedEvents: [
        {
          eventId: "visit-1",
          status: "NORMAL",
          durationSecs: 150,
          endedAt: "2026-05-26T01:00:00.000Z",
          rfidCard: "00967D97",
          rfidHex: "0200967D9703",
          mq135Delta: 0,
          mq136Delta: 0,
        },
      ],
      ignoredEvents: [
        {
          reason: "status_not_countable",
          status: "FALSE_ENTRY_IGNORED",
          eventId: "false-entry-1",
        },
      ],
      previous,
      now: new Date("2026-05-26T02:00:00.000Z"),
    },
  );

  assert.equal(snapshot.deviceId, "ESP32-CAM-TEST");
  assert.equal(snapshot.configToken, "cfg_abcdefghijklmnopqrstuvwxyz");
  assert.equal(snapshot.completedSessionCount, 3);
  assert.equal(snapshot.falseEntryCount, 2);
  assert.equal(snapshot.noExitTimeoutCount, 3);
  assert.equal(snapshot.rfidCard, "00967D97");
  assert.equal(snapshot.lastSessionStatus, "NORMAL");
  assert.equal(snapshot.lastSessionDurationMs, 150000);
  assert.equal(snapshot.updatedAt, "2026-05-26T02:00:00.000Z");
});

test("stores live MQ sensor readings from a sync request", () => {
  const snapshot = buildDeviceSensorSnapshot({
    deviceId: "ESP32-CAM-TEST",
    configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
    recordedEvents: [],
    ignoredEvents: [],
    liveSensors: {
      mq135: "Gas Detected",
      mq136: "Gas Detected",
      mq135Raw: "0",
      mq136Raw: 0,
    },
    previous: {
      mq135: "Clear",
      mq136: "Clear",
      mq135Raw: 1,
      mq136Raw: 1,
    },
    now: new Date("2026-05-26T02:00:00.000Z"),
  });

  assert.equal(snapshot.mq135, "Gas Detected");
  assert.equal(snapshot.mq136, "Gas Detected");
  assert.equal(snapshot.mq135Raw, 0);
  assert.equal(snapshot.mq136Raw, 0);
});

test("maps a fresh stored snapshot into the sensor API response shape", () => {
  const response = toDeviceSensorsResponse(
    {
      online: true,
      mq135: "Clear",
      mq136: "Clear",
      mq135Raw: 1,
      mq136Raw: 1,
      currentSessionStatus: "IDLE",
      lastSessionStatus: "NONE",
      updatedAt: "2026-05-26T02:00:00.000Z",
    },
    { now: new Date("2026-05-26T02:00:10.000Z") },
  );

  assert.equal(response.online, true);
  assert.equal(response.mq135, "Clear");
  assert.equal(response.mq136, "Clear");
  assert.equal(response.currentSessionStatus, "IDLE");
  assert.equal(response.lastSessionStatus, "NONE");
  assert.equal(response.updatedAt, "2026-05-26T02:00:00.000Z");
});

test("marks stored snapshot offline when the snapshot is stale", () => {
  const response = toDeviceSensorsResponse(
    {
      online: true,
      mq135: "Clear",
      mq136: "Clear",
      updatedAt: "2026-05-26T02:00:00.000Z",
    },
    {
      now: new Date("2026-05-26T02:01:00.000Z"),
      staleAfterMs: 30000,
    },
  );

  assert.equal(response.online, false);
  assert.equal(response.mq135, "Clear");
  assert.equal(response.mq136, "Clear");
  assert.equal(response.updatedAt, "2026-05-26T02:00:00.000Z");
});

test("can force a fresh stored snapshot offline after a failed live poll", () => {
  const response = toDeviceSensorsResponse(
    {
      online: true,
      mq135: "Clear",
      mq136: "Clear",
      updatedAt: "2026-05-26T02:00:00.000Z",
    },
    {
      now: new Date("2026-05-26T02:00:10.000Z"),
      forceOffline: true,
    },
  );

  assert.equal(response.online, false);
  assert.equal(response.updatedAt, "2026-05-26T02:00:00.000Z");
});
