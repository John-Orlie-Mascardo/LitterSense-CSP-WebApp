# Task 3: Cat registration and RFID

## Status

Implementation and local verification completed. **Staged only:** `SUPABASE_RFID_PRIMARY_ENABLED` defaults to false. No production schema changes, live import, deployment, GitHub push, firmware edit or flash was performed in this section. Complete Tasks 4 and 5, review the import, and pass the final QA/cutover gates before enabling this in production.

Firebase Authentication still verifies account identity. Supabase uses the existing server-only REST transport and the additive operational records/atomic commit schema prepared in Task 2. Existing gas ingestion and fallback remain on their original path in this section.

## Changes by file

| File | Change |
| --- | --- |
| `lib/server/operationalStore.ts` | Reuses `smsStoreRequest`; owner-scoped reads, typed import decoding, preservation of unchanged timestamp markers, readiness gate and atomic revision checks with bounded retries. |
| `lib/server/operationalCats.ts` | Canonical catalog reads and create/update/delete operations; consistent catalog revision checks; duplicate tag names; verified scan consumed in the same transaction as registration; existing alert account cat projection updated without replacing phone/preferences/tokens. Validates imported device ownership and current provisioning token. |
| `lib/server/operationalRfid.ts` | Supabase enrollment start/read/cancel and reader proof ingestion; freshness/idle checks; existing five-second proof validator; completed/interrupted visit persistence; atomic visit summaries and snapshot counters; exact retry deduplication; unknown tags receive no visit acknowledgement. |
| `app/api/cats/route.ts` | Authenticated primary catalog and mutations under the staged switch; communicates primary mode to the client. |
| `app/api/rfid-enrollment/route.ts` | Routes enrollment through Supabase when enabled; preserves existing status, expiry, stale progress and error responses. |
| `app/api/sensors/route.ts` | Routes RFID uploads and authenticated RFID state reads through canonical records; preserves reader enrolment acknowledgement and event acknowledgement headers. Keeps the gas upload branch unchanged. Requires durable visit storage and alert queue success before acknowledging a visit. |
| `lib/utils/catHistoryReads.ts` | Reads canonical visits in primary mode, preserves filtering and pagination, and rejects cursors from another owner or database mode. |
| `lib/utils/rfidNotifications.ts` | Keeps the existing push outbox; stores RFID inbox entries in canonical records when enabled. A duplicate event can repair an inbox write interrupted after durable queueing. |
| `app/api/sms/sync/route.ts` | Avoids old Firestore catalog/account copying in primary RFID mode; repairs only the canonical cat projection. Full profile/settings migration remains Task 5. |
| `app/api/cat-backup/sync/route.ts`, `app/api/cat-backup/process/route.ts` | Pause old catalog copying and Supabase-to-Firestore visit recovery while the staged primary switch is enabled. |
| `lib/hooks/useCatBackup.ts` | Carries primary mode from the authenticated API while retaining existing owner isolation and polling. |
| `lib/contexts/CatContext.tsx` | Uses canonical cats/details/history; stops operational cat listeners and derived Firestore writes once primary mode is known. Retains legacy subscriptions when the catalog API fails in legacy mode. |
| `lib/hooks/useSessionHistory.ts` | Uses authenticated history API and polling in primary mode; stops the Firestore existence query once mode is known. |
| `.env.example` | Adds the default-off server switch and import prerequisite comment. |
| `lib/server/operationalRfid.test.mjs` | Six integration tests running the actual foundation SQL in embedded PostgreSQL, with operational Firestore calls blocked. Tests enrollment, removal/expiry/cancellation, ownership, tag races, visit atomicity/deduplication, timeout/interruption, route acknowledgement, history pagination and actual notification queue/inbox repair. |
| Eight existing test fixtures | Explicitly select legacy mode in mocks so their existing assertions continue exercising the original behavior. Files: `app/api/cats/route.test.mjs`, `app/api/cat-backup/process/route.test.mjs`, `app/api/cat-backup/sync/route.test.mjs`, `app/api/sensors/rfid.integration.test.mjs`, `lib/utils/catHistoryReads.test.mjs`, `lib/utils/rfidNotifications.test.mjs`, `lib/utils/sensorSms.test.mjs`, `lib/utils/smsAccountSync.test.mjs`. |

