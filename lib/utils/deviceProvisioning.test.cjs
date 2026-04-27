const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDeviceProvisioningBody,
  getHardwareConfigUrl,
} = require("./deviceProvisioning.ts");

test("omits localhost config URLs from hardware provisioning bodies", () => {
  const body = buildDeviceProvisioningBody({
    wifiSsid: " Home WiFi ",
    wifiPassword: " littersense-pass ",
    configUrl: "http://localhost:3000/api/device-config/cfg_abc1234567890",
  });

  assert.equal(body.get("ssid"), "Home WiFi");
  assert.equal(body.get("password"), "littersense-pass");
  assert.equal(body.has("configUrl"), false);
});

test("omits 127.0.0.1 config URLs from hardware provisioning bodies", () => {
  assert.equal(
    getHardwareConfigUrl("http://127.0.0.1:3000/api/device-config/cfg_abc1234567890"),
    "",
  );
});

test("includes LAN or deployed config URLs in hardware provisioning bodies", () => {
  const body = buildDeviceProvisioningBody({
    wifiSsid: "Owner WiFi",
    wifiPassword: "owner-password",
    configUrl: "http://192.168.68.10:3000/api/device-config/cfg_abc1234567890",
  });

  assert.equal(
    body.get("configUrl"),
    "http://192.168.68.10:3000/api/device-config/cfg_abc1234567890",
  );
});

test("omits invalid config URLs from hardware provisioning bodies", () => {
  const body = buildDeviceProvisioningBody({
    wifiSsid: "Owner WiFi",
    wifiPassword: "owner-password",
    configUrl: "not a url",
  });

  assert.equal(body.has("configUrl"), false);
});
