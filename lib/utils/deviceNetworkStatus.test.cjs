const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getDeviceNetworkSummary,
} = require("./deviceNetworkStatus.ts");

test("shows live connected SSID before saved provisioning SSID", () => {
  assert.equal(
    getDeviceNetworkSummary({
      isLoading: false,
      configuredSsid: "Austria",
      connectedSsid: "AUSTRIAWIFI",
    }),
    "Connected: AUSTRIAWIFI",
  );
});

test("labels saved SSID as configured when live SSID is unavailable", () => {
  assert.equal(
    getDeviceNetworkSummary({
      isLoading: false,
      configuredSsid: "Austria",
      connectedSsid: "",
    }),
    "Configured: Austria",
  );
});

test("keeps the loading message while provisioning config is loading", () => {
  assert.equal(
    getDeviceNetworkSummary({
      isLoading: true,
      configuredSsid: "Austria",
      connectedSsid: "AUSTRIAWIFI",
    }),
    "Loading device setup...",
  );
});

test("prompts setup when neither saved nor live network is available", () => {
  assert.equal(
    getDeviceNetworkSummary({
      isLoading: false,
      configuredSsid: "   ",
      connectedSsid: "   ",
    }),
    "Set owner Wi-Fi and setup URL",
  );
});
