const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadComponent() {
  const source = readFileSync(path.join(__dirname, "AuditLogList.tsx"), "utf8");
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
        return { ScrollText: (props) => React.createElement("svg", props) };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports.AuditLogList;
}

test("audit list shows traceable actor, target, action, and time without edit controls", () => {
  const AuditLogList = loadComponent();
  const html = renderToStaticMarkup(React.createElement(AuditLogList, {
    entries: [{
      id: "audit-1",
      action: "deletion_rejected",
      actorUid: "admin-1",
      actorEmail: "admin@example.com",
      targetUid: "owner-1",
      targetEmail: "owner@example.com",
      details: { result: "returned_to_normal" },
      createdAt: "2026-10-07T01:02:03.000Z",
    }],
    isLoading: false,
  }));

  assert.match(html, /Deletion rejected/);
  assert.match(html, /admin@example.com/);
  assert.match(html, /owner@example.com/);
  assert.match(html, /Oct 7, 2026/);
  assert.doesNotMatch(html, /<(button|input|form|textarea)\b/);
});
