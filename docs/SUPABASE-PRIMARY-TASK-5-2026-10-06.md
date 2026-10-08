# Task 5 — remaining app records and cutover preparation

## Status

Task 5 source implementation and local checks are complete. Primary mode remains off. No live SQL, data import, asset copy, rules deployment, Vercel deployment, Git push or firmware flash was performed in this section.

Firebase Authentication and FCM remain in use. When primary mode is enabled, profiles, settings, cats, sessions, health logs, notifications, reports, admin records, device/camera metadata and photos use Supabase. The existing video relay, firmware protocols, gas detection semantics, SMS cooldowns and push cooldowns are preserved.

## File-by-file changes

### Shared app record access

- `app/api/operational/mode/route.ts`: reports the staged server database mode, without credentials.
- `lib/utils/operationalMode.ts`: validates and caches the mode for the current page. Failed or malformed mode responses fail closed; they do not choose Firestore. A cutover requires a page reload.
- `lib/utils/operationalClient.ts`: shared record adapter used by existing screens. Primary reads, listeners, writes, batches and transactions go through authenticated server requests. Existing Firestore reference construction and Timestamp types stay internal. Listener polling stops on unsubscribe/account changes, timestamps retain nanoseconds, notification ISO timestamps are normalized, and transactions use revision checks and bounded retries.
- `app/api/operational/records/route.ts`: verifies Firebase ID tokens, bounds streamed request bodies, validates operations and refreshes the alert-account projection after profile/preferences saves.
- `lib/server/operationalRecords.ts`: enforces existing owner/admin access rules, readiness, collection/document paths and atomic writes. Dedicated cat/tag/device mutation endpoints cannot be bypassed through the general record API. Creates new owner profiles after the initial import, supports admin records and approved deletion requests, and builds alert projections from canonical data with device ownership validation.
- `lib/server/operationalStore.ts`: separates imported-foundation readiness from existing-owner readiness so new signups can create their profile after cutover.
- `lib/contexts/AuthContext.tsx`: profile and admin-role lookup use the shared adapter; Firebase sign-in stays unchanged.
- `lib/contexts/CatContext.tsx`: shared adapter for health/manual-visit/stat records; canonical counters are still produced on the server. Primary mode can read imported health logs and daily stats.
- `lib/contexts/NotificationContext.tsx`: saved notification history, dedupe, marking read and clearing use the adapter.
- `lib/contexts/DeleteRequestContext.tsx`: owner requests and admin approval/rejection use the adapter.
- `lib/contexts/AdminContext.tsx`: user/catalog administrative reads use the adapter.
- `lib/hooks/useSettings.ts`: notification preferences use the adapter. Local settings caches are now scoped by owner instead of sharing one browser key between accounts. The previous global cache is left untouched and is not reused across owners.
- `lib/hooks/useReports.ts`: report save, archive, read and deletion use the adapter.
- `lib/hooks/useSessionHistory.ts`: remaining client-side history reads use the adapter while the dedicated primary history API remains available.
- `app/(auth)/login/page.tsx`: post-login operational profile reads/writes use the adapter.
- `app/(auth)/signup/page.tsx`: operational profile creation uses the adapter; account creation remains Firebase Auth.
- `app/admin/add-admin/page.tsx`: operational admin registry uses the adapter; secondary Firebase Auth account creation is preserved.
- `components/onboarding/OnboardingFlow.tsx`: preference/profile saves use the adapter. Removed the duplicate browser token write because the messaging helper already registers the token through the dedicated server route.
- `components/dashboard/SmsAccountSync.tsx`: configuration listeners use the selected database and the existing sync route. In primary mode it projects Supabase records rather than copying Firestore records.

### Analysis, notifications and administrative actions

