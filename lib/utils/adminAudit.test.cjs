const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadHelper() {
  const source = readFileSync(path.join(__dirname, "adminAudit.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
  });
  return sandboxModule.exports;
}

test("audit documents retain actor, target, action, time, and compact details", () => {
  const helper = loadHelper();
  const entry = helper.readAdminAuditEntry("audit-1", {
    action: "deletion_approved",
    actorUid: "admin-1",
    actorEmail: "admin@example.com",
    targetUid: "owner-1",
    targetEmail: "owner@example.com",
    details: { result: "permanently_deleted" },
    createdAt: { toDate: () => new Date("2026-10-07T01:02:03.000Z") },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(entry)), {
    id: "audit-1",
    action: "deletion_approved",
    actorUid: "admin-1",
    actorEmail: "admin@example.com",
    targetUid: "owner-1",
    targetEmail: "owner@example.com",
    details: { result: "permanently_deleted" },
    createdAt: "2026-10-07T01:02:03.000Z",
  });
});

test("malformed audit fields get safe display fallbacks", () => {
  const helper = loadHelper();
  const entry = helper.readAdminAuditEntry("audit-2", { action: 7, details: ["bad"] });

  assert.equal(entry.action, "unknown_action");
  assert.equal(entry.actorEmail, null);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.details)), {});
  assert.equal(entry.createdAt, "");
});
