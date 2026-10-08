const assert = require("node:assert/strict");
const test = require("node:test");
const { fetchGasUltrasonic, toGasUltrasonicResponse } = require("./gasUltrasonic.ts");
const { useAirQualityReadings } = require("../hooks/useAirQualityReadings.ts");
const { getLiveAirQualityStatus, getLiveRfidStatus } = require("./liveSensorStatus.ts");

test("gas idle heartbeat stays fresh for one-minute upload plus thirty seconds of grace", () => {
  const now = Date.parse("2026-10-01T00:03:00Z");
  const response = (age) => toGasUltrasonicResponse({ mq135Raw: 1, mq136Raw: 1, distanceCm: 37, updatedAt: new Date(now - age).toISOString() }, now);
  assert.equal(response(60000).gasUltrasonicOnline, true);
  assert.equal(response(90000).gasUltrasonicOnline, true);
  assert.equal(response(90001).gasUltrasonicOnline, false);
  assert.equal(response(-1).gasUltrasonicOnline, false);
});

test("separate gas board validates readings and fails offline independently of RFID", async (t) => {
  let payload = { mq135Raw: 0, mq136Raw: 1, distanceCm: 57.3 };
  let fail = false;
  t.mock.method(global, "fetch", async () => {
    if (fail) throw new Error("offline");
    return Response.json(payload);
  });
  const live = await fetchGasUltrasonic("http://example.test/sensors");
  assert.equal(live.mq135, "Gas Detected");
  assert.equal(live.mq136, "Clear");
  assert.equal(live.distanceCm, 57.3);
  assert.equal(live.gasUltrasonicOnline, true);
  assert.equal(useAirQualityReadings({ online: false, ...live }).ammonia.displayValue, "Detected");
  payload.distanceCm = null;
  assert.equal((await fetchGasUltrasonic("http://example.test/sensors")).gasUltrasonicOnline, true);
  payload.distanceCm = -1;
  assert.equal((await fetchGasUltrasonic("http://example.test/sensors")).gasUltrasonicOnline, false);
  payload = {};
  assert.equal((await fetchGasUltrasonic("http://example.test/sensors")).gasUltrasonicOnline, false);
  fail = true;
  const offline = await fetchGasUltrasonic("http://example.test/sensors");
  assert.equal(offline.distanceCm, null);
  const sensorData = { online: true, ...offline };
  assert.equal(useAirQualityReadings(sensorData).ammonia.displayValue, "Offline");
  const input = { sensorData, sensorsLoading: false, sensorsError: null };
  assert.equal(getLiveAirQualityStatus(input).value, "Offline");
  assert.equal(getLiveRfidStatus(input).value, "Online · Idle");
});