- `lib/server/operationalAnalysisLimiter.ts`: Supabase revision-based analysis lease and cooldown, retaining the existing 45-second lease and 15-second successful-analysis cooldown.
- `app/api/predictive-health/route.ts`: selects the Supabase limiter in primary mode; analysis inputs continue to come from the migrated app data.
- `lib/server/operationalPushTokens.ts`: revision-safe multiple-device token updates and selective removal in the canonical profile.
- `app/api/push/register/route.ts`: primary readiness check and canonical token save/removal while keeping the existing Supabase delivery-token projection.
- `app/api/push/dispatch/route.ts`: reads primary saved notifications through Supabase; retains allowed alert sources, freshness checks and event dedupe.
- `lib/utils/pushDelivery.ts`: refreshes canonical profile/preferences before delivery and removes invalid tokens from the canonical profile in primary mode.
- `lib/utils/smsDelivery.ts`: refreshes the canonical recipient/preferences before sending, including when the app is closed.
- `app/api/sms/sync/route.ts`: primary account projection includes profile phone, preferences, cats and current owned device configuration.
- `app/api/sensors/route.ts`: primary gas/RFID ingestion repairs the complete alert projection before queueing. Existing queue, preferences, quiet hours, detection and cooldown behavior stays in place; queue/projection failure requires device retry.
- `app/api/admin/update-password/route.ts`: uses the canonical admin registry in primary mode; password update stays Firebase Auth.
- `lib/server/operationalDeletion.ts`: approved deletion orchestration, owner photo cleanup and completion. Failures leave a retryable deletion state.
- `app/admin/requests/page.tsx`: keeps interrupted cleanup visible with a Retry cleanup button and accurately distinguishes approval from completed deletion.
- `lib/data/data.ts`: includes the intermediate deleting status used by that retry flow.
- `app/api/admin/delete-user/route.ts`: primary deletion removes canonical operational records and alert projections, cleans private photos, deletes the Firebase Auth account, then completes the request. It requires an approved request belonging to the target owner.
- `lib/utils/deleteUserData.ts`: unused legacy helper refuses primary-mode deletion and directs callers to the approved server flow. It is retained for the existing mode.

### Photos and migration artifacts

- `lib/server/operationalMedia.ts`: owned photo paths, 2 MB prepared-image ceiling, MIME/signature checks, private uploads/deletion and expiring downloads. Known owned Supabase photo pointers are signed when records are read; arbitrary URLs are not fetched by the server.
- `app/api/operational/media/route.ts`: authenticated upload/deletion with streamed body limits and no browser service key.
- `lib/utils/operationalPhoto.ts`: primary upload progress, timeout, cancellation and account-change checks.
- `lib/utils/catPhoto.ts`: selects Supabase upload/deletion in primary mode while preserving legacy validation, paths, progress and cancellation.
- `lib/utils/ownerPhoto.ts`: primary owner-photo cleanup uses the same storage path; existing image preparation is retained.
- `app/dashboard/settings/page.tsx`: profile saves use the adapter and displayed profile photos use the canonical photo URL, including re-signed migrated photos.
- `app/api/cats/route.ts`: primary catalog reads resolve private cat-photo pointers for display.
- `scripts/operational-media-import.mjs`: dry-run/apply photo-copy preparation using existing env credentials. Validates source ownership, preserves originals, refuses destination byte conflicts, verifies uploaded bytes and produces a separate updated private record manifest. No destination overwrite or source deletion.
- `scripts/operational-import.mjs`: refuses manifests containing unverified dry-run photo pointers.
- `firestore.supabase-primary.rules`: optional cutover rules artifact denying operational client reads/writes after verified migration. It has not replaced the existing rules or been deployed. Authentication and FCM are separate services.

## Prepared SQL — not applied live

Apply in order after the Task 2 foundation and existing alert/snapshot/history schema:

1. `supabase/migrations/20261006160000_operational_app_records.sql`: extends the existing atomic commit for server-authorized admin records. Owner constraints remain; deleting/deleted owners cannot recreate operational records through ordinary commits.
2. `supabase/migrations/20261006161000_operational_media.sql`: private `littersense-media` bucket, prepared-photo size/type limits and restrictive anonymous/authenticated policies protecting this bucket even if another broad storage policy exists.
3. `supabase/migrations/20261006162000_operational_account_deletion.sql`: approved deletion/completion RPCs, including rejection of requests with missing approval status. Existing account foreign keys cascade alert/snapshot/history projections; the current deletion request remains as an audit record.

