/**
 * page.ui.test.mjs
 *
 * Source-level contracts for the dark/teal password reset flow.
 *
 * DONE: shell, shared control tokens, request locking, real resend behavior
 * PLACEHOLDER: none
 *
 * NEXT: add browser-level Firebase emulator coverage when available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const requestSource = readFileSync(join(__dirname, "page.tsx"), "utf8");
const confirmationSource = readFileSync(
  join(__dirname, "check-email", "page.tsx"),
  "utf8",
);

test("password reset pages use the same dark and teal treatment as login", () => {
  for (const source of [requestSource, confirmationSource]) {
    assert.match(source, /bg-litter-bg/);
    assert.match(source, /bg-litter-card/);
    assert.match(source, /bg-litter-primary/);
    assert.match(source, /border-litter-border/);
  }
  assert.match(requestSource, /bg-litter-input/);
});

test("reset requests prevent duplicate submissions", () => {
  assert.match(requestSource, /if \(isLoading\) return;/);
  assert.match(requestSource, /disabled=\{isLoading\}/);
  assert.match(confirmationSource, /if \(isResending\) return;/);
});

test("the confirmation page resends through Firebase instead of a mock delay", () => {
  assert.match(confirmationSource, /sendPasswordResetEmail/);
  assert.doesNotMatch(confirmationSource, /Mock delay/);
  assert.doesNotMatch(confirmationSource, /setTimeout/);
});

test("the confirmation page opens Gmail for Gmail reset addresses", () => {
  assert.match(confirmationSource, /domain === "gmail\.com"/);
  assert.match(confirmationSource, /https:\/\/mail\.google\.com\/mail\/u\/0\/#inbox/);
  assert.match(confirmationSource, /Open \{emailProvider\.name\}/);
  assert.doesNotMatch(confirmationSource, /href="mailto:"/);
});