No additional SQL is needed for Task 3 beyond Task 2's prepared migration. The live database still needs that reviewed migration and a verified import. Existing `sms_devices` owner/token mappings and `sms_accounts` alert accounts must be present; missing or revoked authority fails closed. Provisioning and account creation are migrated in Tasks 4 and 5.

## Defaults and preserved behavior

- Hold: **5 seconds**, using the existing firmware proof validator; early removal resets progress.
- Enrollment waiting/holding expires after **120 seconds**. A verified tag remains available while the user completes the form, until consumed, cancelled or replaced.
- Reader heartbeat freshness: existing **180-second** threshold; reader must be paired, online and idle to start enrollment.
- Concurrent revision conflicts: up to **three attempts**; ownership failures and conflicting visit identities are not blindly retried.
- Cat/history client polling: existing **30 seconds visible / 60 seconds hidden**.
- Collection reads have a **5,000-record safety ceiling** and fail rather than silently omit records. Indexed history queries should replace these bounded scans before larger accounts are enabled.
- Entry/exit, debounce, ultrasonic pairing, 15-minute timeout and reboot state machine constants are unchanged. Timeout visits retain their existing incomplete status; interrupted sessions do not increment visit counts. An unknown tag creates no visit and receives no event acknowledgement.
- Existing exact firmware event identity and subsecond retry clock-jitter handling are reused.
- Tag linkage and proof consumption are atomic. Visit creation, summary totals and completed-session counters are atomic. Replaying the same visit does not count it twice.
- Logs identify `[supabase:rfid]` persistence/projection/retry state without credentials.

## Verification on 2026-10-06

- App suite: **314 passed, zero failed** (including six new primary integration tests).
- Camera relay suite: **4 passed, zero failed**. No camera source was changed.
- ESLint: **passed**, no warnings.
- Source TypeScript check: **passed**. Before build generation, `npx tsc --noEmit` passed; after generating Next route validators, a source-only compiler check excluding `.next` passed.
- Default production build: **blocked by a Turbopack CSS worker process failure**, reproduced inside and outside sandboxing. No compiler configuration was changed.
- Alternate `next build --webpack`: **compiled successfully**, then failed the generated route check for the existing `normalizeSmsPhone` export in `app/api/sms/settings/route.ts`. The export is present in HEAD and that file is unchanged by Task 3. Full production build is therefore **not confirmed**. Record this for Task 6's QA fix; do not deploy while the gate fails.
- Diff whitespace check: passed (Git also reports existing Windows line-ending conversion notices).

These are local software checks, not proof of a live ESP32 scan or notification delivery. Hardware, live import, browser/mobile acceptance and deployment remain the final QA section.

## Remaining staged dependencies

Task 4 migrates gas snapshots, provisioning and camera authorization. Task 5 migrates remaining profile/settings, notification readers, health logs/manual visits, reports/analysis and photo storage; it also finalizes shared database mode before any client subscription starts. Those paths still use Firebase here. The staged switch must not be enabled for normal users until those producers/readers and import gates agree.

Switching back to legacy storage after new Supabase writes requires reconciliation of those writes first; simply flipping the switch can hide new records.

## Final acceptance checklist (after cutover is authorized)

1. Import the actual owner, cats/details/history and provisioning records, and verify alert account/device mappings. Confirm counts and tag claims before enabling primary mode.
2. In a controlled environment reject operational Firestore calls while keeping Firebase Authentication available. Register a new tag with the five-second hold and Save Cat; verify canonical records and tag claim.
3. Remove the tag early, attempt an existing tag, cancel/restart enrollment, and let an unfinished enrollment expire. Check the correct message and no unintended linkage.
4. Perform the unchanged RFID/ultrasonic entry and exit pairs; verify the session and totals. Retry the same event; verify one session and one count.
5. Check unknown tag, wrong reader/owner, timeout and interrupted-session cases. Check history filtering/pagination and another account's empty history.
6. Verify RFID push and SMS separately, with preferences/quiet hours retained; verify actual arrival with LitterSense closed. Test gas and camera separately after Task 4.
