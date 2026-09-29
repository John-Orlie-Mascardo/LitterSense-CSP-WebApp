# Vercel deployment

This app uses Next.js API routes and Firebase. Deploy it as **Next.js**, not a static export or Firebase Hosting site. Older architecture notes in README.md describe an earlier version.

## Project settings

- Root directory: repository root.
- Node.js: **24.x**, matching `package.json` and the tested local runtime.
- Install: `npm ci`.
- Build: `npm run check` (configured in `vercel.json`). It runs lint, all Node tests, then the production build including TypeScript checks.
- Keep the framework's default output directory. Do not set it to `public`, `out`, or `dist`.

Run `npm run check` locally before deploying. The lockfile includes security updates for Next.js, Firebase Admin, and their dependencies. The scoped UUID override patches gaxios 6's multipart boundary generator while retaining its CommonJS `v4()` API.

## Environment and Firebase

Use `.env.example` as the variable inventory. Enter actual values in Vercel's Production and Preview environment settings; `.env.local` is ignored by Git and is not uploaded automatically.

- Set the six `NEXT_PUBLIC_FIREBASE_*` web configuration values from the intended Firebase project. `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional. Public values are embedded at build time, so redeploy after changing them.
- Set **`FIREBASE_SERVICE_ACCOUNT_BASE64`** to base64-encoded service account JSON from the same project. This name works for both the Admin SDK and sensor ingestion. Never prefix it with `NEXT_PUBLIC_`.
- Set **`GEMINI_API_KEY`** for predictive health explanations. Keep it server-only.
- `FIREBASE_ADMIN_SERVICE_ACCOUNT`, `NEXT_PUBLIC_STREAM_URL`, and `IPROGSMS_API_TOKEN` are not read by the current application; copying them will not enable features.
- Add the deployed hostname to Firebase Authentication's authorized domains. Enable the intended email/password and Google sign-in providers.
- Create/configure the Firebase Storage bucket before enabling photo uploads. Deploy `firestore.rules` and `storage.rules` to the same project and verify access as a signed-in user. Vercel does not deploy Firebase rules.
- Prefer a separate Firebase project for Preview if previews must not write production data.

## Hardware after moving off localhost

RFID and gas/ultrasonic boards must POST to **`https://<production-host>/api/sensors`**, using their existing provisioning token in `x-device-config-token`. Update the firmware's webapp endpoint and trusted HTTPS certificate configuration. Changing webapp environment variables does not update firmware.

The boards must have internet access. A camera-created Wi-Fi network alone does not establish internet routing. Use the production hostname, not a changing Preview URL; Vercel Deployment Protection must permit device requests to this endpoint. The app still validates the provisioning token.

Signed-in dashboard requests read owner-scoped Firestore snapshots. Gas/ultrasonic uses `source: "gas-ultrasonic"` and a separate snapshot. Keep `ESP32_SENSOR_URL`, `ESP32_GAS_ULTRASONIC_URL`, and the local `NEXT_PUBLIC_DEVICE_CONFIG_ORIGIN` override out of Vercel. Vercel cannot poll `192.168.*`, loopback, or local mDNS hostnames.

The release must run with only the ESP32 boards; an always-on PC/gateway is not available. The current LAN camera proxy cannot provide remote viewing in that topology. A periodic JPEG upload path (camera to cloud storage, with authenticated owner-only reads) or a separate continuous-video service still needs to be selected and implemented. JPEG updates are not continuous video. Preserve the firmware's existing local `/stream` endpoint when adding cloud transport. The current camera proxy is a single shared endpoint without per-owner access control: do not connect a private camera feed to a public deployment until camera authorization is implemented.

## Verification before release

1. Deploy a Preview after supplying its environment variables; confirm build and function logs are clean.
2. Sign in with email and Google, reload a cat-detail URL directly, and check history, reports, and sign-out.
3. Upload a cat photo and owner photo and reload to confirm persistence.
4. Run one real RFID entry/removal/exit cycle. Confirm HTTP 200, matching `x-litersense-ack`, and the visit appearing under the correct owner and cat.
5. Confirm gas readings arrive independently and go offline when that board disconnects.
6. Test camera captures through its gateway and generate one predictive health explanation.

Local automated checks do not establish deployed authentication, physical-device sync, uploads, or camera reachability. AI analysis now uses a Firestore transaction to enforce one active request and a 15-second success cooldown per account across Vercel instances. Failed requests release the lease without consuming the cooldown; a crashed worker's lease expires after 45 seconds. The `predictiveHealthLimits` collection is server-only under the existing default-deny Firestore rules. This cooldown is not a daily spending cap.

## Read-only checks on 2026-09-28

- `npm run check` passed: lint, 195 tests, TypeScript, and production build. npm reported zero dependency vulnerabilities after installation.
- The built server passed 20 HTTP smoke checks with `VERCEL=1`: page delivery (including a direct cat-detail URL), invalid/unauthenticated API responses, and prompt camera-offline responses. These were HTTP checks, not signed-in browser interaction tests.
- Local Firebase service account parses and matches the browser project; authenticated Firestore read succeeded.
- Configured Gemini model metadata returned HTTP 200. Two actual synthetic generation attempts returned HTTP 503: the provider reported high demand. Successful generation remains unverified.
- Configured Firebase Storage endpoint returned HTTP 404. Photo upload remains a release blocker until the bucket is provisioned/configured and a real upload succeeds.
- Vercel project settings, deployed login, and physical hardware were not verified.

## Setup progress and access blockers

- Google sign-in and email sign-in are enabled. Firebase already authorizes `litter-sense-csp-web-app.vercel.app`; deployed Firestore rules match this repository exactly.
- A live Firestore test verified shared AI lease exclusion, failed-request recovery, and success cooldown. Its temporary test document was removed afterward.
- Firebase Storage API is disabled. The service account was denied permission to enable `firebasestorage.googleapis.com`. A project owner must enable Storage in Firebase Console and create/configure the bucket; complete Blaze billing if prompted. No billing plan was activated and no bucket was created.
- Billing status could not be read because Cloud Billing API is disabled; do not assume the current billing plan.
- The Vercel connector authenticated but returned no accessible teams. Its project tools require a team ID. Browser control was also unavailable. The correct connected Vercel account/team is needed before environment settings or deployment can be changed.
- No firmware was changed or uploaded during this setup pass. The camera delivery choice and deployable hostname must be settled first.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [function limits](https://vercel.com/docs/functions/limitations), [Firebase Admin 14 migration changes](https://github.com/firebase/firebase-admin-node/releases/tag/v14.0.0).
