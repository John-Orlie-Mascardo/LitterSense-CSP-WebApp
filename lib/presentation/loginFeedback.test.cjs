/**
 * loginFeedback.test.cjs
 *
 * Behavioral tests for privacy-safe login error copy.
 *
 * DONE: credential, throttling, network, popup, cancellation, and fallback cases
 * PLACEHOLDER: none
 *
 * NEXT: add a literal fixture when Firebase introduces a user-visible error branch.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/presentation/loginFeedback.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const loadModule = new Function("exports", "module", compiled.outputText);
loadModule(testModule.exports, testModule);

const { getEmailLoginErrorMessage, getGoogleLoginErrorMessage } = testModule.exports;

test("credential-related failures do not reveal whether an account exists", () => {
  for (const code of [
    "auth/invalid-credential",
    "auth/user-not-found",
    "auth/wrong-password",
    "auth/invalid-email",
  ]) {
    assert.equal(getEmailLoginErrorMessage(code), "Incorrect email or password.");
  }
});

test("email login explains throttling and connection failures plainly", () => {
  assert.equal(
    getEmailLoginErrorMessage("auth/too-many-requests"),
    "Too many sign-in attempts. Please wait a moment and try again.",
  );
  assert.equal(
    getEmailLoginErrorMessage("auth/network-request-failed"),
    "We couldn’t reach LitterSense. Check your connection and try again.",
  );
  assert.equal(
    getEmailLoginErrorMessage("auth/internal-error"),
    "We couldn’t sign you in. Please try again.",
  );
});

test("Google login distinguishes cancellation, popup blocking, and connection failures", () => {
  assert.equal(
    getGoogleLoginErrorMessage("auth/popup-closed-by-user"),
    "Google sign-in was canceled.",
  );
  assert.equal(
    getGoogleLoginErrorMessage("auth/cancelled-popup-request"),
    "Google sign-in was canceled.",
  );
  assert.equal(
    getGoogleLoginErrorMessage("auth/popup-blocked"),
    "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
  );
  assert.equal(
    getGoogleLoginErrorMessage("auth/network-request-failed"),
    "We couldn’t reach LitterSense. Check your connection and try again.",
  );
  assert.equal(
    getGoogleLoginErrorMessage("auth/internal-error"),
    "We couldn’t sign you in with Google. Please try again.",
  );
});

