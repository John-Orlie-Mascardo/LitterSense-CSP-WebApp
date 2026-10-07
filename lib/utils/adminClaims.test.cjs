const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule() {
  const source = readFileSync(path.join(__dirname, "adminClaims.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => {
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("resolveAdminClaim grants access only for the boolean admin claim", async () => {
  const { resolveAdminClaim } = loadModule();

  for (const [claim, expected] of [
    [true, true],
    [false, false],
    ["true", false],
    [undefined, false],
  ]) {
    const user = {
      getIdTokenResult: async () => ({ claims: { admin: claim } }),
    };
    assert.equal(await resolveAdminClaim(user), expected);
  }
});

test("resolveAdminClaim forwards forced-refresh intent to Firebase", async () => {
  const { resolveAdminClaim } = loadModule();
  const calls = [];
  const user = {
    getIdTokenResult: async (forceRefresh) => {
      calls.push(forceRefresh);
      return { claims: { admin: true } };
    },
  };

  assert.equal(await resolveAdminClaim(user, true), true);
  assert.deepEqual(calls, [true]);
});
