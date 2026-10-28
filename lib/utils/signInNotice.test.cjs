const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/signInNotice.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", "fetch", compiled.outputText);
fn(testModule.exports, testModule, undefined);

const { requestSignInNotice } = testModule.exports;

test("posts the ID token and browser time zone to the sign-in notice route", async () => {
  const calls = [];
  await requestSignInNotice({ getIdToken: async () => "id-token" }, async (url, init) => {
    calls.push({ url, init });
    return new Response("{}");
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/auth/sign-in-notice");
  assert.equal(calls[0].init.headers.Authorization, "Bearer id-token");
  assert.equal(typeof JSON.parse(calls[0].init.body).timeZone, "string");
});

test("token or network failures never reject into the sign-in flow", async () => {
  await requestSignInNotice({ getIdToken: async () => { throw new Error("offline"); } }, async () => new Response("{}"));
  await requestSignInNotice({ getIdToken: async () => "id-token" }, async () => { throw new Error("offline"); });
});
