import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = new URL("../../../../", import.meta.url);

function transpile(file) {
  return ts.transpileModule(readFileSync(new URL(file, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

const passwordPolicy = (() => {
  const loaded = { exports: {} };
  vm.runInNewContext(transpile("lib/utils/passwordPolicy.ts"), { module: loaded, exports: loaded.exports });
  return loaded.exports;
})();

function load(file, { users = { "owner@example.com": "owner-1" }, recent = false, claim = null, smtp = true } = {}) {
  const calls = [];
  const sent = [];
  const modules = {
    nodemailer: { __esModule: true, default: { createTransport: () => ({ sendMail: async (mail) => { sent.push(mail); } }) } },
    "@/lib/configs/firebase-admin": {
      getAdminAuth: () => ({
        getUserByEmail: async (email) => {
          if (!users[email]) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
          return { uid: users[email], email };
        },
        updateUser: async (uid, update) => calls.push(["password", uid, update.password]),
        revokeRefreshTokens: async (uid) => calls.push(["revoke", uid]),
      }),
    },
    "@/lib/server/passwordResetTokens": {
      PASSWORD_RESET_TTL_MINUTES: 30,
      hasRecentResetToken: async (uid) => { calls.push(["recent", uid]); return recent; },
      createResetToken: async (uid, email) => { calls.push(["create", uid, email]); return "raw-token-123"; },
      claimResetToken: async (token) => { calls.push(["claim", token]); return claim; },
    },
    "@/lib/utils/passwordPolicy": passwordPolicy,
  };
  const route = { exports: {} };
  vm.runInNewContext(transpile(file), {
    module: route, exports: route.exports, Request, Response, URL,
    console: { error() {} },
    process: { env: smtp ? { SMTP_USER: "sender@example.com", SMTP_APP_PASSWORD: "app-pass" } : {} },
    require: (name) => { if (!(name in modules)) throw Error("Unknown import " + name); return modules[name]; },
  });
  const post = (body) => route.exports.POST(new Request("https://app.example.com/api/auth/password-reset", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { calls, sent, post };
}

const REQUEST = "app/api/auth/password-reset/route.ts";
const CONFIRM = "app/api/auth/password-reset/confirm/route.ts";

test("a known email gets a 30-minute link to our reset page", async () => {
  const f = load(REQUEST);
  const response = await f.post({ email: " Owner@Example.com " });
  assert.equal(response.status, 200);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, "owner@example.com");
  assert.match(f.sent[0].text, /https:\/\/app\.example\.com\/reset-password\?token=raw-token-123/);
  assert.match(f.sent[0].text, /30 minutes/);
  assert.doesNotMatch(await response.text(), /raw-token-123/);
});

test("an unknown email gets the same answer and no email, so accounts can't be probed", async () => {
  const known = await (await load(REQUEST).post({ email: "owner@example.com" })).json();
  const f = load(REQUEST);
  const unknown = await (await f.post({ email: "nobody@example.com" })).json();
  assert.equal(JSON.stringify(unknown), JSON.stringify(known));
  assert.equal(f.sent.length, 0);
});

test("a second request within a minute sends nothing new", async () => {
  const f = load(REQUEST, { recent: true });
  const response = await f.post({ email: "owner@example.com" });
  assert.equal(response.status, 200);
  assert.equal(f.sent.length, 0);
  assert.equal(f.calls.some(([step]) => step === "create"), false);
});

test("an invalid email is rejected", async () => {
  assert.equal((await load(REQUEST).post({ email: "not-an-email" })).status, 400);
});

test("a valid unused link sets the new password and signs the owner out everywhere", async () => {
  const f = load(CONFIRM, { claim: { uid: "owner-1", email: "owner@example.com" } });
  const response = await f.post({ token: "raw-token-123", password: "Test#2026cat" });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [["claim", "raw-token-123"], ["password", "owner-1", "Test#2026cat"], ["revoke", "owner-1"]]);
});

test("a weak password is refused before the link is used up", async () => {
  const f = load(CONFIRM, { claim: { uid: "owner-1", email: "owner@example.com" } });
  const response = await f.post({ token: "raw-token-123", password: "password" });
  assert.equal(response.status, 400);
  assert.equal(f.calls.length, 0);
});

test("an expired, used, or unknown link is refused", async () => {
  const f = load(CONFIRM, { claim: null });
  const response = await f.post({ token: "raw-token-123", password: "Test#2026cat" });
  assert.equal(response.status, 410);
  assert.equal(f.calls.some(([step]) => step === "password"), false);
});
