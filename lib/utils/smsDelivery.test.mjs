import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";

function load(file, imports, extra = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: (name) => imports[name], Response, Request, Date, URL, Intl, Buffer, AbortSignal, ...extra });
  return loaded.exports;
}
const account = { sms_enabled: true, sms_phone_number: "+639171234567", notifications: { healthAlerts: true }, cats: [{ id: "cat-a" }] };
const record = { id: "alert-a", owner_id: "owner-a", cat_id: "cat-a", reason: "Extended duration", message: "Test alert" };

test("SMS sender honors gates, current recipient, preferences and quiet hours", async () => {
  let calls = 0;
  const helper = load("./smsDelivery.ts", { "./smsAccountSync": { smsStoreRequest: async () => { calls++; } } }, { process: { env: { SMS_SENDING_ENABLED: "false" } } });
  assert.equal((await helper.processSmsOutbox()).enabled, false);
  assert.equal(calls, 0);
  assert.equal(helper.smsDeliveryDecision(account, record), "send");
  assert.equal(helper.smsDeliveryDecision({ ...account, sms_enabled: false }, record), "cancel");
  assert.equal(helper.smsDeliveryDecision({ ...account, cats: [] }, record), "cancel");
  assert.equal(helper.smsDeliveryDecision({ ...account, notifications: { perCat: [{ catId: "cat-a", healthAlerts: false }] } }, record), "cancel");
  const quiet = { ...account, notifications: { quietHours: { enabled: true, from: "22:00", to: "07:00" } } };
  assert.equal(helper.smsDeliveryDecision(quiet, record, new Date("2026-10-01T15:00:00Z")), "defer");
  assert.equal(helper.smsDeliveryDecision(quiet, record, new Date("2026-10-02T02:00:00Z")), "send");
  assert.equal(helper.providerDeliveryStatus("pending"), "accepted");
  assert.equal(helper.providerDeliveryStatus("completed"), "delivered");
});

test("provider acceptance is reconciled, timeout becomes unknown and never blindly retried", async () => {
  for (const mode of ["accepted", "timeout", "deleted", "optout"]) {
    let claimed = false;
    let sends = 0;
    const updates = [];
    const helper = load("./smsDelivery.ts", {
      "@/lib/configs/firebase-admin": { getAdminAuth: () => ({ getUser: async () => { if (mode === "deleted") throw { code: "auth/user-not-found" }; return { disabled: false }; } }) },
      "./smsAccountSync": { smsStoreRequest: async (path, init = {}) => {
        if (path === "rpc/claim_sms_outbox") { const rows = claimed ? [] : [record]; claimed = true; return Response.json(rows); }
        if (init.method === "PATCH") { updates.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); }
        if (path.includes("status=eq.sending")) return Response.json([{ sms_accounts: mode === "optout" ? { ...account, sms_enabled: false } : account }]);
        if (path.includes("status=eq.accepted")) return Response.json(mode === "accepted" ? [{ ...record, provider_message_id: "provider-1" }] : []);
        throw new Error(`Unexpected storage request ${path}`);
      } },
    }, { process: { env: { SMS_SENDING_ENABLED: "true", IPROGSMS_API_TOKEN: "hidden-test-token" } }, fetch: async (url, init) => {
      if (String(url).includes("/status")) return Response.json({ status: 200, message_status: "completed" });
      sends++;
      assert.equal(JSON.parse(init.body).phone_number, "639171234567");
      if (mode === "timeout") throw new Error("Timeout");
      return Response.json({ status: 200, message_id: "provider-1" });
    } });
    await helper.processSmsOutbox("owner-a");
    assert.equal(updates[0].status, mode === "accepted" ? "accepted" : mode === "timeout" ? "unknown" : "cancelled");
    if (mode === "accepted") assert.equal(updates[1].status, "delivered");
    await helper.processSmsOutbox("owner-a");
    assert.equal(sends, mode === "accepted" || mode === "timeout" ? 1 : 0);
  }
});

test("SMS settings enforce authenticated ownership; worker rejects a wrong or Unicode secret", async () => {
  let written;
  const settings = load("../../app/api/sms/settings/route.ts", {
    "@/lib/configs/firebase-admin": { getAdminAuth: () => ({ verifyIdToken: async (token) => { if (token !== "good") throw new Error(); return { uid: "owner-a" }; } }) },
    "@/lib/utils/smsAccountSync": { smsStoreRequest: async (_path, init) => { written = JSON.parse(init.body); return new Response(null, { status: 204 }); } },
  }, { process: { env: {} } });
  const post = (token, phone) => settings.POST(new Request("https://test/api/sms/settings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ ownerId: "owner-b", enabled: true, phone }) }));
  assert.equal((await post("bad", "09171234567")).status, 401);
  assert.equal((await post("good", "not-a-number")).status, 400);
  assert.equal((await post("good", "09171234567")).status, 200);
  assert.equal(written.p_owner_id, "owner-a");
  assert.equal(written.p_phone, "+639171234567");
  const worker = load("../../app/api/sms/process/route.ts", { "node:crypto": crypto, "@/lib/utils/smsDelivery": { processSmsOutbox: async () => ({ enabled: false }) } }, { process: { env: { SMS_PROCESS_SECRET: "aaaa" } } });
  for (const secret of ["wrong", "éééé"]) assert.equal((await worker.POST(new Request("https://test/api/sms/process", { method: "POST", headers: { Authorization: `Bearer ${secret}` } }))).status, 401);
  assert.equal((await worker.POST(new Request("https://test/api/sms/process", { method: "POST", headers: { Authorization: "Bearer aaaa" } }))).status, 200);
});
