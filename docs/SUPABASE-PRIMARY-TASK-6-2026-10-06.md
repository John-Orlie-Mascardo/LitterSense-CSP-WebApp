# Task 6 - QA and release status

## Status

Local automated QA and the production build passed. **Task 6 is not complete:** the complete source export, live schema/import, browser acceptance in primary mode, deployment and physical tests are pending.

A fresh read-only Firebase Admin probe on October 6 returned code **8** with a quota error. `SUPABASE_RFID_PRIMARY_ENABLED` remains off. The live Supabase project has **zero** operational foundation tables, so the new migrations have not been applied there. Partial backup tables are not a complete migration source.

No live SQL mutation, data import, photo copy, Firestore rules deployment, Vercel deployment, Git commit/push or firmware flash was performed in this section. Firebase Authentication and FCM remain the account and push services in the prepared design.

## Verified locally

| Check | Result |
| --- | --- |
| App tests | 341 passed, 0 failed |
| Camera relay tests | 4 passed, 0 failed |
| ESLint | Passed; no lint warnings |
| Production build | Passed with Webpack, including generated Next.js TypeScript checks, 43 static pages and build traces |
| Tracked-file whitespace | Passed with Windows line-ending handling |
| Final review | Six migration issues and a cutover guard issue addressed with regression checks |

The existing Node module-format warning still appears in the test runner. Git also reports automatic LF/CRLF conversion notices. Neither is a new application error. Dependencies were not upgraded in this section.

