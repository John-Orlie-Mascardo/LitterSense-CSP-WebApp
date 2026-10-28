const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/authGate.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", compiled.outputText);
fn(testModule.exports, testModule);

const { shouldShowAuthRestore } = testModule.exports;
const idle = { authLoading: false, hasUser: false, isSigningIn: false, authSucceeded: false };

test("shows the restore screen while Firebase is still checking the saved session", () => {
  assert.equal(shouldShowAuthRestore({ ...idle, authLoading: true }), true);
});

test("keeps the restore screen for an already signed-in user until the redirect", () => {
  assert.equal(shouldShowAuthRestore({ ...idle, hasUser: true }), true);
});

test("shows the login form only after the check finishes with no user", () => {
  assert.equal(shouldShowAuthRestore(idle), false);
});

test("an active form sign-in keeps its own progress and success toast", () => {
  assert.equal(shouldShowAuthRestore({ ...idle, authLoading: true, hasUser: true, isSigningIn: true }), false);
  assert.equal(shouldShowAuthRestore({ ...idle, hasUser: true, authSucceeded: true }), false);
});
