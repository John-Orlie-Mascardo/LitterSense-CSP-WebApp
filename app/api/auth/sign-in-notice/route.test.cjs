const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transpile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
}

function loadModule(file, context) {
  const loaded = { exports: {} };
  vm.runInNewContext(transpile(file), { module: loaded, exports: loaded.exports, ...context });
  return loaded.exports;
}

function loadRoute({ claims, env = { SMTP_USER: "sender@example.com", SMTP_APP_PASSWORD: "app-pass" }, sendError } = {}) {
  const sent = [];
  const signInEmail = loadModule(path.join(__dirname, "../../../../lib/server/signInEmail.ts"), { Intl, Date });
  const route = loadModule(path.join(__dirname, "route.ts"), {
    Request,
    Response,
    Date,
    console: { warn() {}, error() {} },
    process: { env },
    require: (name) => {
      if (name === "nodemailer") {
        return {
          __esModule: true,
          default: {
            createTransport: () => ({
              sendMail: async (message) => {
                if (sendError) throw sendError;
                sent.push(message);
              },
            }),
          },
        };
      }
      if (name === "@/lib/configs/firebase-admin") {
        return {
          getAdminAuth: () => ({
            verifyIdToken: async (token, checkRevoked) => {
              assert.equal(checkRevoked, true);
              if (token !== "valid-token" || !claims) throw new Error("bad token");
              return claims;
            },
          }),
        };
      }
      if (name === "@/lib/server/signInEmail") return signInEmail;
      throw new Error(`Unexpected route import ${name}`);
    },
  });
  return { route, sent };
}

function request(token = "valid-token") {
  return new Request("https://app.example.com/api/auth/sign-in-notice", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0 Safari/537.36",
    },
    body: JSON.stringify({ timeZone: "Asia/Manila" }),
  });
}

const freshClaims = () => ({
  email: "owner@example.com",
  auth_time: Math.floor(Date.now() / 1000) - 5,
  firebase: { sign_in_provider: "google.com" },
});

test("a real sign-in emails the verified token address", async () => {
  const { route, sent } = loadRoute({ claims: freshClaims() });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "owner@example.com");
  assert.equal(sent[0].from, "LitterSense <sender@example.com>");
  assert.match(sent[0].text, /Method: Google/);
});

test("a restored session token does not send an email", async () => {
  const { route, sent } = loadRoute({ claims: { ...freshClaims(), auth_time: Math.floor(Date.now() / 1000) - 86_400 } });
  const response = await route.POST(request());
  assert.deepEqual(await response.json(), { sent: false, reason: "not-fresh" });
  assert.equal(sent.length, 0);
});

test("missing or invalid tokens are rejected without sending", async () => {
  const { route, sent } = loadRoute({ claims: freshClaims() });
  assert.equal((await route.POST(request(null))).status, 401);
  assert.equal((await route.POST(request("forged"))).status, 401);
  assert.equal(sent.length, 0);
});

test("missing SMTP settings skip the email without failing", async () => {
  const { route, sent } = loadRoute({ claims: freshClaims(), env: {} });
  const response = await route.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: false, reason: "not-configured" });
  assert.equal(sent.length, 0);
});

test("SMTP failures report 502 without leaking details", async () => {
  const { route } = loadRoute({ claims: freshClaims(), sendError: new Error("535 auth failed for app-pass") });
  const response = await route.POST(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { sent: false, reason: "send-failed" });
});