Photo privacy and signed-download behavior follow the [Supabase Storage documentation](https://supabase.com/docs/guides/storage/serving/downloads).

## Verification

- Full app suite: **331 passed, 0 failed**.
- Lint: passed, no lint warnings.
- Source TypeScript: passed. Generated `.next` validators were excluded; this is not a passing production build.
- Whitespace check: passed using the repository's Windows line-ending handling.
- PostgreSQL-backed tests verify ownership, admin policy, timestamp preservation, notification dedupe, new account/profile creation, report/settings/health-log writes, analysis leases, approved deletion, private storage rules and multiple-device token concurrency.
- Adapter tests reject unavailable mode, exercise transaction retries and stop listener results on account changes.
- Photo tests reject foreign paths, bad bytes and oversized bodies; migration tests verify hashes, retry safety, conflict rejection and dry-run pointer blocking.
- SMS/push tests verify canonical preferences are refreshed before delivery without a browser. Existing legacy-mode, firmware-flow and service-worker tests remain passing.
- Existing tests retain the previously observed Node module-format warning; this section introduced no new lint warnings.

Updated/new tests: `lib/server/operationalRfid.test.mjs`, `lib/server/operationalMedia.test.mjs`, `lib/utils/operationalClient.test.cjs`, `lib/utils/catPhoto.test.cjs`, `lib/utils/ownerPhoto.test.cjs`, `lib/utils/smsDelivery.test.mjs`, `lib/utils/pushDelivery.test.mjs`, `app/api/push/dispatch/route.test.mjs`, and `app/api/sensors/rfid.integration.test.mjs`.

## Defaults and acceptance limits

- Shared app record listeners poll every **30 seconds visible / 60 seconds hidden**. Sensor polling, firmware synchronization and real push delivery retain their own paths; push does not wait for this listener.
- Record API requests: 20-second client timeout, 2 MB body limit, atomic batches of at most 100 writes, three conflict attempts. Existing collection scan ceiling: 5,000 records; larger collections fail explicitly rather than silently truncating.
- Notification bulk-clear batches over 100 records use successive atomic chunks; an interrupted clear can be retried. The whole multi-chunk clear is not one transaction.
- Prepared photos: **2 MB**; selected source-file validation remains **10 MB**. Client upload timeout: 45 seconds. Signed download links expire after 24 hours and are refreshed on record reads; a long-lived screen that only loaded a profile once may need a reload after link expiry. Browser acceptance must include this case.
- No hardware constants, pins, camera stream/relay code or entry/exit semantics were changed in Task 5.

## Task 6 release gates and remaining problems

1. Resolve the previously recorded production build blockers: Turbopack CSS worker failure and the unsupported `normalizeSmsPhone` export in the SMS settings route. They remain outside this section and prevent a production-ready claim.
2. Complete full browser QA and a final review, including signed photo expiry, owner changes, empty history, outages, admin operations and multiple devices.
3. Pause/freeze old operational writers before making a stable private export. Confirm old recovery/catalog repair jobs are disabled by primary mode and that schedules target the intended deployment.
4. Apply the reviewed migrations in a controlled environment. Use `migration-private/` for exports. Run photo dry-run/apply with a separate output manifest **before importing the record manifest**; a previously imported different manifest will correctly conflict rather than overwrite canonical records.
5. Compare owner/record counts, tag claims, existing device/camera credential records, photo hashes and SMS/FCM account projections. Source data inaccessible because of quota must be recovered/read before declaring the import complete.
6. Set the migration-state cutover marker and server flag only after those gates. Deploy reviewed deny-client Firestore rules and reload clients so stale open pages cannot keep writing to the old database. These rules do not block Admin SDK writers, so old server jobs/deployments also require an explicit audit.
7. Deploy only the verified release, then perform real gas, RFID hold/entry/exit, camera and closed-app SMS/push tests. Provider acceptance and local simulation do not prove phone display or physical device behavior.
8. Keep original Firestore/Storage data for the recovery window. Rollback after Supabase writes requires reconciling those writes first; do not simply flip the flag back.

The existing admin suspension action appears to affect only local screen state; it was not made into a real account suspension in this migration. Full UI QA should report it separately. No live data deletion or unrelated UI cleanup was performed.

Next section: **Task 6 — full QA, migration/release and physical acceptance**. It has not started.
