const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule() {
  const source = readFileSync(path.join(__dirname, "adminApi.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Headers,
    window: { location: { replace() {} } },
    require: (name) => {
      if (name === "@/lib/configs/firebase") return { auth: { currentUser: null } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("runAdminRequest attaches the current ID token and preserves request options", async () => {
  const { runAdminRequest } = loadModule();
  const tokenCalls = [];
  let captured;
  const expectedResponse = new Response(null, { status: 204 });

  const response = await runAdminRequest(
    {
      getIdToken: async (forceRefresh) => {
        tokenCalls.push(forceRefresh);
        return "admin-token";
      },
    },
    "/api/admin/example",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    {
      fetcher: async (input, init) => {
        captured = { input, init };
        return expectedResponse;
      },
      leaveAdmin: () => assert.fail("successful requests must not navigate"),
    },
  );

  assert.equal(response, expectedResponse);
  assert.deepEqual(tokenCalls, [undefined]);
  assert.equal(captured.input, "/api/admin/example");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.body, "{}");
  assert.equal(new Headers(captured.init.headers).get("authorization"), "Bearer admin-token");
  assert.equal(new Headers(captured.init.headers).get("content-type"), "application/json");
});

for (const status of [401, 403]) {
  test(`runAdminRequest refreshes the token and leaves admin UI after ${status}`, async () => {
    const { runAdminRequest } = loadModule();
    const tokenCalls = [];
    const destinations = [];

    const response = await runAdminRequest(
      {
        getIdToken: async (forceRefresh) => {
          tokenCalls.push(forceRefresh);
          return forceRefresh ? "refreshed-token" : "stale-token";
        },
      },
      "/api/admin/example",
      {},
      {
        fetcher: async () => Response.json({ error: "Denied" }, { status }),
        leaveAdmin: (destination) => destinations.push(destination),
      },
    );

    assert.equal(response.status, status);
    assert.deepEqual(tokenCalls, [undefined, true]);
    assert.deepEqual(destinations, ["/dashboard"]);
  });
}

test("runAdminRequest still leaves admin UI when forced refresh fails", async () => {
  const { runAdminRequest } = loadModule();
  const destinations = [];

  await runAdminRequest(
    {
      getIdToken: async (forceRefresh) => {
        if (forceRefresh) throw new Error("revoked");
        return "revoked-token";
      },
    },
    "/api/admin/example",
    {},
    {
      fetcher: async () => new Response(null, { status: 401 }),
      leaveAdmin: (destination) => destinations.push(destination),
    },
  );

  assert.deepEqual(destinations, ["/dashboard"]);
});
