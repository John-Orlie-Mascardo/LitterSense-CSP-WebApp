const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadAdminAuth(verifyIdToken) {
  const source = readFileSync(path.join(__dirname, "adminAuth.ts"), "utf8");
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

test("admin authorization returns 401 when the bearer token is missing or invalid", async () => {
  const calls = [];
  const helper = loadAdminAuth(async (...args) => {
    calls.push(args);
    throw new Error("invalid token");
  });

  const missing = await helper.authorizeAdminRequest(
    new Request("https://app.example.com/api/admin/action"),
  );
  assert.equal(missing.ok, false);
  assert.equal(missing.response.status, 401);

  const invalid = await helper.authorizeAdminRequest(
    new Request("https://app.example.com/api/admin/action", {
      headers: { Authorization: "Bearer invalid" },
    }),
  );
  assert.equal(invalid.ok, false);
  assert.equal(invalid.response.status, 401);
  assert.deepEqual(calls, [["invalid", true]]);
});

test("admin authorization returns 403 for a valid non-admin token", async () => {
  const helper = loadAdminAuth(async () => ({
    uid: "owner-1",
    email: "owner@example.com",
  }));

  const result = await helper.authorizeAdminRequest(
    new Request("https://app.example.com/api/admin/action", {
      headers: { Authorization: "Bearer owner-token" },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test("admin authorization verifies revocation and returns the claimed admin identity", async () => {
  const calls = [];
  const helper = loadAdminAuth(async (...args) => {
    calls.push(args);
    return { uid: "admin-1", email: "admin@example.com", admin: true };
  });

  const result = await helper.authorizeAdminRequest(
    new Request("https://app.example.com/api/admin/action", {
      headers: { Authorization: "Bearer admin-token" },
    }),
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [["admin-token", true]]);
  assert.deepEqual({ ...result.admin }, {
    uid: "admin-1",
    email: "admin@example.com",
  });
});
