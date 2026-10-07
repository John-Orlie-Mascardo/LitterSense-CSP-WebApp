const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadHelper(adminApiFetch) {
  const source = readFileSync(path.join(__dirname, "adminDeletionRequests.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Headers,
    Request,
    Response,
    fetch,
    require: (name) => {
      if (name === "@/lib/utils/adminApi") return { adminApiFetch };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("USER deletion fields become a queue entry with name and submission date", () => {
  const helper = loadHelper(async () => Response.json({ success: true }));
  const entry = helper.readAdminDeletionRequest("owner-1", {
    fullName: "Owner One",
    email: "owner@example.com",
    deletionStatus: "pending",
    deletionRequestedAt: { toDate: () => new Date("2026-10-06T09:00:00.000Z") },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    id: "owner-1",
    userId: "owner-1",
    userName: "Owner One",
    userEmail: "owner@example.com",
    requestedDate: "2026-10-06T09:00:00.000Z",
    status: "pending",
  });
  assert.equal(helper.readAdminDeletionRequest("owner-2", { deletionStatus: "none" }), null);
});

test("failed USER deletion fields retain the retry error in the queue", () => {
  const helper = loadHelper(async () => Response.json({ success: true }));
  const entry = helper.readAdminDeletionRequest("owner-1", {
    displayName: "Owner Two",
    email: "owner2@example.com",
    deletionStatus: "failed",
    deletionError: "deleting Storage files: unavailable",
  });

  assert.equal(entry.status, "failed");
  assert.equal(entry.userName, "Owner Two");
  assert.equal(entry.error, "deleting Storage files: unavailable");
});

test("approve and reject actions use only authenticated admin server routes", async () => {
  const calls = [];
  const helper = loadHelper(async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return Response.json({ success: true });
  });

  await helper.runAdminDeletionAction("approve", "owner-1");
  await helper.runAdminDeletionAction("reject", "owner-2");

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    { url: "/api/admin/delete-user", method: "POST", body: { userId: "owner-1" } },
    {
      url: "/api/admin/deletion-request/reject",
      method: "POST",
      body: { userId: "owner-2" },
    },
  ]);
});

test("admin deletion action surfaces the server failure message", async () => {
  const helper = loadHelper(async () =>
    Response.json({ error: "The request is already processing." }, { status: 409 }),
  );

  await assert.rejects(
    helper.runAdminDeletionAction("approve", "owner-1"),
    /already processing/,
  );
});
