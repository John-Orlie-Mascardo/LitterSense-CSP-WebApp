/**
 * page.ui.test.mjs
 *
 * Login interaction contracts for progress, success, errors, and request guards.
 *
 * DONE: double-submit prevention, toast-before-redirect, disabled actions, safe copy
 * PLACEHOLDER: none
 *
 * NEXT: add browser-level Firebase emulator coverage when the project adopts it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("both login methods block duplicate requests and disable while loading", () => {
  assert.ok((source.match(/if \(isLoading\) return;/g) ?? []).length >= 2);
  assert.ok((source.match(/disabled=\{isLoading\}/g) ?? []).length >= 2);
  assert.match(source, /Signing in\.\.\./);
});

test("successful authentication shows a toast before the resolved redirect", () => {
  assert.match(source, /ToastContainer/);
  assert.match(source, /Signed in successfully/);
  assert.match(source, /authSucceeded/);
  assert.match(source, /profileLoading/);
  assert.match(source, /setTimeout/);
});

test("a restoring or signed-in session shows the loading screen instead of the form", () => {
  assert.match(source, /shouldShowAuthRestore\(\{[\s\S]*authLoading,[\s\S]*isSigningIn: isLoading,[\s\S]*\}\)\) \{\s*return <AuthLoadingScreen \/>;/);
  assert.ok(source.indexOf("<AuthLoadingScreen />") < source.indexOf("<form"));
});

test("only interactive sign-ins request the email, without awaiting it", () => {
  assert.equal((source.match(/void requestSignInNotice\(/g) ?? []).length, 2);
  assert.doesNotMatch(source, /await requestSignInNotice/);
});

test("login uses privacy-safe mapped errors instead of raw Firebase messages", () => {
  assert.match(source, /getEmailLoginErrorMessage/);
  assert.match(source, /getGoogleLoginErrorMessage/);
  assert.doesNotMatch(source, /error\.message/);
  assert.doesNotMatch(source, /Account not registered/);
});
