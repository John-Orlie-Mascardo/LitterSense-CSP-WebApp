const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const admin = { uid: "admin-1", email: "admin@example.com" };

function loadRoute({ authorized = true, adminAuth = {}, writeAuditLog = async () => "audit-1" } = {}) {
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
    console: { error: () => {} },
    require: (name) => {
      if (name === "@/lib/configs/firebase-admin") return { getAdminAuth: () => adminAuth };
      if (name === "@/lib/server/adminAuth") {
        return {
          authorizeAdminRequest: async () => authorized
            ? { ok: true, admin }
            : { ok: false, response: Response.json({ error: "Forbidden." }, { status: 403 }) },
        };
      }
      if (name === "@/lib/server/auditLog") return { writeAuditLog };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

const post = (body) => new Request("http://localhost/api/admin/users/status", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("non-admins are rejected before any account change", async () => {
  let touched = false;
  const route = loadRoute({ authorized: false, adminAuth: { getUser: async () => { touched = true; } } });
  const response = await route.POST(post({ userId: "owner-1", suspended: true }));
  assert.equal(response.status, 403);
  assert.equal(touched, false);
});

test("an admin cannot suspend their own account", async () => {
  const route = loadRoute();
  const response = await route.POST(post({ userId: admin.uid, suspended: true }));
  assert.equal(response.status, 400);
});

test("suspending disables the account, revokes sessions, and writes an audit entry", async () => {
  const calls = [];
  const audits = [];
  const route = loadRoute({
    adminAuth: {
      getUser: async (uid) => ({ uid, email: "owner@example.com" }),
      updateUser: async (uid, update) => calls.push(["update", uid, update.disabled]),
      revokeRefreshTokens: async (uid) => calls.push(["revoke", uid]),
    },
    writeAuditLog: async (entry) => { audits.push(entry); return "audit-1"; },
  });
  const response = await route.POST(post({ userId: "owner-1", suspended: true }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.auditSaved, true);
  assert.deepEqual(calls, [["update", "owner-1", true], ["revoke", "owner-1"]]);
  assert.equal(audits[0].action, "user_suspended");
  assert.equal(audits[0].targetUid, "owner-1");
});

test("restoring re-enables the account without revoking sessions", async () => {
  const calls = [];
  const route = loadRoute({
    adminAuth: {
      getUser: async (uid) => ({ uid }),
      updateUser: async (uid, update) => calls.push(["update", uid, update.disabled]),
      revokeRefreshTokens: async () => calls.push(["revoke"]),
    },
  });
  const response = await route.POST(post({ userId: "owner-1", suspended: false }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["update", "owner-1", false]]);
});

test("a failed audit write still reports the completed status change", async () => {
  const route = loadRoute({
    adminAuth: {
      getUser: async (uid) => ({ uid }),
      updateUser: async () => {},
      revokeRefreshTokens: async () => {},
    },
    writeAuditLog: async () => { throw new Error("rpc missing"); },
  });
  const response = await route.POST(post({ userId: "owner-1", suspended: true }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.auditSaved, false);
});

test("an unknown account returns 404 and invalid input returns 400", async () => {
  const route = loadRoute({
    adminAuth: { getUser: async () => { throw Object.assign(new Error("missing"), { code: "auth/user-not-found" }); } },
  });
  assert.equal((await route.POST(post({ userId: "ghost", suspended: true }))).status, 404);
  assert.equal((await route.POST(post({ userId: "bad/id", suspended: true }))).status, 400);
  assert.equal((await route.POST(post({ userId: "owner-1", suspended: "yes" }))).status, 400);
});

test("GET lists suspended accounts across pages", async () => {
  const pages = {
    undefined: { users: [{ uid: "a", disabled: true }, { uid: "b", disabled: false }], pageToken: "next" },
    next: { users: [{ uid: "c", disabled: true }] },
  };
  const route = loadRoute({ adminAuth: { listUsers: async (_max, token) => pages[token] } });
  const response = await route.GET(new Request("http://localhost/api/admin/users/status"));
  const payload = await response.json();
  assert.deepEqual(payload.suspended, ["a", "c"]);
});
