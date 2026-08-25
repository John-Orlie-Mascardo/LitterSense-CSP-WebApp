# Abnormal Behavior SMS Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one formal iProgSMS alert to an opted-in owner's saved Philippine number for each real abnormal sensor session.

**Architecture:** The existing server-side `POST /api/sensors` ingestion route remains the source of truth. It passes newly recorded abnormal-session IDs to a focused SMS orchestrator that reads the owner profile and preference, calls iProgSMS with a server-only token, and writes a deduplication/delivery record to Firestore without affecting sensor persistence.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Firebase/Firestore REST, native `fetch`, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-25-sms-abnormal-alerts-design.md`

## Global Constraints

- Read the provider credential only from `IPROGSMS_API_TOKEN`; never add `NEXT_PUBLIC_` or expose the token in logs, responses, Firestore, or committed files.
- Send only to valid Philippine mobile numbers normalized to `639XXXXXXXXX`.
- Use this exact message: `LitterSense alert: Abnormal behavior was detected for {cat}. Observe your cat and consult a veterinarian if it persists. This alert is not a diagnosis.`
- Do not include the copied `&#x20;` entity.
- Default `smsAbnormalAlerts` to `false` and require explicit owner opt-in.
- Never roll back or fail a sensor sync because SMS delivery fails.
- Do not retry failed or uncertain sends automatically in this version.
- Add no dependencies.

---

## File Map

- Create `lib/utils/iprogsms.ts`: message construction, PH number normalization, and the iProgSMS HTTP boundary.
- Create `lib/utils/iprogsms.test.cjs`: executable provider-boundary unit tests.
- Create `lib/utils/abnormalSmsAlert.ts`: Firestore preference/profile lookup, deduplication, provider orchestration, and safe delivery records.
- Create `lib/utils/abnormalSmsAlert.test.cjs`: orchestration tests using an in-memory Firestore client double and controlled sender.
- Modify `app/api/sensors/route.ts`: collect only newly recorded abnormal sessions and invoke the orchestrator after sensor data is committed.
- Modify `lib/utils/sensorSync.ts`: expose the tested conversion from an anomalous write plan to an SMS candidate.
- Modify `lib/interfaces/UserSettings.ts`: add `smsAbnormalAlerts` to notification settings.
- Modify `lib/hooks/useSettings.ts`: default, load, and persist the new preference through the existing generic update function.
- Modify `app/dashboard/settings/page.tsx`: add the opt-in toggle and phone guidance.
- Modify `app/dashboard/settings/page.ui.test.mjs`: cover the visible setting and disabled-without-PH-number behavior.
- Modify `lib/utils/deleteUserData.ts` and `app/api/admin/delete-user/route.ts`: delete `smsAlerts` with the rest of an account's data.

---

### Task 1: iProgSMS Boundary

**Files:**
- Create: `lib/utils/iprogsms.ts`
- Create: `lib/utils/iprogsms.test.cjs`

**Interfaces:**
- Produces: `buildAbnormalSmsMessage(catName: string): string`
- Produces: `normalizeIprogSmsPhone(phoneNumber: unknown): string | null`
- Produces: `sendIprogSms(input: { apiToken: string; phoneNumber: string; message: string; fetchImpl?: typeof fetch }): Promise<{ messageId: string }>`

- [ ] **Step 1: Write the failing provider-boundary tests**

Create `lib/utils/iprogsms.test.cjs` using the repository's TypeScript transpilation pattern. Assert these literal outcomes:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/iprogsms.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const testModule = { exports: {} };
new Function("exports", "module", compiled.outputText)(testModule.exports, testModule);
const { buildAbnormalSmsMessage, normalizeIprogSmsPhone, sendIprogSms } = testModule.exports;

test("builds the approved formal alert message", () => {
  assert.equal(
    buildAbnormalSmsMessage("Mochi"),
    "LitterSense alert: Abnormal behavior was detected for Mochi. Observe your cat and consult a veterinarian if it persists. This alert is not a diagnosis.",
  );
});

test("normalizes supported Philippine mobile formats", () => {
  assert.equal(normalizeIprogSmsPhone("0917 123 4567"), "639171234567");
  assert.equal(normalizeIprogSmsPhone("+639171234567"), "639171234567");
  assert.equal(normalizeIprogSmsPhone("639171234567"), "639171234567");
});

