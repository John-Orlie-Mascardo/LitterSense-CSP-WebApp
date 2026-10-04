const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getLiveAirQualityStatus,
  getLiveRfidStatus,
  getLiveUltrasonicStatus,
} = require("./liveSensorStatus.ts");

test("distinguishes stale heartbeats and unknown cloud data independently", () => {
  const input = { sensorsLoading: false, sensorsError: null, sensorData: { online: false, gasUltrasonicOnline: true, rfidState: "stale", gasUltrasonicState: "online", rfidUpdatedAt: "2026-10-04T11:50:00Z", mq135: "Clear", mq136: "Clear", distanceCm: 12 } };
  assert.equal(getLiveRfidStatus(input).value, "Stale");
  assert.equal(getLiveRfidStatus(input).label, "No recent heartbeat");
  assert.equal(getLiveRfidStatus(input).lastUpdatedAt, input.sensorData.rfidUpdatedAt);
  assert.equal(getLiveAirQualityStatus(input).value, "Normal");
  assert.equal(getLiveUltrasonicStatus(input).value, "12.0 cm");
  input.sensorData.gasUltrasonicState = "unknown";
  assert.equal(getLiveAirQualityStatus(input).value, "Status unavailable");
  assert.equal(getLiveUltrasonicStatus(input).value, "Status unavailable");
});

test("marks MQ sensors offline when the stored sensor payload is not online", () => {
  const status = getLiveAirQualityStatus({
    sensorData: {
      online: false,
      mq135: "Clear",
      mq136: "Clear",
      mq135Raw: null,
      mq136Raw: null,
    },
    sensorsLoading: false,
    sensorsError: null,
  });

  assert.deepEqual(status, {
    value: "Offline",
    status: "offline",
    label: "Offline",
  });
});

test("marks RFID offline when the stored sensor payload is not online", () => {
  const status = getLiveRfidStatus({
    sensorData: {
      online: false,
      rfidEvent: "SHORT_SESSION",
      lastSessionStatus: "SHORT_SESSION",
    },
    sensorsLoading: false,
    sensorsError: null,
  });

  assert.deepEqual(status, {
    value: "Offline",
    status: "offline",
    label: "Offline",
  });
});

test("online RFID reports current idle or occupied state, never an old event", () => {
  const input = { sensorData: { online: true, sessionActive: false, rfidEvent: "ENTER" }, sensorsLoading: false, sensorsError: null };
  assert.equal(getLiveRfidStatus(input).value, "Online · Idle");
  input.sensorData.sessionActive = true;
  assert.equal(getLiveRfidStatus(input).value, "Online · In use");
  assert.equal(getLiveRfidStatus(input).label, "Occupied");
  input.sensorData.online = false;
  assert.equal(getLiveRfidStatus(input).value, "Offline");
});

test("cloud and browser errors hide retained online readings without declaring hardware offline", () => {
  const input = { sensorData: { online: true, sessionActive: true, gasUltrasonicOnline: true, distanceCm: 24, mq135: "Clear", mq136: "Clear" }, sensorsLoading: false, sensorsError: "Unable to read device state" };
  for (const resolve of [getLiveRfidStatus, getLiveAirQualityStatus, getLiveUltrasonicStatus]) {
    assert.deepEqual(resolve(input), { value: "Unavailable", status: "watch", label: "Cloud error" });
    assert.equal(resolve({ ...input, sensorsError: "Failed to fetch" }).label, "Connection error");
    assert.equal(resolve({ ...input, sensorsError: "Unauthorized" }).label, "Sign in again");
    assert.notEqual(resolve({ ...input, sensorsError: null }).value, "Unavailable");
  }
});

test("ultrasonic no echo remains distinct from offline and first load is connecting", () => {
  const input = { sensorData: { online: false, gasUltrasonicOnline: true, distanceCm: null }, sensorsLoading: false, sensorsError: null };
  assert.deepEqual(getLiveUltrasonicStatus(input), { value: "No echo", status: "watch", label: "Online" });
  assert.equal(getLiveUltrasonicStatus({ ...input, sensorData: { ...input.sensorData, distanceCm: 24 } }).value, "24.0 cm");
  assert.equal(getLiveUltrasonicStatus({ ...input, sensorData: { ...input.sensorData, gasUltrasonicOnline: false, distanceCm: 24 } }).value, "Offline");
  for (const resolve of [getLiveRfidStatus, getLiveAirQualityStatus, getLiveUltrasonicStatus]) {
    assert.deepEqual(resolve({ ...input, sensorsLoading: true }), { value: "Syncing", status: "normal", label: "Connecting" });
  }
});

test("keeps live sensors normal when the device is online and clear", () => {
  const status = getLiveAirQualityStatus({
    sensorData: {
      online: true,
      mq135: "Clear",
      mq136: "Clear",
      mq135Raw: 1,
      mq136Raw: 1,
    },
    sensorsLoading: false,
    sensorsError: null,
  });

  assert.deepEqual(status, {
    value: "Normal",
    status: "normal",
    label: "Normal",
  });
});
