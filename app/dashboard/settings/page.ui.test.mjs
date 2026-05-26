import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing marker: ${endMarker}`);

  return source.slice(start, end);
}

test("device network settings open Wi-Fi provisioning from a row", () => {
  const section = sourceBetween(
    "{/* Device Network Section */}",
    "{/* Data & Privacy Section */}",
  );

  assert.match(section, /setShowWifiProvisioning\(true\)/);
  assert.doesNotMatch(section, /id="wifiSsid"/);
  assert.doesNotMatch(section, /id="wifiPassword"/);
  assert.doesNotMatch(section, /handleSendDeviceProvisioningToHardware/);
});

test("device network settings appear before notification settings", () => {
  assert.ok(
    source.indexOf("{/* Device Network Section */}") <
      source.indexOf("{/* Notifications Section */}"),
  );
});

test("Wi-Fi provisioning form lives inside a dedicated bottom sheet", () => {
  const sheet = sourceBetween(
    "{/* Wi-Fi Provisioning Bottom Sheet */}",
    "{/* Privacy Policy Bottom Sheet */}",
  );

  assert.match(sheet, /isOpen=\{showWifiProvisioning\}/);
  assert.match(sheet, /title="ESP32 Wi-Fi Setup"/);
  assert.match(sheet, /id="wifiSsid"/);
  assert.match(sheet, /id="wifiPassword"/);
  assert.match(sheet, /handleSendDeviceProvisioningToHardware/);
});

test("Wi-Fi setup instructions explain the setup network fallback", () => {
  const sheet = sourceBetween(
    "{/* Wi-Fi Provisioning Bottom Sheet */}",
    "{/* Privacy Policy Bottom Sheet */}",
  );

  assert.match(sheet, /LitterSense-Setup/);
  assert.match(sheet, /littersense/);
  assert.match(sheet, /No Internet/);
  assert.match(sheet, /http:\/\/192\.168\.4\.1/);
});
