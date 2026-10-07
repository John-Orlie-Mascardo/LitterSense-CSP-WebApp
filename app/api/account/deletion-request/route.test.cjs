const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transpile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadRoute({ authorization, userData }) {
  const operations = [];
  let transactionCalls = 0;
  const db = {
    doc: (documentPath) => ({ path: documentPath }),
    collection: (collectionPath) => ({
      doc: () => ({ path: `${collectionPath}/generated-audit` }),
      add: async () => ({ id: "unused" }),
    }),
    runTransaction: async (work) => {
      transactionCalls += 1;
      const staged = [];
      const result = await work({
        get: async (reference) => ({
          exists: Boolean(userData),
          data: () => userData,
          ref: reference,
        }),
        update: (reference, data) => staged.push({ type: "update", path: reference.path, data }),
        set: (reference, data) => staged.push({ type: "set", path: reference.path, data }),
      });
      operations.push(...staged);
      return result;
    },
  };

  const auditModule = { exports: {} };
  vm.runInNewContext(transpile(path.join(__dirname, "../../../../lib/server/auditLog.ts")), {
    module: auditModule,
    exports: auditModule.exports,
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") return { getAdminFirestore: () => db };
      if (name === "firebase-admin/firestore") {
        return { FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" } };
      }
      throw new Error(`Unexpected audit import ${name}`);
    },
  });

  const routeModule = { exports: {} };
  vm.runInNewContext(transpile(path.join(__dirname, "route.ts")), {
    module: routeModule,
    exports: routeModule.exports,
    Request,
    Response,
    console,
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") return { getAdminFirestore: () => db };
      if (name === "@/lib/server/ownerAuth") {
        return { authorizeOwnerRequest: async () => authorization };
      }
      if (name === "@/lib/server/auditLog") return auditModule.exports;
      if (name === "firebase-admin/firestore") {
        return { FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" } };
      }
      throw new Error(`Unexpected route import ${name}`);
    },
  });

  return {
    route: routeModule.exports,
    operations,
    get transactionCalls() { return transactionCalls; },
  };
}

const ownerAuthorization = {
  ok: true,
  owner: { uid: "owner-1", email: "token-owner@example.com" },
};

function request(body = { reason: " Privacy concerns " }) {
  return new Request("https://app.example.com/api/account/deletion-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("deletion request atomically sets pending status and its audit entry", async () => {
  const loaded = loadRoute({
    authorization: ownerAuthorization,
    userData: { email: "profile-owner@example.com", deletionStatus: "none", fullName: "Owner One" },
  });

  const response = await loaded.route.POST(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, deletionStatus: "pending" });
  assert.equal(loaded.transactionCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.operations)), [
    {
      type: "update",
      path: "users/owner-1",
      data: {
        deletionStatus: "pending",
        deletionRequestedAt: "SERVER_TIMESTAMP",
      },
    },
    {
      type: "set",
      path: "auditLogs/generated-audit",
      data: {
        action: "deletion_requested",
        actorUid: "owner-1",
        actorEmail: "token-owner@example.com",
        targetUid: "owner-1",
        targetEmail: "profile-owner@example.com",
        details: { reason: "Privacy concerns" },
        createdAt: "SERVER_TIMESTAMP",
      },
    },
  ]);
});

test("deletion request rejects a duplicate without writing or auditing", async () => {
  const loaded = loadRoute({
    authorization: ownerAuthorization,
    userData: { email: "owner@example.com", deletionStatus: "pending" },
  });

  const response = await loaded.route.POST(request());

  assert.equal(response.status, 409);
  assert.deepEqual(loaded.operations, []);
});

test("deletion request rejects unauthenticated callers before database access", async () => {
  const loaded = loadRoute({
    authorization: {
      ok: false,
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    },
    userData: { deletionStatus: "none" },
  });

  const response = await loaded.route.POST(request());

  assert.equal(response.status, 401);
  assert.equal(loaded.transactionCalls, 0);
  assert.deepEqual(loaded.operations, []);
});
