# Firestore Rules Manual Verification

Use these checks only with dedicated test accounts and test documents. The project does not use emulator rule tests because the team selected manual verification and Java is not installed in the development environment.

## Before testing

Prepare:

- Owner A and Owner B test accounts.
- An administrator test account with the Firebase custom claim `admin == true`.
- One known cat ID and session ID owned by Owner B.
- One known audit-log ID.
- One disposable device configuration and token.
- The public Firebase web configuration from local environment variables. These values identify the Firebase project; do not paste service-account credentials into a browser.

Phase 5 has replaced the legacy admin-side `deleteRequests` writes. Deploy these rules only in the same coordinated release as the completed application changes, then perform every check below; the rules were not deployed by the coding agent.

## Browser-console setup

Open the deployed app, open DevTools, and run the following after replacing only the placeholders. Use test-account passwords, never a service-account key.

```js
const version = "12.11.0";
const [{ initializeApp }, authSdk, firestoreSdk] = await Promise.all([
  import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
  import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
  import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`),
]);

const rulesApp = initializeApp({
  apiKey: "<NEXT_PUBLIC_FIREBASE_API_KEY>",
  authDomain: "<NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN>",
  projectId: "<NEXT_PUBLIC_FIREBASE_PROJECT_ID>",
  appId: "<NEXT_PUBLIC_FIREBASE_APP_ID>",
}, `rules-check-${Date.now()}`);

const rulesAuth = authSdk.getAuth(rulesApp);
const rulesDb = firestoreSdk.getFirestore(rulesApp);

async function expectDenied(label, operation) {
  try {
    await operation();
    console.error(`FAIL: ${label} unexpectedly succeeded`);
  } catch (error) {
    if (error?.code === "permission-denied") console.info(`PASS: ${label}`);
    else console.error(`FAIL: ${label}`, error);
  }
}

async function expectAllowed(label, operation) {
  try {
    await operation();
    console.info(`PASS: ${label}`);
  } catch (error) {
    console.error(`FAIL: ${label}`, error);
  }
}
```

## Owner isolation and status checks

Sign in as Owner A:

```js
await authSdk.signInWithEmailAndPassword(
  rulesAuth,
  "<OWNER_A_EMAIL>",
  "<OWNER_A_PASSWORD>",
);

const ownerAUid = rulesAuth.currentUser.uid;
const ownerBUid = "<OWNER_B_UID>";

await expectAllowed("Owner A reads own profile", () =>
  firestoreSdk.getDoc(firestoreSdk.doc(rulesDb, "users", ownerAUid))
);

await expectDenied("Owner A reads Owner B cat by ID", () =>
  firestoreSdk.getDoc(
    firestoreSdk.doc(rulesDb, "users", ownerBUid, "cats", "<OWNER_B_CAT_ID>"),
  )
);

await expectDenied("Owner A reads Owner B session by ID", () =>
  firestoreSdk.getDoc(
    firestoreSdk.doc(rulesDb, "users", ownerBUid, "sessions", "<OWNER_B_SESSION_ID>"),
  )
);

await expectDenied("Owner A sets processing status", () =>
  firestoreSdk.updateDoc(firestoreSdk.doc(rulesDb, "users", ownerAUid), {
    deletionStatus: "processing",
  })
);

await expectAllowed("Owner A submits one pending request", () =>
  firestoreSdk.updateDoc(firestoreSdk.doc(rulesDb, "users", ownerAUid), {
    deletionStatus: "pending",
    deletionRequestedAt: firestoreSdk.serverTimestamp(),
  })
);

await expectDenied("Owner A cannot submit a duplicate pending request", () =>
  firestoreSdk.updateDoc(firestoreSdk.doc(rulesDb, "users", ownerAUid), {
    deletionStatus: "pending",
    deletionRequestedAt: firestoreSdk.serverTimestamp(),
  })
);

await expectDenied("Owner A reads an audit entry", () =>
  firestoreSdk.getDoc(firestoreSdk.doc(rulesDb, "auditLogs", "<AUDIT_LOG_ID>"))
);

await expectDenied("Owner A reads Owner B device config", () =>
  firestoreSdk.getDoc(
    firestoreSdk.doc(rulesDb, "deviceConfigs", "<OWNER_B_CONFIG_TOKEN>"),
  )
);
```

Expected: the own-profile read and first `none` to `pending` transition succeed. Every denial check, including the duplicate request, reports `PASS` through `permission-denied`. Reset this disposable account through trusted server/Admin SDK code before reusing it; browser clients intentionally cannot reset the status.

## Administrator checks

Sign out, sign in as the claimed administrator, and force a fresh token before checking Firestore:

```js
await authSdk.signOut(rulesAuth);
await authSdk.signInWithEmailAndPassword(
  rulesAuth,
  "<ADMIN_EMAIL>",
  "<ADMIN_PASSWORD>",
);
await rulesAuth.currentUser.getIdToken(true);

await expectAllowed("Admin reads Owner B cat", () =>
  firestoreSdk.getDoc(
    firestoreSdk.doc(rulesDb, "users", "<OWNER_B_UID>", "cats", "<OWNER_B_CAT_ID>"),
  )
);

await expectAllowed("Admin reads audit entry", () =>
  firestoreSdk.getDoc(firestoreSdk.doc(rulesDb, "auditLogs", "<AUDIT_LOG_ID>"))
);

await expectDenied("Browser admin cannot write audit entries", () =>
  firestoreSdk.setDoc(firestoreSdk.doc(rulesDb, "auditLogs", "manual-test"), {
    action: "invalid_client_write",
  })
);

await expectDenied("Browser admin cannot modify Owner B cat", () =>
  firestoreSdk.updateDoc(
    firestoreSdk.doc(rulesDb, "users", "<OWNER_B_UID>", "cats", "<OWNER_B_CAT_ID>"),
    { name: "Unauthorized browser edit" },
  )
);
```

Expected: both reads succeed and both writes are denied.

## Device compatibility checks

The ESP32 does not write directly through browser Firestore rules. It reads its sanitized provisioning response from `/api/device-config/{configToken}` and writes sensor data through `/api/sensors`; those server routes use service-account credentials.

After the matching application and rules are deployed:

1. Request `/api/device-config/<TEST_CONFIG_TOKEN>` and confirm HTTP 200 contains the expected device name and Wi-Fi configuration.
2. Confirm an anonymous direct Firestore read of `deviceConfigs/<TEST_CONFIG_TOKEN>` is denied.
3. Send one safe heartbeat from a dedicated test device through `/api/sensors` using its normal `x-device-config-token` header.
4. Confirm the response succeeds and `users/<OWNER_UID>/deviceState/current` updates.
5. Complete one disposable RFID test visit and confirm its session and summary writes still appear once.

These device writes use the server identity and therefore must continue working after the client rules are tightened.

## Deploy command

Run only after Phase 5 is deployed and the manual test fixtures are ready:

```text
firebase deploy --only firestore:rules
```

Deployment order matters: deploying these rules before the matching deletion-request application code will block the current legacy request, approve, and reject client operations.
