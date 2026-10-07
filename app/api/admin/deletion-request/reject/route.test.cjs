const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute({ authorized = true, status = "pending" } = {}) {
  const operations = [];
  const userData = {
    deletionStatus: status,
    deletionRequestedAt: "requested-at",
    email: "owner@example.com",
    fullName: "Owner One",
  };
  const userRef = { path: "users/owner-1" };
  const db = {
    doc: () => userRef,
    collection: () => ({ doc: () => ({ path: "auditLogs/audit-1" }) }),
    async runTransaction(work) {
      return work({
        async get() {
          return { exists: true, data: () => userData };
        },
        update(ref, value) {
          operations.push({ type: "update", path: ref.path, value });
        },
        set(ref, value) {
          operations.push({ type: "audit", path: ref.path, value });
        },
      });
    },
  };
  const source = readFileSync(path.join(__dirname, "route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Request,
    Response,
    console,
    require: (name) => {
      if (name === "@/lib/server/adminAuth") {
        return {
          authorizeAdminRequest: async () => authorized
            ? { ok: true, admin: { uid: "admin-1", email: "admin@example.com" } }
            : { ok: false, response: Response.json({ error: "Forbidden." }, { status: 403 }) },
        };
      }
      if (name === "@/lib/configs/firebase-admin") return { getAdminFirestore: () => db };
      if (name === "@/lib/server/auditLog") {
        return {
          buildAuditLogRecord: (entry) => ({ ...entry, createdAt: "server-time" }),
        };
      }
      if (name === "firebase-admin/firestore") {
        return { FieldValue: { delete: () => "delete-field" } };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { route: sandboxModule.exports, operations };
}

function request() {
  return new Request("https://app.example.com/api/admin/deletion-request/reject", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "owner-1" }),
  });
}

test("reject atomically clears pending status and records the administrator", async () => {
  const fixture = loadRoute();
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.operations)), [
    {
      type: "update",
      path: "users/owner-1",
      value: {
        deletionStatus: "none",
        deletionRequestedAt: "delete-field",
        deletionError: "delete-field",
      },
    },
    {
      type: "audit",
      path: "auditLogs/audit-1",
      value: {
        action: "deletion_rejected",
        actorUid: "admin-1",
        actorEmail: "admin@example.com",
        targetUid: "owner-1",
        targetEmail: "owner@example.com",
        details: { result: "returned_to_normal" },
        createdAt: "server-time",
      },
    },
  ]);
});

test("reject denies non-admin callers before reading the target", async () => {
  const fixture = loadRoute({ authorized: false });
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 403);
  assert.deepEqual(fixture.operations, []);
});

test("reject refuses a request that is already processing", async () => {
  const fixture = loadRoute({ status: "processing" });
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 409);
  assert.deepEqual(fixture.operations, []);
});
