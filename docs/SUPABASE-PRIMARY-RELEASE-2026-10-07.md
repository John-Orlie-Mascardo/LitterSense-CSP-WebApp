# Supabase primary release - October 7, 2026

## Verified migration

- Firebase source reads recovered. Two complete scans matched: 751 records. A subsequent batch read confirmed all 751 source update timestamps remained unchanged.
- Applied all six Task 6 migrations to the existing Supabase project. Operational tables have RLS; direct anonymous/authenticated access is denied. The media bucket is private.
- Imported 752 records across 24 owners: 24 profiles, 20 cats, 187 saved visits, 14 camera credentials, three device credentials and seven tag claims. The extra record preserves an explicitly reviewed older visit backup.
- One visit differed only by 219 milliseconds in both start and end times; duration was identical. The user approved keeping the newer Firebase record and archiving the entire older Supabase backup separately. Neither source copy was deleted or overwritten.
- All 122 other visit backups matched. No missing outage visits needed adding. No Firebase-hosted photo assets required copying; existing external/embedded photo values were retained.
- The real-data import dry run had zero conflicts. Import succeeded atomically. A repeat dry run found all 752 records unchanged, inserted zero records, and found zero conflicts.
- Prepared notification account projections for all 24 imported owners. Canonical and mirrored push tokens match. Accounts without a valid profile mobile number remain ineligible for SMS; no number was invented.
- Private exports and previous Firebase rules are access-restricted and excluded from Git and Vercel uploads. Vercel's upload inventory contained 395 files and zero private export/credential files.

## Changes made in this release continuation

| File | Purpose |
| --- | --- |
| `lib/utils/operationalImport.mjs` | Map legacy device snapshots and AI leases under verified owners; preserve an approved backup conflict under an internal archive using exact source/backup fingerprints. Other conflicts still stop import. |
| `scripts/operational-import.mjs` | Use eight bounded authenticated REST export lanes; compare two complete passes; preserve a private verified source checkpoint before later reconciliation can fail; print privacy-safe progress/failure classifications. |
| `lib/utils/operationalImport.test.mjs` | Test legacy ownership, bounded export concurrency, checkpoint rejection as an import manifest, and explicit conflict preservation/change rejection. |
| `.vercelignore` | Exclude private migration files, local secrets, worktrees, build artifacts and unrelated large files from deployment. |
| `firebase.json` | Make future Firebase rule deployments use the verified operational freeze artifact, preventing accidental restoration of legacy client writes. |
| This report | Record current live migration evidence; the October 6 Task 6 report remains a historical pre-import report. |

The earlier Task 1-6 reports list the full app/backend migration changes. This continuation did not change firmware, reader pins, camera transport, Firebase Auth, FCM or the SMS provider.

## Automated and staged QA

- Local and Vercel lint, 345 app tests, four camera relay tests, TypeScript and production builds passed.
- Tested production build: `dpl_D6JBL3L1axvpwWuHVZDzHgRKMjdZ` (initially staged without the public domain).
- Staged authenticated API acceptance uses disposable Firebase Auth accounts and owner-scoped Supabase records, then removes those test records/accounts. No real account is deleted or used as the QA identity.
- All 16 staged checks passed: primary mode, unauthenticated rejection, new profile/settings writes, empty cats/history, foreign-owner/internal-path rejection, offline reader, unpaired camera, unverified tag rejection, cat create/read/update/delete and deletion persistence.
- All 17 public-release checks passed after promotion and rule activation: the same 16 checks plus a genuine signed-in Firestore REST read rejected with HTTP 403. The test profile was never created in Firestore. Temporary accounts and operational/alert records were removed.
- A deployed notification-worker probe returned HTTP 200: SMS enabled, zero SMS processed and zero push processed (the queue was empty). This verifies worker reachability, not actual message delivery.
- The first QA run omitted required date filters and returned HTTP 503; the proper app date-filter request passed. Missing-date API error classification remains a pre-existing issue, not a tested empty-history failure. A later Vercel CLI transport timeout was resolved by a direct authenticated connection to the same staged deployment; no application code change was needed.
- Browser control is unavailable because the local browser automation kernel fails with a sandbox setup error. API acceptance is not visual browser acceptance.

## Release status and remaining acceptance

**Production promotion is complete:** `https://litter-sense-csp-web-app.vercel.app/api/operational/mode` returned HTTP 200 with `primary: true`. The singleton migration state has import and cutover timestamps and `runtime_primary=true`.

The verified deny rules are active in Firebase; prior rules are preserved privately. Firebase Auth and FCM remain enabled. The SMS/push cron job is active again, targeting the production domain; the old history recovery cron job remains disabled. Other obsolete direct deployment URLs should not be used: client rules do not revoke Admin SDK access in those older builds.

Local `.env.local` now enables the same primary mode. This server-only flag was also added to the Vercel Production configuration. A running local server must restart, and existing browser tabs must reload, because mode is cached for each page lifetime.

Physical RFID registration/visits, real gas events, live camera frames, displayed phone/PC push, and actual SMS delivery require device acceptance after deployment. Source/build/API checks do not prove those outcomes.

Known limits carried forward from Task 6: large alert backlogs can delay owners and multiple slow recipient checks can exceed the worker budget; unknown provider outcomes intentionally avoid blind retries; signed photo links need renewal after expiry; pre-existing admin suspension behavior and dependency audit findings remain outside this migration. Do not claim high-volume reliability or dependency-security clearance from this release.

After primary writes, rollback requires reconciling those Supabase writes. Flipping back to Firebase alone is not a safe rollback. Existing Firebase records/assets remain preserved.
