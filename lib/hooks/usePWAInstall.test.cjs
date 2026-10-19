const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

test("PWA install prompt is captured from the root app lifecycle", () => {
  const rootLayout = fs.readFileSync("app/layout.tsx", "utf8");
  const hook = fs.readFileSync("lib/hooks/usePWAInstall.ts", "utf8");

  const api = {};
  vm.runInNewContext(ts.transpileModule(rootLayout, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: api,
    require: name => name === 'react/jsx-runtime' ? require(name) : new Proxy({}, { get: (_target, key) => key }),
  });
  const walk = (element, ancestors = []) => {
    if (element?.type === 'SettingsProvider') {
      assert.ok(ancestors.includes('PWAInstallProvider'), 'Account changes must not discard the one-shot browser install prompt');
      return true;
    }
    return [element?.props?.children].flat().some(child => child && walk(child, [...ancestors, element.type]));
  };
  assert.ok(walk(api.default({ children: null })), 'Root settings provider must be checked in the rendered composition');
  assert.match(hook, /PWAInstallContext/);
  assert.doesNotMatch(hook, /addEventListener\("beforeinstallprompt"/);
});
