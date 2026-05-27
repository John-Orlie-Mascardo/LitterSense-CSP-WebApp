const assert = require("node:assert/strict");
const test = require("node:test");

const {
  useAirQualityReadings,
} = require("./useAirQualityReadings.ts");

test("maps live MQ gas detection into alert readings", () => {
  const readings = useAirQualityReadings(
    {
      online: true,
      mq135: "GAS DETECTED",
      mq136: "GAS DETECTED",
      mq135Raw: 0,
      mq136Raw: 0,
    },
    false,
    null,
  );

  assert.equal(readings.ammonia.displayValue, "Detected");
  assert.equal(readings.ammonia.status, "alert");
  assert.equal(readings.h2s.displayValue, "Detected");
  assert.equal(readings.h2s.status, "alert");
});

test("maps clear online MQ sensors into normal readings", () => {
  const readings = useAirQualityReadings(
    {
      online: true,
      mq135: "Clear",
      mq136: "Clear",
      mq135Raw: 1,
      mq136Raw: 1,
    },
    false,
    null,
  );

  assert.equal(readings.ammonia.displayValue, "Clear");
  assert.equal(readings.ammonia.status, "normal");
  assert.equal(readings.h2s.displayValue, "Clear");
  assert.equal(readings.h2s.status, "normal");
});
