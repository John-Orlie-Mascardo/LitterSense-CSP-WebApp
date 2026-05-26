const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("PWA install prompt is captured from the root app lifecycle", () => {
  const rootLayout = fs.readFileSync("app/layout.tsx", "utf8");
  const hook = fs.readFileSync("lib/hooks/usePWAInstall.ts", "utf8");

  assert.match(rootLayout, /PWAInstallProvider/);
  assert.match(rootLayout, /<PWAInstallProvider>\s*\{children\}\s*<\/PWAInstallProvider>/s);
  assert.match(hook, /PWAInstallContext/);
  assert.doesNotMatch(hook, /addEventListener\("beforeinstallprompt"/);
});
