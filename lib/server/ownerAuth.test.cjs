const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadOwnerAuth(verifyIdToken) {
  const source = readFileSync(path.join(__dirname, "ownerAuth.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Request,
    Response,
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") {
        return { getAdminAuth: () => ({ verifyIdToken }) };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("owner authorization returns 401 for missing and invalid bearer tokens", async () => {
  const helper = loadOwnerAuth(async () => { throw new Error("invalid"); });

  const missing = await helper.authorizeOwnerRequest(new Request("https://app.example.com"));
  const invalid = await helper.authorizeOwnerRequest(new Request("https://app.example.com", {
    headers: { Authorization: "Bearer invalid-token" },
  }));

  assert.equal(missing.ok, false);
  assert.equal(missing.response.status, 401);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.response.status, 401);
});

test("owner authorization verifies revocation and returns token identity", async () => {
  const calls = [];
  const helper = loadOwnerAuth(async (token, checkRevoked) => {
    calls.push([token, checkRevoked]);
    return { uid: "owner-1", email: "owner@example.com" };
  });

  const result = await helper.authorizeOwnerRequest(new Request("https://app.example.com", {
    headers: { Authorization: "Bearer owner-token" },
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.owner)), {
    uid: "owner-1",
    email: "owner@example.com",
  });
  assert.deepEqual(calls, [["owner-token", true]]);
});
