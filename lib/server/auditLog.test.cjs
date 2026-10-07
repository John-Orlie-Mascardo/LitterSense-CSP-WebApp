const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadAuditLog(add) {
  const source = readFileSync(path.join(__dirname, "auditLog.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") {
        return { getAdminFirestore: () => ({ collection: () => ({ add }) }) };
      }
      if (name === "firebase-admin/firestore") {
        return { FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" } };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("audit logging writes one traceable server-timestamped action", async () => {
  const writes = [];
  const helper = loadAuditLog(async (entry) => {
    writes.push(entry);
    return { id: "audit-1" };
  });

  const id = await helper.writeAuditLog({
    action: "admin_granted",
    actorUid: "service-account:firebase-admin@example.com",
    actorEmail: "firebase-admin@example.com",
    targetUid: "admin-2",
    targetEmail: "new-admin@example.com",
    details: { source: "manage-admin-script" },
  });

  assert.equal(id, "audit-1");
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{
    action: "admin_granted",
    actorUid: "service-account:firebase-admin@example.com",
    actorEmail: "firebase-admin@example.com",
    targetUid: "admin-2",
    targetEmail: "new-admin@example.com",
    details: { source: "manage-admin-script" },
    createdAt: "SERVER_TIMESTAMP",
  }]);
});

test("audit logging keeps absent target fields explicit", async () => {
  const writes = [];
  const helper = loadAuditLog(async (entry) => {
    writes.push(entry);
    return { id: "audit-login" };
  });

  await helper.writeAuditLog({
    action: "admin_login",
    actorUid: "admin-1",
    actorEmail: null,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), {
    action: "admin_login",
    actorUid: "admin-1",
    actorEmail: null,
    targetUid: null,
    targetEmail: null,
    details: {},
    createdAt: "SERVER_TIMESTAMP",
  });
});

test("audit record builder can be committed with another server transaction", () => {
  const helper = loadAuditLog(async () => ({ id: "unused" }));

  assert.deepEqual(JSON.parse(JSON.stringify(helper.buildAuditLogRecord({
    action: "deletion_requested",
    actorUid: "owner-1",
    actorEmail: "owner@example.com",
    targetUid: "owner-1",
    targetEmail: "owner@example.com",
    details: { reason: "Privacy concerns" },
  }))), {
    action: "deletion_requested",
    actorUid: "owner-1",
    actorEmail: "owner@example.com",
    targetUid: "owner-1",
    targetEmail: "owner@example.com",
    details: { reason: "Privacy concerns" },
    createdAt: "SERVER_TIMESTAMP",
  });
});
