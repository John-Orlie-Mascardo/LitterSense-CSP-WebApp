# Task 4: sensors, provisioning and camera

## Status

Implemented and tested locally. The shared operational switch remains **off** by default. No production migration/import, deployment, Git push or firmware upload was performed in this section. Firebase Authentication still verifies users; Task 5 must finish the remaining operational data paths before cutover.

## Changes by file

| File | Change |
| --- | --- |
| `lib/server/operationalStore.ts` | Restricted server credential lookup for provisioning tokens and camera IDs, validates stored ownership; documents the shared staged switch. |
| `lib/server/operationalCats.ts` | Device authority now comes from canonical imported config plus the owner's current config pointer. The old SMS mapping is a projection, rather than an authority prerequisite. |
| `lib/server/operationalDevices.ts` | Owner-scoped setup reads and atomic saves/token rotation. Rejects stale setup edits and another owner's credentials; validates name/SSID/password sizes. Projects the token into existing alert/snapshot mappings. |
| `app/api/device-provisioning/route.ts` | Authenticated setup API; derives the owner from Firebase Authentication, never the body. Reports database mode so the client keeps its existing path when the switch is off. |
| `app/api/device-config/[configToken]/route.ts` | Existing firmware URL reads canonical setup in primary mode, without initializing Firestore. Preserves response fields. Removes the token from the existing error log. |
| `lib/hooks/useDeviceProvisioning.ts` | Uses the authenticated setup API in primary mode; retains legacy saves otherwise, local setup edits and the existing hardware-reachable URL. Tracks the saved token separately from an unsaved regenerated token. |
| `app/api/sensors/route.ts` | Primary gas uploads resolve canonical ownership, save through the existing sensor snapshot RPC, and use the existing gas alert queue and SMS/push workers. Authenticated primary display reads canonical RFID state and current-token Supabase snapshots. Storage/queue failure returns an error without acknowledgement. Legacy gas fallback remains selected when the switch is off. |
| `lib/utils/sensorSnapshotStore.ts` | Optional current-token read of the same snapshot table with an owner join. Prevents an old device projection from supplying primary readings if cleanup is pending. Existing fallback RPC behavior is retained. |
| `lib/server/cameraCloud.ts` | Primary owner-camera lookup, atomic pairing/revocation, private-key verification and last-seen writes. Imported keys reconnect without re-pairing. |
| `app/api/camera/pair/route.ts` | Selects canonical pairing in primary mode; retains the same one-time pairing code format. |
| `app/api/camera/device-session/route.ts` | Selects canonical publisher authorization in primary mode; retains relay/ticket/TTL headers. The viewer session route uses the updated shared camera helper. |
| `lib/server/operationalRfid.test.mjs` | Adds camera, setup and gas tests using the actual foundation, account and sensor SQL in embedded PostgreSQL. Operational Firestore access is blocked. |
| `lib/server/cameraCloud.test.cjs`, `app/api/sensors/rfid.integration.test.mjs` | Explicit legacy-mode imports preserve the existing legacy-path tests. |
| `.env.example` | Clarifies the shared default-off operational gate and remaining migration prerequisites. |

## Preserved contracts and defaults

- Gas raw inputs, active-low detection, normalization and alert policies are unchanged: ammonia remains the Urine input and hydrogen sulfide remains the Stool input.
- Gas alert generation uses the existing `queueSensorSms` path and existing SMS/push workers; this section does not alter cooldowns, quiet hours or preferences. Gas payloads cannot create RFID visit records.
- Sensor freshness stays at **180 seconds**. Old/future readings do not become a fresh heartbeat. Missing/unavailable storage does not turn into a fabricated Clear result.
- Device setup tokens and camera credentials stay server-side/bearer credentials in their existing contracts. Ownership and current-pointer checks reject revoked credentials. Setup saves use revision checks and atomic commits; stale edits require refresh.
- Setup limits: device name **128 UTF-8 bytes**, SSID **32 UTF-8 bytes**, password **64 UTF-8 bytes**. Primary mode preserves password whitespace; legacy trimming is retained.
- Camera tickets retain the existing **300-second** lifetime. Previously issued tickets expire naturally; pairing revokes the old device's ability to request new tickets.
- No firmware, camera pins, LAN stream, camera relay/video transport or sensor state-machine changes were made. Manual phone setup remains `http://192.168.4.1/`.
- Token projection failures do not undo a confirmed setup save. They log a pending projection; ingestion repairs the current token mapping. Primary sensor reads use only the canonical current token even if old mapping removal is pending.

## Schema and import

No additional Task 4 SQL is required beyond the prepared Task 2 operational foundation and the existing account/sensor snapshot schema. The snapshot tables and RPCs are reused, not replaced with a separate fallback system.

Task 3's SMS-mapping authority prerequisite is superseded: canonical `deviceConfigs` and the owner's current pointer are now the authority. SMS mappings remain necessary projections for alert processing and are repaired after trusted ownership resolution.

Before enabling primary mode, verify the imported user records, device config pointers, Wi-Fi config, camera device IDs and key hashes, and existing alert accounts/settings. Missing camera credentials cannot be recreated from snapshots. Do not reset camera pairing silently or mark an incomplete import complete.

## Verification

- Full app suite: **317 passed, 0 failed**.
- Existing camera relay suite: **4 passed, 0 failed**.
- Lint: passed with no lint warnings.
- Source TypeScript check: passed. Generated Next.js build route validators were excluded from this source-only check.
- Database-backed tests cover setup ownership, stale edits, credential rotation, public firmware config contract, camera imported-key reconnect/revocation, gas active-low inputs, owner isolation, out-of-order receipts, stale/future snapshots, storage failure without acknowledgement and no Firestore operational calls.
- Existing suite still emits its previously observed Node module-format warning. This section did not change module packaging.

The build blockers recorded in Task 3 remain unresolved: default Turbopack CSS worker failure and the existing disallowed `normalizeSmsPhone` export in the SMS settings route. A passing source check is not a passing production build. Resolve and rerun the build gate in Task 6.

## Remaining acceptance work

After Task 5 and a verified import, use a controlled environment with primary mode enabled and operational Firestore reads/writes blocked while Firebase Authentication remains available:

1. Confirm gas and RFID heartbeats, original entry/exit and five-second registration flow.
2. Save setup, retrieve its firmware URL, rotate the token and confirm the old token is rejected. Check phone setup at `http://192.168.4.1/`.
3. Reconnect an already paired camera, open the live feed, then pair another camera and confirm old credentials cannot request new tickets.
4. Trigger Urine and Stool separately; verify real SMS and push delivery on the phone with LitterSense closed, respecting existing preferences/cooldowns.
5. Interrupt Supabase access: reads should show an error, uploads should receive no false acknowledgement, and device retries should recover without duplicate visits.

Browser acceptance, physical board behavior and actual notification arrival have not been verified for this staged primary mode. Continue with **Task 5: remaining operational data paths and coherent cutover**, then Task 6 full QA/release.
