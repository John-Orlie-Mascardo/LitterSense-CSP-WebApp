import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

function load(path, imports, extra = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: (name) => imports[name], Response, Map, AbortSignal, process, ...extra });
  return loadedModule.exports;
}

test("SMS backup uses trusted owner records, hashes tokens, preserves backups on quota failure", async () => {
  let saved;
  const helper = load("./smsAccountSync.ts", { "node:crypto": crypto });
  const backup = helper.buildSmsAccountBackup("owner-a", { phoneNumber: "+639171234567", wifiPassword: "omit" }, { healthAlerts: false }, [{ id: "cat-a", data: { name: "Zeno" } }], [{ id: "cat-a", data: { rfidTag: "aa-bb" } }], { configToken: "secret-device", wifiPassword: "omit" });
  assert.equal(backup.p_cats[0].rfidTag, "AABB");
  assert.equal(backup.p_notifications.healthAlerts, false);
  assert.equal(backup.p_token_hash, crypto.createHash("sha256").update("secret-device").digest("hex"));
  assert.ok(!JSON.stringify(backup).includes("secret-device"));
  assert.ok(!JSON.stringify(backup).includes("wifiPassword"));
  assert.equal(helper.buildSmsAccountBackup("a", { phoneNumber: "bad" }, {}, [], [], {}).p_phone_number, "");
  assert.equal(helper.buildSmsAccountBackup("a", { phoneNumber: "+12025550123" }, {}, [], [], {}).p_phone_number, "");
  let quota = false;
  const client = {
    getDocument: async (path) => {
      if (quota) throw new Error("RESOURCE_EXHAUSTED");
      if (path === "users/owner-a") return { data: { phoneNumber: "+639171234567" } };
      return null;
    },
    listDocuments: async () => [],
  };
  const route = load("../../app/api/sms/sync/route.ts", {
    "@/lib/configs/firebase-admin": { getAdminAuth: () => ({ verifyIdToken: async (token) => { if (token !== "good") throw new Error(); return { uid: "owner-a" }; } }) },
    "@/lib/utils/firestoreRest": { getFirestoreRestClient: () => client },
    "@/lib/utils/smsAccountSync": { ...helper, saveSmsAccountBackup: async (value) => { saved = value; } },
  }, { process: { env: { SUPABASE_URL: "https://test", SUPABASE_SECRET_KEY: "test" } } });
  const request = (token) => new Request("https://test/api/sms/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ownerId: "other-owner" }) });
  assert.equal((await route.POST(request("bad"))).status, 401);
  assert.equal(saved, undefined);
  assert.equal((await route.POST(request("good"))).status, 200);
  assert.equal(saved.p_owner_id, "owner-a");
  const previous = saved;
  quota = true;
  assert.equal((await route.POST(request("good"))).status, 503);
  assert.equal(saved, previous);
});
