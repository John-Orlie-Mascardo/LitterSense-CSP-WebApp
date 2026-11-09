const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadComponent() {
  const source = readFileSync(path.join(__dirname, "AuthLoadingScreen.tsx"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, { module: sandboxModule, exports: sandboxModule.exports, require });
  return sandboxModule.exports.AuthLoadingScreen;
}

test("the sign-in loading screen is unchanged by default", () => {
  const AuthLoadingScreen = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AuthLoadingScreen));
  assert.match(html, /Signing you in…/);
  assert.match(html, /min-h-screen/);
  assert.doesNotMatch(html, /fixed inset-0/);
});

test("an overlay with its own message covers the page and announces the work in progress", () => {
  const AuthLoadingScreen = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AuthLoadingScreen, {
    overlay: true,
    message: "Deleting your account…",
    detail: "This can take a few seconds. Please don't close this page.",
  }));
  assert.match(html, /role="status"/);
  assert.match(html, /fixed inset-0/);
  assert.match(html, /Deleting your account…/);
  assert.match(html, /Please don(&#x27;|')t close this page\./);
  assert.doesNotMatch(html, /Signing you in/);
});
