const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const admin = { uid: "admin-1", email: "admin@example.com" };
const note = "Confirmed cat names Mochi and Renz and the collar tag.";

function loadRoute({ adminAuth, writeAuditLog = async () => "audit-1", smtp = true, sent = [], profileWrites = [] } = {}) {
  const source = readFileSync(path.join(__dirname, "route.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Request,
    Response,
    URL,
    console: { error: () => {} },
    process: { env: smtp ? { SMTP_USER: "sender@example.com", SMTP_APP_PASSWORD: "app-pass" } : {} },
    require: (name) => {
      if (name === "nodemailer") {
        return { __esModule: true, default: { createTransport: () => ({ sendMail: async (mail) => { sent.push(mail); } }) } };
      }
      if (name === "@/lib/configs/firebase-admin") {
        return {
          getAdminAuth: () => adminAuth,
          getAdminFirestore: () => ({ doc: (p) => ({ set: async (data) => { profileWrites.push([p, data]); } }) }),
        };
      }
      if (name === "@/lib/server/adminAuth") return { authorizeAdminRequest: async () => ({ ok: true, admin }) };
      if (name === "@/lib/server/auditLog") return { writeAuditLog };
      if (name === "@/lib/server/operationalStore") {
        return { rfidPrimaryEnabled: () => false, commitOperational: async () => {}, readOperationalRecord: async () => null, retryOperational: (fn) => fn(), setOperational: () => ({}) };
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return sandboxModule.exports;
}

const post = (body) => new Request("https://app.example.com/api/admin/users/recovery", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const baseAuth = (calls) => ({
  getUser: async (uid) => ({ uid, email: "old@example.com" }),
  updateUser: async (uid, update) => calls.push(["update", uid, update.email]),
  generatePasswordResetLink: async (email, settings) => { calls.push(["link", email, settings.url]); return "https://reset.example/secret"; },
  revokeRefreshTokens: async (uid) => calls.push(["revoke", uid]),
});

test("sends the reset link to the registered email and never returns it to the admin", async () => {
  const calls = [];
  const sent = [];
  const audits = [];
  const route = loadRoute({ adminAuth: baseAuth(calls), sent, writeAuditLog: async (entry) => { audits.push(entry); } });
  const response = await route.POST(post({ userId: "owner-1", verificationNote: note }));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(text, /reset\.example/);
  assert.equal(sent[0].to, "old@example.com");
  assert.match(sent[0].text, /reset\.example\/secret/);
  assert.deepEqual(calls, [["link", "old@example.com", "https://app.example.com/login"], ["revoke", "owner-1"]]);
  assert.equal(audits[0].action, "account_recovery");
  assert.equal(audits[0].details.verificationNote, note);
});

test("a new email is set on the account and its profile before the link is sent there", async () => {
  const calls = [];
  const sent = [];
  const profileWrites = [];
  const route = loadRoute({ adminAuth: baseAuth(calls), sent, profileWrites });
  const response = await route.POST(post({ userId: "owner-1", verificationNote: note, newEmail: " New@Example.com " }));
  const payload = await response.json();
  assert.equal(payload.emailChanged, true);
  assert.equal(calls[0][2], "new@example.com");
  assert.equal(JSON.stringify(profileWrites), JSON.stringify([["users/owner-1", { email: "new@example.com" }]]));
  assert.equal(sent[0].to, "new@example.com");
});

test("refuses without an identity-check note, with a bad email, or for the admin's own account", async () => {
  const route = loadRoute({ adminAuth: baseAuth([]) });
  assert.equal((await route.POST(post({ userId: "owner-1", verificationNote: "short" }))).status, 400);
  assert.equal((await route.POST(post({ userId: "owner-1", verificationNote: note, newEmail: "not-an-email" }))).status, 400);
  assert.equal((await route.POST(post({ userId: admin.uid, verificationNote: note }))).status, 400);
});

test("without email configured it fails instead of handing the link to the admin", async () => {
  const calls = [];
  const route = loadRoute({ adminAuth: baseAuth(calls), smtp: false });
  const response = await route.POST(post({ userId: "owner-1", verificationNote: note }));
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
});

test("an email already used by another account returns 409", async () => {
  const auth = baseAuth([]);
  auth.updateUser = async () => { throw Object.assign(new Error("taken"), { code: "auth/email-already-exists" }); };
  const route = loadRoute({ adminAuth: auth });
  const response = await route.POST(post({ userId: "owner-1", verificationNote: note, newEmail: "taken@example.com" }));
  assert.equal(response.status, 409);
});

test("a failed audit write still reports the completed recovery", async () => {
  const route = loadRoute({ adminAuth: baseAuth([]), writeAuditLog: async () => { throw new Error("rpc missing"); } });
  const payload = await (await route.POST(post({ userId: "owner-1", verificationNote: note }))).json();
  assert.equal(payload.success, true);
  assert.equal(payload.auditSaved, false);
});
