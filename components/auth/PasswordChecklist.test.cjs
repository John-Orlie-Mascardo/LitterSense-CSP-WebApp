const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

function compileModule(file, imports = {}) {
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => imports[name] ?? require(name),
  });
  return sandboxModule.exports;
}

const policy = compileModule(
  path.join(__dirname, "..", "..", "lib", "utils", "passwordPolicy.ts"),
);
const { PasswordChecklist } = compileModule(
  path.join(__dirname, "PasswordChecklist.tsx"),
  { "@/lib/utils/passwordPolicy": policy },
);

test("renders all password rules and marks only satisfied rules", () => {
  const html = renderToStaticMarkup(
    React.createElement(PasswordChecklist, { password: "lowercase" }),
  );

  assert.match(html, /aria-label="Password requirements"/);
  assert.equal((html.match(/data-password-rule=/g) ?? []).length, 6);
  assert.match(html, /data-password-rule="maximumLength" data-met="true"/);
  assert.match(html, /data-password-rule="lowercase" data-met="true"/);
  assert.match(html, /data-password-rule="uppercase" data-met="false"/);
  assert.match(html, /data-password-rule="number" data-met="false"/);
  assert.match(html, /data-password-rule="special" data-met="false"/);
});

test("ticks every rule for a policy-compliant password", () => {
  const html = renderToStaticMarkup(
    React.createElement(PasswordChecklist, { password: "Strong1!" }),
  );

  assert.equal((html.match(/data-met="true"/g) ?? []).length, 6);
  assert.equal((html.match(/ not met/g) ?? []).length, 0);
  assert.match(html, /At least 8 characters/);
  assert.match(html, /At most 128 characters/);
  assert.match(html, /One uppercase letter/);
  assert.match(html, /One lowercase letter/);
  assert.match(html, /One number/);
  assert.match(html, /One special character/);
});