test("rejects non-Philippine and malformed numbers", () => {
  assert.equal(normalizeIprogSmsPhone("+14155552671"), null);
  assert.equal(normalizeIprogSmsPhone("123"), null);
  assert.equal(normalizeIprogSmsPhone(undefined), null);
});

test("queues JSON through iProgSMS without placing the token in the URL", async () => {
  let capturedUrl = "";
  let capturedInit;
  const fetchImpl = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({ status: 200, message_id: "iSms-123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await sendIprogSms({
    apiToken: "secret-token",
    phoneNumber: "639171234567",
    message: "Alert",
    fetchImpl,
  });

  assert.equal(capturedUrl, "https://www.iprogsms.com/api/v1/sms_messages");
  assert.equal(capturedUrl.includes("secret-token"), false);
  assert.deepEqual(JSON.parse(capturedInit.body), {
    api_token: "secret-token",
    phone_number: "639171234567",
    message: "Alert",
  });
  assert.deepEqual(result, { messageId: "iSms-123" });
});

test("returns a safe error when iProgSMS rejects a send", async () => {
  const fetchImpl = async () => new Response(
    JSON.stringify({ status: 500, message: "Invalid Token" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    sendIprogSms({ apiToken: "secret-token", phoneNumber: "639171234567", message: "Alert", fetchImpl }),
    /^Error: iProgSMS rejected the message\.$/,
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test lib/utils/iprogsms.test.cjs`

Expected: FAIL because `iprogsms.ts` does not exist.

- [ ] **Step 3: Implement the minimal provider boundary**

Create `lib/utils/iprogsms.ts` with:

```ts
const IPROGSMS_SEND_URL = "https://www.iprogsms.com/api/v1/sms_messages";

export const buildAbnormalSmsMessage = (catName: string) =>
  `LitterSense alert: Abnormal behavior was detected for ${catName.trim() || "your cat"}. Observe your cat and consult a veterinarian if it persists. This alert is not a diagnosis.`;

export const normalizeIprogSmsPhone = (phoneNumber: unknown) => {
  if (typeof phoneNumber !== "string") return null;
  const compact = phoneNumber.replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("+63")
    ? compact.slice(1)
    : compact.startsWith("09")
      ? `63${compact.slice(1)}`
      : compact;
  return /^639\d{9}$/.test(normalized) ? normalized : null;
};

export async function sendIprogSms({
  apiToken,
  phoneNumber,
  message,
  fetchImpl = fetch,
}: {
  apiToken: string;
  phoneNumber: string;
  message: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(IPROGSMS_SEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_token: apiToken,
      phone_number: phoneNumber,
      message,
    }),
    signal: AbortSignal.timeout(5000),
  });
  const payload = await response.json().catch(() => ({})) as {
    status?: number | string;
    message_id?: string;
  };

  if (!response.ok || payload.status !== 200 || !payload.message_id) {
    throw new Error("iProgSMS rejected the message.");
  }

  return { messageId: payload.message_id };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test lib/utils/iprogsms.test.cjs`

Expected: 5 tests pass.

- [ ] **Step 5: Commit the provider boundary**

```bash
git add lib/utils/iprogsms.ts lib/utils/iprogsms.test.cjs
git commit -m "feat: add iprogsms server boundary"
```

---

### Task 2: Firestore SMS Alert Orchestration

**Files:**
- Create: `lib/utils/abnormalSmsAlert.ts`
- Create: `lib/utils/abnormalSmsAlert.test.cjs`

**Interfaces:**
- Consumes: `buildAbnormalSmsMessage`, `normalizeIprogSmsPhone`, and `sendIprogSms` from Task 1.
- Produces: `AbnormalSmsCandidate = { sessionId: string; catId: string }`
- Produces: `processAbnormalSmsAlerts(input: { client: Pick<FirestoreRestClient, "getDocument" | "createSetWrite" | "commit">; ownerId: string; candidates: AbnormalSmsCandidate[]; apiToken: string; now?: Date; sendSms?: typeof sendIprogSms }): Promise<void>`

- [ ] **Step 1: Write failing orchestration tests**

Create a small in-memory client double whose `documents` map is read by `getDocument`, whose `createSetWrite` returns `{ path, data }`, and whose `commit` stores those writes. Test these behaviors with literal documents:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

function loadTs(path, requireImpl = require) {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function("require", "exports", "module", compiled.outputText)(
    requireImpl,
    loaded.exports,
    loaded,
  );
  return loaded.exports;
}

const iprogsms = loadTs("lib/utils/iprogsms.ts");
const { processAbnormalSmsAlerts } = loadTs(
  "lib/utils/abnormalSmsAlert.ts",
  (id) => id === "./iprogsms" ? iprogsms : require(id),
);

function createClient(initial) {
  const documents = new Map(Object.entries(initial));
  return {
    documents,
    async getDocument(path) {
      const data = documents.get(path);
      return data ? { id: path.split("/").at(-1), path, data } : null;
    },
    createSetWrite(path, data, options) {
      return { path, data, options };
    },
    async commit(writes) {
      for (const write of writes) {
        if (write.options?.exists === false && documents.has(write.path)) {
          throw new Error("document already exists");
        }
        documents.set(write.path, write.data);
      }
    },
  };
}

test("queues one alert and records the provider message id", async () => {
  const client = createClient({
    "users/owner-1": { phoneNumber: "+639171234567", phoneCountryCode: "+63" },
    "users/owner-1/settings/notifications": { smsAbnormalAlerts: true },
    "users/owner-1/cats/cat-1": { name: "Mochi" },
  });
  const sends = [];

  await processAbnormalSmsAlerts({
    client,
    ownerId: "owner-1",
    candidates: [{ sessionId: "session-1", catId: "cat-1" }],
    apiToken: "secret-token",
    now: new Date("2026-08-25T10:00:00.000Z"),
    sendSms: async (input) => {
      sends.push(input);
      return { messageId: "iSms-123" };
    },
  });

  assert.equal(sends.length, 1);
  assert.equal(sends[0].phoneNumber, "639171234567");
  assert.equal(client.documents.get("users/owner-1/smsAlerts/session-1").status, "queued");
  assert.equal(client.documents.get("users/owner-1/smsAlerts/session-1").providerMessageId, "iSms-123");
});

test("does not send when SMS alerts are disabled", async () => {
  const client = createClient({
    "users/owner-1": { phoneNumber: "+639171234567" },
    "users/owner-1/settings/notifications": { smsAbnormalAlerts: false },
  });
  let sendCount = 0;
  await processAbnormalSmsAlerts({
    client,
    ownerId: "owner-1",
    candidates: [{ sessionId: "session-1", catId: "cat-1" }],
    apiToken: "secret-token",
    sendSms: async () => { sendCount += 1; return { messageId: "unexpected" }; },
  });
  assert.equal(sendCount, 0);
});

test("does not resend a session with an existing alert record", async () => {
  const client = createClient({
    "users/owner-1": { phoneNumber: "+639171234567" },
    "users/owner-1/settings/notifications": { smsAbnormalAlerts: true },
    "users/owner-1/smsAlerts/session-1": { status: "queued" },
  });
  let sendCount = 0;
  await processAbnormalSmsAlerts({
    client,
    ownerId: "owner-1",
    candidates: [{ sessionId: "session-1", catId: "cat-1" }],
    apiToken: "secret-token",
    sendSms: async () => { sendCount += 1; return { messageId: "unexpected" }; },
  });
  assert.equal(sendCount, 0);
});

test("records a skipped alert when the server token is missing", async () => {
  const client = createClient({
    "users/owner-1": { phoneNumber: "+639171234567" },
    "users/owner-1/settings/notifications": { smsAbnormalAlerts: true },
    "users/owner-1/cats/cat-1": { name: "Mochi" },
  });
  let sendCount = 0;
  await processAbnormalSmsAlerts({
    client,
    ownerId: "owner-1",
    candidates: [{ sessionId: "session-1", catId: "cat-1" }],
    apiToken: "",
    sendSms: async () => { sendCount += 1; return { messageId: "unexpected" }; },
  });
  assert.equal(sendCount, 0);
  assert.equal(client.documents.get("users/owner-1/smsAlerts/session-1").status, "skipped");
  assert.equal(
    client.documents.get("users/owner-1/smsAlerts/session-1").error,
    "SMS service is not configured.",
  );
});

test("records a safe failure without rejecting sensor processing", async () => {
  const client = createClient({
    "users/owner-1": { phoneNumber: "+639171234567" },
    "users/owner-1/settings/notifications": { smsAbnormalAlerts: true },
    "users/owner-1/cats/cat-1": { name: "Mochi" },
  });
  await processAbnormalSmsAlerts({
    client,
    ownerId: "owner-1",
    candidates: [{ sessionId: "session-1", catId: "cat-1" }],
    apiToken: "secret-token",
    sendSms: async () => { throw new Error("iProgSMS rejected the message."); },
  });
  const alert = client.documents.get("users/owner-1/smsAlerts/session-1");
  assert.equal(alert.status, "failed");
  assert.equal(alert.error, "iProgSMS rejected the message.");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test lib/utils/abnormalSmsAlert.test.cjs`

Expected: FAIL because `abnormalSmsAlert.ts` does not exist.

- [ ] **Step 3: Implement the orchestrator**

Implement `processAbnormalSmsAlerts` with this exact flow:

```ts
const profile = await client.getDocument(`users/${ownerId}`);
const settings = await client.getDocument(`users/${ownerId}/settings/notifications`);
if (settings?.data.smsAbnormalAlerts !== true || candidates.length === 0) return;

const phoneNumber = normalizeIprogSmsPhone(profile?.data.phoneNumber);
for (const candidate of candidates) {
  const alertPath = `users/${ownerId}/smsAlerts/${candidate.sessionId}`;
  if (await client.getDocument(alertPath)) continue;

  const cat = await client.getDocument(`users/${ownerId}/cats/${candidate.catId}`);
  const catName = typeof cat?.data.name === "string" ? cat.data.name : "your cat";
  const createdAt = now.toISOString();
  const baseRecord = { catId: candidate.catId, createdAt, updatedAt: createdAt };

  if (!apiToken || !phoneNumber) {
    await client.commit([client.createSetWrite(alertPath, {
      ...baseRecord,
      status: "skipped",
      error: apiToken ? "A valid Philippine phone number is required." : "SMS service is not configured.",
    }, { exists: false })]);
    continue;
  }

  try {
    const result = await sendSms({
      apiToken,
      phoneNumber,
      message: buildAbnormalSmsMessage(catName),
    });
    await client.commit([client.createSetWrite(alertPath, {
      ...baseRecord,
      status: "queued",
      providerMessageId: result.messageId,
    }, { exists: false })]);
  } catch (error) {
    await client.commit([client.createSetWrite(alertPath, {
      ...baseRecord,
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 200) : "SMS request failed.",
    }, { exists: false })]);
  }
}
```

Use `now = new Date()` and `sendSms = sendIprogSms` defaults in the public function signature. Do not log the provider input.

- [ ] **Step 4: Run the orchestration tests and verify GREEN**

Run: `node --test lib/utils/abnormalSmsAlert.test.cjs`

Expected: 5 tests pass.

- [ ] **Step 5: Commit the orchestrator**

```bash
git add lib/utils/abnormalSmsAlert.ts lib/utils/abnormalSmsAlert.test.cjs
git commit -m "feat: orchestrate abnormal session sms alerts"
```

---

### Task 3: Sensor-Ingestion Trigger

**Files:**
- Modify: `app/api/sensors/route.ts`
- Modify: `lib/utils/sensorSync.ts`
- Test: `lib/utils/sensorSync.test.mjs`

**Interfaces:**
- Consumes: `AbnormalSmsCandidate` and `processAbnormalSmsAlerts` from Task 2.
- Produces: no new public API; `POST /api/sensors` retains its current response shape.

- [ ] **Step 1: Add failing anomaly-candidate tests**

Load a new `getAbnormalSmsCandidate` export in `lib/utils/sensorSync.test.mjs`, then add:

```js
test("builds an SMS candidate only for an abnormal write plan", () => {
  const abnormalPlan = buildVisitWritePlan({
    userId: "owner-1",
    catId: "cat-1",
    configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
    event: normalizeSensorSyncRequest({
      events: [{
        eventId: "abnormal-1",
        lastSessionStatus: "NO_EXIT_TIMEOUT",
        lastSessionDurationMs: 900000,
        rfidCard: "00967D97",
      }],
    }, new Date("2026-08-25T10:00:00.000Z")).events[0],
    sessionId: "session-abnormal",
    serverNow: new Date("2026-08-25T10:00:00.000Z"),
  });
  const normalPlan = buildVisitWritePlan({
    userId: "owner-1",
    catId: "cat-1",
    configToken: "cfg_abcdefghijklmnopqrstuvwxyz",
    event: normalizeSensorSyncRequest({
      events: [{
        eventId: "normal-1",
        lastSessionStatus: "NORMAL",
        lastSessionDurationMs: 120000,
        rfidCard: "00967D97",
      }],
    }, new Date("2026-08-25T10:00:00.000Z")).events[0],
    sessionId: "session-normal",
    serverNow: new Date("2026-08-25T10:00:00.000Z"),
  });

  assert.deepEqual(
    getAbnormalSmsCandidate(abnormalPlan, "session-abnormal"),
    { sessionId: "session-abnormal", catId: "cat-1" },
  );
  assert.equal(getAbnormalSmsCandidate(normalPlan, "session-normal"), null);
});
```

- [ ] **Step 2: Run the sensor-sync test**

Run: `node --test lib/utils/sensorSync.test.mjs`

Expected: FAIL because `getAbnormalSmsCandidate` is not defined.

- [ ] **Step 3: Implement the tested candidate conversion**

Add to `lib/utils/sensorSync.ts`:

```ts
export const getAbnormalSmsCandidate = (
  plan: VisitWritePlan,
  sessionId: string,
) => plan.sessionData.anomaly === true
  ? { sessionId, catId: String(plan.sessionData.catId) }
  : null;
```

Run: `node --test lib/utils/sensorSync.test.mjs`

Expected: all sensor-sync tests pass.

- [ ] **Step 4: Wire only newly recorded abnormal sessions into SMS**

In `processSensorEvents`, initialize `const smsCandidates: AbnormalSmsCandidate[] = [];`. Immediately after the successful Firestore session commit, append only when `plan.sessionData.anomaly === true`:

```ts
const smsCandidate = getAbnormalSmsCandidate(plan, sessionId);
if (smsCandidate) smsCandidates.push(smsCandidate);
```

Return `smsCandidates` with the existing result. In `handleSensorSync`, destructure it, finish the existing sensor-snapshot commit, then invoke:

```ts
await processAbnormalSmsAlerts({
  client,
  ownerId,
  candidates: smsCandidates,
  apiToken: process.env.IPROGSMS_API_TOKEN ?? "",
});
```

Wrap only this call in `try/catch` and log `[sms-alert] Processing failed.` without logging the token, phone number, provider URL, or request body. Keep `buildSyncResponse` unchanged so device responses expose no SMS details.

- [ ] **Step 5: Run focused server checks**

Run:

```bash
node --test lib/utils/sensorSync.test.mjs lib/utils/iprogsms.test.cjs lib/utils/abnormalSmsAlert.test.cjs
npx tsc --noEmit --pretty false
npx eslint app/api/sensors/route.ts lib/utils/sensorSync.ts lib/utils/iprogsms.ts lib/utils/abnormalSmsAlert.ts
```

Expected: all tests pass, TypeScript exits 0, and focused lint exits 0.

- [ ] **Step 6: Commit sensor integration**

```bash
git add app/api/sensors/route.ts lib/utils/sensorSync.ts lib/utils/sensorSync.test.mjs
git commit -m "feat: trigger sms for abnormal sensor sessions"
```

---

### Task 4: Owner SMS Opt-In Setting

**Files:**
- Modify: `lib/interfaces/UserSettings.ts`
- Modify: `lib/hooks/useSettings.ts`
- Modify: `app/dashboard/settings/page.tsx`
- Modify: `app/dashboard/settings/page.ui.test.mjs`

**Interfaces:**
- Produces: `UserSettings["notifications"]["smsAbnormalAlerts"]: boolean`
- Consumes: the existing `updateNotificationSetting` generic persistence path and `savedPhoneNumber` profile state.

- [ ] **Step 1: Add the failing settings UI check**

Append to `app/dashboard/settings/page.ui.test.mjs`:

```js
test("SMS abnormal alerts require a saved Philippine phone number", () => {
  const section = sourceBetween(
    "{/* Notifications Section */}",
    "{/* Data & Privacy Section */}",
  );

  assert.match(section, /SMS Abnormal Behavior Alerts/);
  assert.match(section, /settings\.notifications\.smsAbnormalAlerts/);
  assert.match(section, /updateNotificationSetting\("smsAbnormalAlerts", v\)/);
  assert.match(section, /disabled=\{!savedPhoneNumber\.startsWith\("\+63"\)\}/);
  assert.match(section, /Add a Philippine phone number in Edit Profile/);
});
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `node --test app/dashboard/settings/page.ui.test.mjs`

Expected: FAIL because the SMS setting is missing.

- [ ] **Step 3: Add the typed setting and persistence loading**

Add `smsAbnormalAlerts: boolean` after `healthAlerts` in `UserSettings.notifications`. Add `smsAbnormalAlerts: false` to `defaultSettings.notifications`. In `pickNotificationSettings`, copy it only when it is a boolean:

```ts
if (typeof value.smsAbnormalAlerts === "boolean") {
  next.smsAbnormalAlerts = value.smsAbnormalAlerts;
}
```

No new save function is needed; the existing generic `updateNotificationSetting` already merges one notification field into Firestore.

- [ ] **Step 4: Add the native settings row**

Import `MessageSquareText` from `lucide-react`. Place this row directly after Health Alerts:

```tsx
<div className="border-t border-litter-border">
  <SettingsRow
    icon={MessageSquareText}
    label="SMS Abnormal Behavior Alerts"
    description={
      savedPhoneNumber.startsWith("+63")
        ? "Send one SMS when an abnormal session is detected"
        : "Add a Philippine phone number in Edit Profile"
    }
    control={
      <Toggle
        checked={settings.notifications.smsAbnormalAlerts}
        disabled={!savedPhoneNumber.startsWith("+63")}
        onChange={(v) => updateNotificationSetting("smsAbnormalAlerts", v)}
      />
    }
  />
</div>
```

- [ ] **Step 5: Run settings checks**

Run:

```bash
node --test app/dashboard/settings/page.ui.test.mjs
npx tsc --noEmit --pretty false
npx eslint app/dashboard/settings/page.tsx lib/hooks/useSettings.ts lib/interfaces/UserSettings.ts
```

Expected: UI tests pass, TypeScript exits 0, and focused lint exits 0.

- [ ] **Step 6: Commit the opt-in setting**

```bash
git add app/dashboard/settings/page.tsx app/dashboard/settings/page.ui.test.mjs lib/hooks/useSettings.ts lib/interfaces/UserSettings.ts
git commit -m "feat: add abnormal sms alert preference"
```

---

### Task 5: Account Cleanup and Final Verification

**Files:**
- Modify: `lib/utils/deleteUserData.ts`
- Modify: `app/api/admin/delete-user/route.ts`

**Interfaces:**
- Consumes: `users/{uid}/smsAlerts/{sessionId}` records from Task 2.
- Produces: account deletion removes SMS delivery records.

- [ ] **Step 1: Extend both deletion paths**

Add `"smsAlerts"` to `nestedCollections` in `lib/utils/deleteUserData.ts`. Add this exact server-side deletion beside the existing user subcollection deletions:

```ts
await deleteCollection(db, `users/${userId}/smsAlerts`);
```

- [ ] **Step 2: Run complete verification**

Run:

```bash
node --test lib/utils/iprogsms.test.cjs lib/utils/abnormalSmsAlert.test.cjs lib/utils/sensorSync.test.mjs app/dashboard/settings/page.ui.test.mjs
npx tsc --noEmit --pretty false
npx eslint app/api/sensors/route.ts app/dashboard/settings/page.tsx app/api/admin/delete-user/route.ts lib/utils/iprogsms.ts lib/utils/abnormalSmsAlert.ts lib/utils/deleteUserData.ts lib/hooks/useSettings.ts lib/interfaces/UserSettings.ts
npm run build
git diff --check
```

Expected: all focused tests pass, TypeScript exits 0, focused lint exits 0, the Next.js production build exits 0, and `git diff --check` exits 0. Project-wide lint may still report the previously existing unescaped apostrophe in `app/admin/requests/page.tsx`; do not modify that unrelated file.

- [ ] **Step 3: Configure locally without exposing the token**

The owner adds the credential directly to ignored `.env.local`:

```env
IPROGSMS_API_TOKEN=<the token copied from the private iProgSMS dashboard>
```

Do not print, read back, commit, or screenshot the token. Restart the Next.js server after adding it.

- [ ] **Step 4: Perform one controlled live delivery check**

With a funded iProgSMS account, an enabled SMS setting, a saved `+63` phone number, and a registered test cat, submit one abnormal test session through the existing authenticated device sync path. Verify:

- exactly one SMS is queued for the session;
- `users/{uid}/smsAlerts/{sessionId}.status` is `queued`;
- `providerMessageId` is present;
- replaying the same device event does not consume another SMS credit;
- the device sync response and server logs contain no API token.

- [ ] **Step 5: Commit cleanup**

```bash
git add lib/utils/deleteUserData.ts app/api/admin/delete-user/route.ts
git commit -m "chore: clean up sms records with accounts"
```
