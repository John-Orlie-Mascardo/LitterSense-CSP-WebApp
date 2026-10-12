const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadRoute({ authorizeAdminRequest, writeAuditLog }) {
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
    require: (name) => {
      if (name === "@/lib/server/adminAuth") return { authorizeAdminRequest };
      if (name === "@/lib/server/auditLog") return { writeAuditLog };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

test("admin login route rejects callers before writing an audit entry", async () => {
  let auditCalls = 0;
  const route = loadRoute({
    authorizeAdminRequest: async () => ({
      ok: false,
      response: Response.json({ error: "Forbidden." }, { status: 403 }),
    }),
    writeAuditLog: async () => { auditCalls += 1; },
  });

  const response = await route.POST(new Request("https://app.example.com/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ method: "password" }),
  }));

  assert.equal(response.status, 403);
  assert.equal(auditCalls, 0);
});

test("admin login route records the authenticated admin and sign-in method", async () => {
  const entries = [];
  const route = loadRoute({
    authorizeAdminRequest: async () => ({
      ok: true,
      admin: { uid: "admin-1", email: "admin@example.com" },
    }),
    writeAuditLog: async (entry) => { entries.push(entry); },
  });

  const response = await route.POST(new Request("https://app.example.com/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "google" }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(entries)), [{
    action: "admin_login",
    actorUid: "admin-1",
    actorEmail: "admin@example.com",
    targetUid: "admin-1",
    targetEmail: "admin@example.com",
    details: { signInMethod: "google" },
  }]);
});

test("admin login route rejects unknown sign-in methods", async () => {
  let auditCalls = 0;
  const route = loadRoute({
    authorizeAdminRequest: async () => ({
      ok: true,
      admin: { uid: "admin-1", email: "admin@example.com" },
    }),
    writeAuditLog: async () => { auditCalls += 1; },
  });

  const response = await route.POST(new Request("https://app.example.com/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ method: "refresh" }),
  }));

  assert.equal(response.status, 400);
  assert.equal(auditCalls, 0);
});
