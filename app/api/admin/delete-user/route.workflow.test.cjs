const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute({ initialStatus = "pending", failAt = "", authMissing = false } = {}) {
  const operations = [];
  let userData = {
    deletionStatus: initialStatus,
    deletionRequestedAt: { toDate: () => new Date("2026-10-06T09:00:00.000Z") },
    email: "owner@example.com",
    fullName: "Owner One",
  };

  const linkedDocs = {
    deviceConfigs: [{ path: "deviceConfigs/device-a" }],
    cameraDevices: [{ path: "cameraDevices/camera-a" }],
    deleteRequests: [{ path: "deleteRequests/legacy-a" }],
  };

  const userRef = {
    path: "users/owner-1",
    async get() {
      return { exists: Boolean(userData), data: () => userData };
    },
    async update(value) {
      operations.push(`status:${value.deletionStatus}`);
      userData = { ...userData, ...value };
    },
    async set(value) {
      operations.push(`restore:${value.deletionStatus}`);
      userData = { ...userData, ...value };
    },
    async delete() {
      operations.push("delete:user-document");
      userData = null;
    },
    async listCollections() {
      return [{ path: "users/owner-1/cats" }, { path: "users/owner-1/sessions" }];
    },
  };

  const db = {
    doc(docPath) {
      if (docPath === "users/owner-1") return userRef;
      return {
        path: docPath,
        async delete() {
          operations.push(`delete:${docPath}`);
        },
      };
    },
    collection(name) {
      return {
        where() {
          return {
            async get() {
              return { docs: linkedDocs[name] ?? [] };
            },
          };
        },
      };
    },
    async recursiveDelete(ref) {
      operations.push(`delete:${ref.path}`);
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
    console: { error() {} },
    Error,
    process: { env: { SUPABASE_URL: "https://backup.example.com", SUPABASE_SECRET_KEY: "secret" } },
    require: (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name === "@/lib/server/adminAuth") {
        return {
          authorizeAdminRequest: async () => ({
            ok: true,
            admin: { uid: "admin-1", email: "admin@example.com" },
          }),
        };
      }
      if (name === "@/lib/configs/firebase-admin") {
        return {
          getAdminFirestore: () => db,
          getAdminAuth: () => ({
            async deleteUser() {
              operations.push("delete:auth-user");
              if (authMissing) throw { code: "auth/user-not-found" };
            },
          }),
          getAdminStorageBucket: () => ({
            async deleteFiles({ prefix }) {
              operations.push(`delete:storage:${prefix}`);
              if (failAt === "storage") throw new Error("Storage unavailable");
            },
          }),
        };
      }
      if (name === "@/lib/server/auditLog") {
        return {
          writeAuditLog: async (entry) => {
            operations.push(`audit:${entry.action}`);
          },
        };
      }
      if (name === "@/lib/utils/smsAccountSync") {
        return {
          smsStoreRequest: async () => {
            operations.push("delete:backup-data");
            return { ok: true };
          },
        };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });

  return {
    route: sandboxModule.exports,
    operations,
    readUser: () => userData,
  };
}

function request() {
  return new Request("https://app.example.com/api/admin/delete-user", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "owner-1" }),
  });
}

test("approval follows processing, linked data, storage, USER, Auth, and audit order", async () => {
  const fixture = loadRoute();
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const op = fixture.operations;
  assert.ok(op.indexOf("status:processing") < op.indexOf("delete:users/owner-1/cats"));
  assert.ok(op.indexOf("delete:users/owner-1/sessions") < op.indexOf("delete:storage:users/owner-1/"));
  assert.ok(op.indexOf("delete:storage:users/owner-1/") < op.indexOf("delete:user-document"));
  assert.ok(op.indexOf("delete:user-document") < op.indexOf("delete:auth-user"));
  assert.ok(op.indexOf("delete:auth-user") < op.indexOf("audit:deletion_approved"));
  assert.ok(op.includes("delete:deviceConfigs/device-a"));
  assert.ok(op.includes("delete:cameraDevices/camera-a"));
  assert.ok(op.includes("delete:backup-data"));
  assert.equal(fixture.readUser(), null);
});

test("approval failure restores a visible failed request and writes failure audit", async () => {
  const fixture = loadRoute({ failAt: "storage" });
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 500);
  assert.equal(fixture.readUser().deletionStatus, "failed");
  assert.match(fixture.readUser().deletionError, /storage/i);
  assert.ok(fixture.operations.includes("audit:deletion_failed"));
  assert.ok(!fixture.operations.includes("delete:user-document"));
});

test("retrying a failed request tolerates an already deleted Auth account", async () => {
  const fixture = loadRoute({ initialStatus: "failed", authMissing: true });
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 200);
  assert.ok(fixture.operations.includes("audit:deletion_approved"));
});

test("approval rejects a target that has no pending or failed request", async () => {
  const fixture = loadRoute({ initialStatus: "none" });
  const response = await fixture.route.POST(request());

  assert.equal(response.status, 409);
  assert.deepEqual(fixture.operations, []);
});
