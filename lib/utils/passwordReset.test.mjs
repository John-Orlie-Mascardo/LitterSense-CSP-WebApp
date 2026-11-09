import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("./passwordReset.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: loaded, exports: loaded.exports, JSON });
const { requestPasswordReset, confirmPasswordResetToken } = loaded.exports;

test("requesting a reset posts the email to the LitterSense route", async () => {
  const calls = [];
  await requestPasswordReset("owner@example.com", async (url, init) => { calls.push([url, JSON.parse(init.body)]); return Response.json({ sent: true }); });
  assert.equal(calls[0][0], "/api/auth/password-reset");
  assert.equal(calls[0][1].email, "owner@example.com");
});

test("server errors come back as readable messages", async () => {
  await assert.rejects(
    requestPasswordReset("bad", async () => Response.json({ error: "Enter a valid email address." }, { status: 400 })),
    /Enter a valid email address\./,
  );
  await assert.rejects(
    confirmPasswordResetToken("t", "Test#2026cat", async () => Response.json({ error: "This reset link has expired or was already used. Request a new one." }, { status: 410 })),
    (error) => error.expired === true,
  );
});

test("confirming sends the token and new password", async () => {
  const calls = [];
  await confirmPasswordResetToken("tok", "Test#2026cat", async (url, init) => { calls.push([url, JSON.parse(init.body)]); return Response.json({ success: true }); });
  assert.equal(calls[0][0], "/api/auth/password-reset/confirm");
  assert.equal(calls[0][1].token, "tok");
  assert.equal(calls[0][1].password, "Test#2026cat");
});
