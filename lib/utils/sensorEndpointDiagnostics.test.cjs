const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classifySensorProxyUrl,
  shouldSkipServerSensorProxy,
} = require("./sensorEndpointDiagnostics.ts");

test("classifies private LAN ESP32 URLs", () => {
  assert.equal(
    classifySensorProxyUrl("http://192.168.68.116/sensors"),
    "private-lan",
  );
  assert.equal(classifySensorProxyUrl("http://10.0.0.25/sensors"), "private-lan");
  assert.equal(classifySensorProxyUrl("http://172.20.0.25/sensors"), "private-lan");
});

test("classifies loopback sensor URLs", () => {
  assert.equal(classifySensorProxyUrl("http://localhost:3000/sensors"), "loopback");
  assert.equal(classifySensorProxyUrl("http://127.0.0.1:3000/sensors"), "loopback");
});

test("classifies public and invalid sensor URLs", () => {
  assert.equal(classifySensorProxyUrl("https://example.com/sensors"), "public");
  assert.equal(classifySensorProxyUrl("not a url"), "invalid");
  assert.equal(classifySensorProxyUrl(""), "empty");
});

test("skips LAN polling only from Vercel-like server runtimes", () => {
  assert.equal(
    shouldSkipServerSensorProxy("http://192.168.68.116/sensors", true),
    true,
  );
  assert.equal(
    shouldSkipServerSensorProxy("http://192.168.68.116/sensors", false),
    false,
  );
  assert.equal(
    shouldSkipServerSensorProxy("https://example.com/sensors", true),
    false,
  );
});
