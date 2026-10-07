const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function loadComponent() {
  const source = readFileSync(
    path.join(__dirname, "ServerManagedAdminAccess.tsx"),
    "utf8",
  );
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
        return { ShieldCheck: (props) => React.createElement("svg", props) };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports.ServerManagedAdminAccess;
}

test("admin access page exposes instructions without client grant or revoke controls", () => {
  const ServerManagedAdminAccess = loadComponent();
  const html = renderToStaticMarkup(React.createElement(ServerManagedAdminAccess));

  assert.match(html, /Admin access is managed on the server/);
  assert.match(html, /npm run admin:grant -- admin@example.com/);
  assert.match(html, /npm run admin:revoke -- admin@example.com/);
  assert.doesNotMatch(html, /<(form|input|button)\b/);
});
