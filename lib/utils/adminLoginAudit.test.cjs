const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule() {
  const source = readFileSync(path.join(__dirname, "adminLoginAudit.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => {
      if (name === "@/lib/utils/adminApi") {
        return { adminApiFetch: async () => assert.fail("inject the request in tests") };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("recordAdminLogin does not call the server for a non-admin sign-in", async () => {
  const { recordAdminLogin } = loadModule();
  let requests = 0;

  const recorded = await recordAdminLogin(
    { getIdTokenResult: async () => ({ claims: {} }) },
    "password",
    async () => {
      requests += 1;
      return Response.json({ success: true });
    },
  );

  assert.equal(recorded, false);
  assert.equal(requests, 0);
});

test("recordAdminLogin sends the sign-in method after a real admin sign-in", async () => {
  const { recordAdminLogin } = loadModule();
  let captured;

  const recorded = await recordAdminLogin(
    { getIdTokenResult: async () => ({ claims: { admin: true } }) },
    "google",
    async (input, init) => {
      captured = { input, init };
      return Response.json({ success: true });
    },
  );

  assert.equal(recorded, true);
  assert.equal(captured.input, "/api/admin/login");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(JSON.parse(captured.init.body), { method: "google" });
});

test("recordAdminLogin reports a rejected audit write", async () => {
  const { recordAdminLogin } = loadModule();

  await assert.rejects(
    recordAdminLogin(
      { getIdTokenResult: async () => ({ claims: { admin: true } }) },
      "password",
      async () => Response.json({ error: "Unavailable" }, { status: 503 }),
    ),
    /record administrator sign-in/i,
  );
});
