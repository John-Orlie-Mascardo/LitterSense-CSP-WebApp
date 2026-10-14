const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");
function load() {
  const source = readFileSync(path.join(__dirname, "adminLoginAccess.ts"), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require });
  return exports;
}
test("admin login requires a refreshed boolean admin claim", async () => {
  const { requireAdminLogin } = load();
  for (const claim of [false, undefined, "true", 1]) {
    let signedOut = false;
    await assert.rejects(requireAdminLogin({ getIdTokenResult: async force => { assert.equal(force, true); return { claims: { admin: claim } }; } }, async () => { signedOut = true; }), error => error.code === "auth/admin-required");
    assert.equal(signedOut, true);
  }
  let signedOut = false;
  await requireAdminLogin({ getIdTokenResult: async force => { assert.equal(force, true); return { claims: { admin: true } }; } }, async () => { signedOut = true; });
  assert.equal(signedOut, false);
});
test("failed claim verification signs out instead of retaining an unverified session", async () => {
  const { requireAdminLogin } = load();
  let signedOut = false;
  await assert.rejects(requireAdminLogin({ getIdTokenResult: async () => { throw new Error("verification unavailable"); } }, async () => { signedOut = true; }), /verification unavailable/);
  assert.equal(signedOut, true);
});
