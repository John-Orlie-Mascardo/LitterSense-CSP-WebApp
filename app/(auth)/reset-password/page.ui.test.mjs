import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const forgot = readFileSync(new URL("../forgot-password/page.tsx", import.meta.url), "utf8");
const checkEmail = readFileSync(new URL("../forgot-password/check-email/page.tsx", import.meta.url), "utf8");

test("forgot-password pages request LitterSense's own 30-minute link, not Firebase's", () => {
  for (const source of [forgot, checkEmail]) {
    assert.match(source, /requestPasswordReset\(/);
    assert.doesNotMatch(source, /sendPasswordResetEmail/);
  }
});

test("the reset page sets the password through the token route and ends at sign-in", () => {
  assert.match(page, /searchParams\.get\("token"\)/);
  assert.match(page, /confirmPasswordResetToken\(/);
  assert.match(page, /router\.replace\("\/login"\)/);
});

test("links sent before the switch (Firebase oobCode) still work", () => {
  assert.match(page, /searchParams\.get\("oobCode"\)/);
  assert.match(page, /confirmPasswordReset\(auth, code, password\)/);
});

test("only invalid or expired codes show the link error; other failures allow retry", () => {
  assert.match(page, /auth\/expired-action-code/);
  assert.match(page, /auth\/invalid-action-code/);
  assert.match(page, /Check your connection and try again\./);
});
