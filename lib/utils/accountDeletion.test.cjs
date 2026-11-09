const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule() {
  const source = readFileSync(path.join(__dirname, "accountDeletion.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Request,
    Response,
    require: (name) => { throw new Error(`Unexpected import ${name}`); },
  });
  return sandboxModule.exports;
}

test("requestAccountDeletion sends the owner token and selected reason", async () => {
  const helper = loadModule();
  const tokenCalls = [];
  let captured;

  const result = await helper.requestAccountDeletion(
    { getIdToken: async () => { tokenCalls.push(true); return "owner-token"; } },
    "Privacy concerns",
    async (input, init) => {
      captured = { input, init };
      return Response.json({ success: true, deletionStatus: "pending" });
    },
  );

  assert.deepEqual(tokenCalls, [true]);
  assert.equal(captured.input, "/api/account/deletion-request");
  assert.equal(captured.init.method, "POST");
  assert.equal(new Headers(captured.init.headers).get("authorization"), "Bearer owner-token");
  assert.deepEqual(JSON.parse(captured.init.body), { reason: "Privacy concerns" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, deletionStatus: "pending" });
});

test("requestAccountDeletion surfaces the server duplicate message", async () => {
  const helper = loadModule();

  await assert.rejects(
    helper.requestAccountDeletion(
      { getIdToken: async () => "owner-token" },
      "",
      async () => Response.json(
        { error: "A deletion request is already active." },
        { status: 409 },
      ),
    ),
    /already active/i,
  );
});

test("readAccountDeletionState normalizes pending timestamps and unknown states", () => {
  const helper = loadModule();
  const requestedAt = new Date("2026-10-07T08:00:00.000Z");

  const pending = helper.readAccountDeletionState({
    deletionStatus: "pending",
    deletionRequestedAt: { toDate: () => requestedAt },
  });
  const unknown = helper.readAccountDeletionState({ deletionStatus: "approved" });

  assert.equal(pending.status, "pending");
  assert.equal(pending.requestedAt.toISOString(), requestedAt.toISOString());
  assert.equal(unknown.status, "none");
  assert.equal(unknown.requestedAt, null);
});

test("deleteOwnAccount sends the typed phrase with the owner token", async () => {
  const helper = loadModule();
  const calls = [];
  const result = await helper.deleteOwnAccount(
    { getIdToken: async () => "owner-token" },
    "I agree to delete this account.",
    async (url, init) => { calls.push([url, init]); return Response.json({ success: true }); },
  );
  assert.equal(result.success, true);
  assert.equal(calls[0][0], "/api/account/delete");
  assert.equal(calls[0][1].headers.Authorization, "Bearer owner-token");
  assert.equal(JSON.parse(calls[0][1].body).confirmation, "I agree to delete this account.");
});

test("deleteOwnAccount reports when the owner must sign in again", async () => {
  const helper = loadModule();
  await assert.rejects(
    helper.deleteOwnAccount(
      { getIdToken: async () => "owner-token" },
      "I agree to delete this account.",
      async () => Response.json({ error: "Sign in again.", reauthenticate: true }, { status: 401 }),
    ),
    (error) => error.reauthenticate === true && /Sign in again/.test(error.message),
  );
});

test("the required phrase matches the evaluator's wording exactly", () => {
  assert.equal(loadModule().DELETE_ACCOUNT_PHRASE, "I agree to delete this account.");
});
