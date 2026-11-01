import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("Live keeps the camera viewer available without claiming a device connection", () => {
  assert.match(source, /RemoteCamera as LiveView/);
  assert.match(source, /<LiveView onStreamStateChange=\{onStreamStateChange\} \/>/);
  assert.doesNotMatch(source, /deviceConnected|DeviceGate|No Device Connected|Connect Device/);
});

test("Viewer Status reports only the stream state supplied by RemoteCamera", () => {
  assert.match(source, />\s*Viewer Status\s*</);
  assert.match(source, /liveStreamState === "connected"[\s\S]*"Stream connected"/);
  assert.match(source, /liveStreamState === "error"[\s\S]*"Stream unavailable"/);
  assert.match(source, /"Connecting to stream"/);
  assert.doesNotMatch(source, />\s*Device Status\s*</);
  assert.doesNotMatch(source, />\s*Disconnect\s*</);
});
