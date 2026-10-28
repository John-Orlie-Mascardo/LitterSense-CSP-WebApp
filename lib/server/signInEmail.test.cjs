const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/server/signInEmail.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", compiled.outputText);
fn(testModule.exports, testModule);

const {
  decideSignInNotice,
  describeDevice,
  describeSignInMethod,
  formatSignInTime,
  isFreshSignIn,
  resolveTimeZone,
} = testModule.exports;

const now = Date.UTC(2026, 9, 28, 8, 35, 0);
const chromeWindows = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

test("a fresh auth_time sends one email to the token's own address", () => {
  const decision = decideSignInNotice(
    { email: "owner@example.com", auth_time: now / 1000 - 10, firebase: { sign_in_provider: "password" } },
    { userAgent: chromeWindows, timeZone: "Asia/Manila", nowMs: now },
  );
  assert.equal(decision.send, true);
  assert.equal(decision.message.to, "owner@example.com");
  assert.match(decision.message.text, /Time: Oct 28, 2026, 4:34 PM \(Asia\/Manila\)/);
  assert.match(decision.message.text, /Method: Email and password/);
  assert.match(decision.message.text, /Device: Chrome on Windows/);
});

test("a restored session with an old auth_time never sends", () => {
  const decision = decideSignInNotice(
    { email: "owner@example.com", auth_time: now / 1000 - 3 * 24 * 3600 },
    { userAgent: chromeWindows, timeZone: "Asia/Manila", nowMs: now },
  );
  assert.deepEqual(decision, { send: false, reason: "not-fresh" });
});

test("an account without an email address never sends", () => {
  const decision = decideSignInNotice({ auth_time: now / 1000 }, { userAgent: null, timeZone: null, nowMs: now });
  assert.deepEqual(decision, { send: false, reason: "no-email" });
});

test("freshness window is five minutes with one minute of clock skew", () => {
  assert.equal(isFreshSignIn(now / 1000 - 299, now), true);
  assert.equal(isFreshSignIn(now / 1000 - 301, now), false);
  assert.equal(isFreshSignIn(now / 1000 + 30, now), true);
  assert.equal(isFreshSignIn(now / 1000 + 120, now), false);
});

test("labels sign-in method, device and 12-hour local time", () => {
  assert.equal(describeSignInMethod("google.com"), "Google");
  assert.equal(describeSignInMethod(undefined), "Unknown");
  assert.equal(describeDevice(chromeWindows), "Chrome on Windows");
  assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iOS");
  assert.equal(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36 EdgA/141.0 Edg/141.0"), "Edge on Android");
  assert.equal(describeDevice(null), "Unknown device");
  assert.equal(formatSignInTime(new Date(now), "Asia/Manila"), "Oct 28, 2026, 4:35 PM (Asia/Manila)");
});

test("invalid or missing time zones fall back to Asia/Manila", () => {
  assert.equal(resolveTimeZone("Not/AZone"), "Asia/Manila");
  assert.equal(resolveTimeZone(42), "Asia/Manila");
  assert.equal(resolveTimeZone("America/New_York"), "America/New_York");
});

test("HTML body escapes header-derived values", () => {
  const decision = decideSignInNotice(
    { email: "owner@example.com", auth_time: now / 1000, firebase: { sign_in_provider: "<script>" } },
    { userAgent: null, timeZone: "Asia/Manila", nowMs: now },
  );
  assert.doesNotMatch(decision.message.html, /<script>/);
  assert.match(decision.message.html, /&lt;script&gt;/);
});