Default Turbopack reproduced a CSS-worker failure even outside the sandbox. The supported Webpack option built successfully. See [Next.js CLI documentation](https://nextjs.org/docs/app/api-reference/cli/next).

## Bugs fixed and files changed in this section

| Files | Change and verification |
| --- | --- |
| `package.json` | Build uses `next build --webpack`; full production build passed. |
| `app/api/sms/settings/route.ts` | Removed the unused `normalizeSmsPhone` export rejected by generated Next.js route types. Existing GET/POST behavior remains. |
| `lib/server/operationalRecords.ts` | Owner deletion-request reads use the existing owner-filtered root-record path. Photo fields are converted to stable owned pointers before storage. Account projection repairs canonical push subscriptions as well as profile phone/preferences. |
| `lib/utils/operationalImport.mjs` | Preserves completed deletion audit records without recreating a deleted owner's profile. Other orphan records still block import. Ambiguous push-token ownership across source profiles blocks import for review. |
| `lib/utils/operationalPhotoFields.mjs` | Shared traversal of known photo fields, including archived report cat avatars. Arbitrary nested URL fields are not fetched or rewritten. |
| `lib/server/operationalMedia.ts` | Copies records before resolving photo fields and refreshes owned links in archived reports. Writes retain stable pointers instead of expiring signed URLs. |
| `scripts/operational-media-import.mjs` | Copies and verifies known nested report photos using the existing source/destination transport. Keeps source assets and the original manifest. |
| `scripts/operational-import.mjs` | Rejects unverified photo-copy pointers in nested reports as well as top-level records. |
| `lib/server/operationalAlertRecipients.ts` | Repairs each canonical recipient before owner-scoped SMS/push claims evaluate the delivery mirror. A failed recipient check is not claimed. |
| `lib/utils/smsDelivery.ts`, `lib/utils/pushDelivery.ts` | Isolate claimed records. A failure before contacting the provider returns an unsent alert to pending; a possibly attempted send remains unknown to avoid blind duplicate sends. Legacy delivery gates, preferences and quiet hours remain. |
| `lib/server/operationalPushTokens.ts`, `app/api/push/register/route.ts` | Primary registration/removal calls an atomic canonical-profile and delivery-mirror operation. Moving a subscription to another account removes the old account's ownership in the same transaction. Legacy registration remains available while primary mode is off. |
| `lib/server/operationalStore.ts` | Runtime readiness requires import completion plus the primary cutover marker. An imported but uncutover database cannot accept normal app writes. |
| `supabase/migrations/20261006160000_operational_app_records.sql` | Adds the same cutover check inside atomic commits, under the existing import/write lock. This file is still unapplied live. |
| `supabase/migrations/20261006220000_operational_push_tokens.sql` | Adds service-only atomic token registration and projection. Imported canonical tokens repair missing mirror entries; conflicting canonical owners fail closed. |
| `supabase/migrations/20261006221000_scoped_alert_claims.sql` | Restricts expiration, interrupted-send cleanup and invalid-phone cancellation to the requested owner when claims are scoped. An unrepaired different owner is not cancelled. Legacy global claims retain global behavior. |
| `lib/server/operationalRfid.test.mjs` | Actual PostgreSQL tests for deletion-request isolation, cutover rejection, token projection/account moves and scoped cleanup. Loads the prepared token/claim migrations. |
| `lib/server/operationalMedia.test.mjs`, `lib/utils/operationalImport.test.mjs` | Regression checks for archived photo renewal/copy verification, deleted-owner audit imports and ambiguous subscriptions. |
| `lib/server/operationalAlertRecipients.test.mjs`, `lib/utils/smsDelivery.test.mjs`, `lib/utils/pushDelivery.test.mjs` | Recipient repair precedes claim; unsent recipient failures remain retryable and do not block another already-claimed owner. |

These checks use isolated fixtures and mocked external provider calls. They did not send real SMS/push messages or change production records.

## Browser and live inspection

- The verified production build started locally on port 3001. Chrome retained the signed-in Firebase account and opened the dashboard.
- Home and My Cats navigation rendered, but their content stayed on `Loading content` during the source quota outage. The legacy SDK/listener path can remain waiting during this outage. This prevents meaningful form, photo, report and camera acceptance in the current mode; it is not evidence that the new primary screens work live.
- Live schedule inspection confirmed `littersense-sms-worker` and `littersense-cat-history-worker` are active every minute and target `https://litter-sense-csp-web-app.vercel.app`. Their embedded secrets were not displayed. They were not disabled or changed.
- Primary-mode backup/recovery routes have local tests proving they stop old copying. This still requires checking the actual deployed revision and any other old deployments/server writers before cutover. Firestore client rules alone do not block Admin SDK writers.

## Problems and limits still requiring attention

1. **Firebase quota blocks the complete export.** Importing only the current backup could lose profiles, settings, visits or camera credentials. Restore source reads or provide an independently verified complete export first.
2. **Primary browser and device acceptance are pending.** Local tests and compilation do not prove ESP32 operation, camera frames, SMS delivery or a displayed notification on a closed phone app.
3. **The current legacy quota screen remains loading.** It was observed and reported; a separate legacy outage UI change was not added to this database migration.
4. **Alert backlog/load acceptance is pending.** Recipient preparation currently considers the first 100 pending rows and sends at most two records per channel per worker run. A large queue dominated by deferred/unavailable owners can delay later owners; multiple slow recipient checks can exceed the hosted worker time budget. Do not claim high-volume reliability from the small fixtures. Resolve this before expanding beyond the current small deployment.
5. **Unknown provider outcomes need reconciliation.** If a provider might have sent and storage fails, blindly retrying can duplicate messages. Those outcomes intentionally remain unknown.
6. **Profile photo links expire after 24 hours.** Record reads renew links, including archived reports. A profile loaded only once may require a reload; long-lived screen acceptance remains pending.
7. **Admin suspension is still a pre-existing local screen action**, as recorded in Task 5; it was not changed into a real Firebase Auth suspension.
8. Task 2 recorded existing dependency audit findings. Dependency upgrades remain outside this migration; no fresh dependency-security clearance is claimed here.

## Prepared SQL order - not applied live

Apply through the existing Supabase migration workflow after verifying the destination and existing alert/snapshot/history prerequisites:

1. `20261006121032_operational_foundation.sql`
2. `20261006160000_operational_app_records.sql`
3. `20261006161000_operational_media.sql`
4. `20261006162000_operational_account_deletion.sql`
5. `20261006220000_operational_push_tokens.sql`
6. `20261006221000_scoped_alert_claims.sql`

Verify live service-role permissions and denial of anonymous/authenticated direct access after application. The private media bucket must exist before copying photos. Applying schema alone does not enable primary mode.

## Next release steps

1. Verify Firebase source reads work again. Inventory and pause the old operational producers/recovery jobs for the final export window; preserve the original databases/assets.
2. Create a private, access-restricted `migration-private` folder. Export with `scripts/operational-import.mjs --export`. It checks two source passes and reconciles Supabase visit backups; any failed read, changing source, unmapped collection or conflict stops it.
3. Review aggregate owner/document counts, tag claims, deleted-owner audit records, camera/device ownership and credential preservation. Resolve ambiguous push subscriptions before importing. Do not print source credentials or commit exports.
4. Apply the reviewed schema. Run photo dry-run and copy/verify to a new manifest using `scripts/operational-media-import.mjs`. Run record dry-run against that verified manifest before applying it. Do not import a preview manifest with unverified pointers.
5. Compare source/destination counts, claims and photo hashes; project each imported owner and compare SMS profile phone/preferences and canonical/mirrored FCM tokens. A real-data dry run is still pending.
6. Mark cutover in a transaction using the same advisory lock `(621006, 2)` as import/commits, requiring non-null `imported_at` before setting `runtime_primary=true` and `cutover_at`. Configure the server primary flag, deploy the verified release, freeze remaining old operational writers and reload clients as one coordinated release window. Review the concrete export/reconciliation result before this publishing step.
7. Run the browser/device checklist below. Keep source data for recovery. After new Supabase writes, rollback needs reconciliation of those writes; simply flipping the flag back can lose them.

## Acceptance checklist after import/deployment

- Sign in, sign out and switch owners; verify cats, settings, history, reports and photos stay owner-scoped.
- Add a cat with the existing continuous five-second hold; test early removal and duplicate tag rejection. Confirm the saved tag can be looked up.
- Run the current RFID + ultrasonic entry and exit sequence; confirm one recorded visit, no duplicate retry, timeout marked incomplete and reboot handling.
- Confirm both gas readings remain live and both Clear-to-Detected alerts honor their individual switches, the existing one-minute push limit, one-hour SMS limit and quiet hours.
- Pair/view the camera; verify real frames, reconnect and foreign-owner rejection. Existing relay, firmware pins and streaming behavior were not changed here.
- Close LitterSense and its tabs without force-stopping Chrome; trigger one genuine eligible event. Confirm phone and PC system notifications arrive and SMS uses the profile number. Provider acceptance alone is not a displayed-notification result.
- Test no cats, empty history, unavailable network/database and an offline sensor. Verify retry/error states and no invented data.
- Exercise multiple phone/PC tokens, expired-token cleanup, account-switch token removal and an imported subscription missing from the old delivery mirror.
- Save/open archived reports with cat photos; verify renewed image links. Check long-lived profile screens across signed-link expiry.
- Exercise approved deletion and interrupted-cleanup retry with disposable test accounts, including retained audit records. Do not delete a real account for QA.

**Next required input/state change:** restored Firebase reads, or a verified complete source export. Until then, Task 6 remains pending and the live app stays in its existing mode.
