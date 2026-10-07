const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadComponent() {
  const source = readFileSync(path.join(__dirname, "DeletionQueue.tsx"), "utf8");
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
    require: (name) => {
      if (name === "react/jsx-runtime") return require(name);
      if (name === "lucide-react") {
        return new Proxy({}, { get: () => (props) => React.createElement("svg", props) });
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports.DeletionQueue;
}

const pending = {
  id: "owner-1",
  userId: "owner-1",
  userName: "Owner One",
  userEmail: "owner@example.com",
  requestedDate: "2026-10-06T09:00:00.000Z",
  status: "pending",
};

test("pending queue item shows requester, submission date, approve, and reject", () => {
  const DeletionQueue = loadComponent();
  const html = renderToStaticMarkup(React.createElement(DeletionQueue, {
    requests: [pending],
    isLoading: false,
    busyUserId: null,
    onApprove: () => {},
    onReject: () => {},
  }));

  assert.match(html, /Owner One/);
  assert.match(html, /owner@example.com/);
  assert.match(html, /Oct 6, 2026/);
  assert.match(html, />Approve</);
  assert.match(html, />Reject</);
});

test("failed queue item shows its failure and a retry action", () => {
  const DeletionQueue = loadComponent();
  const html = renderToStaticMarkup(React.createElement(DeletionQueue, {
    requests: [{ ...pending, status: "failed", error: "Storage files could not be removed" }],
    isLoading: false,
    busyUserId: null,
    onApprove: () => {},
    onReject: () => {},
  }));

  assert.match(html, /Deletion failed/);
  assert.match(html, /Storage files could not be removed/);
  assert.match(html, />Retry deletion</);
  assert.doesNotMatch(html, />Reject</);
});

test("processing queue item disables another destructive action", () => {
  const DeletionQueue = loadComponent();
  const html = renderToStaticMarkup(React.createElement(DeletionQueue, {
    requests: [{ ...pending, status: "processing" }],
    isLoading: false,
    busyUserId: "owner-1",
    onApprove: () => {},
    onReject: () => {},
  }));

  assert.match(html, /Deletion in progress/);
  assert.doesNotMatch(html, />Approve|>Reject|>Retry deletion/);
});
