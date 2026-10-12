const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadComponent() {
  const source = readFileSync(path.join(__dirname, "AccountDeletionRow.tsx"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require,
  });
  return sandboxModule.exports.AccountDeletionRow;
}

test("pending deletion renders a disabled Request pending button", () => {
  const AccountDeletionRow = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AccountDeletionRow, {
    status: "pending",
    requestedAt: new Date("2026-10-07T08:00:00.000Z"),
    isLoading: false,
    isSubmitting: false,
    onRequest: () => {},
  }));

  assert.match(html, /Request pending/);
  assert.match(html, /<button[^>]*disabled=""/);
  assert.match(html, /continue using the app/i);
  assert.doesNotMatch(html, />Request Account Deletion</);
});

test("no deletion request renders the enabled request action", () => {
  const AccountDeletionRow = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AccountDeletionRow, {
    status: "none",
    requestedAt: null,
    isLoading: false,
    isSubmitting: false,
    onRequest: () => {},
  }));

  assert.match(html, />Request Account Deletion</);
  assert.doesNotMatch(html, /disabled=""/);
});

test("failed deletion warns that cleanup may be partial and stays disabled", () => {
  const AccountDeletionRow = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AccountDeletionRow, {
    status: "failed",
    requestedAt: new Date("2026-10-07T08:00:00.000Z"),
    isLoading: false,
    isSubmitting: false,
    onRequest: () => {},
  }));

  assert.match(html, /did not complete/i);
  assert.match(html, /some account data may already have been removed/i);
  assert.match(html, /<button[^>]*disabled=""/);
  assert.doesNotMatch(html, /account and data are still available/i);
});
