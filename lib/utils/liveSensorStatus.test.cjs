const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getLiveAirQualityStatus,
  getLiveRfidStatus,
} = require("./liveSensorStatus.ts");

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
    status: "abnormal",
    label: "No data",
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
    status: "abnormal",
    label: "No data",
  });
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
