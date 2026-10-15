# Database usage iterations - October 15, 2026

## Goal and constraints

Reduce avoidable website database reads while retaining prompt visible sensor updates and server-originated push notifications with the app closed. Work one measured iteration at a time. RFID diagnosis is paused. Firmware, database schemas, alert generation, and the camera are outside iteration 1.

## Iteration 1: hidden dashboard sensor reads

Status: committed as `7600e6b`. The user reports the deployed browser hide/return test works. Physical closed-app push acceptance remains pending because hardware testing is unavailable.

Baseline: clean branch `orlie-branch`, commit `ea71464`.

Story: As an owner who leaves LitterSense in a background tab, I want sensor reads to pause until I return so an unseen dashboard does not keep querying the database.

Source findings:

- `app/dashboard/layout.tsx` mounts one `DeviceSensorsProvider`; consumers share the same polling loop.
- `app/layout.tsx` mounts one notification provider. Its live stream supplies catalog, visit, notification, and sensor invalidations. No duplicate provider within these layouts was established.
- Each live-stream server connection subscribes to owner operational records and paired sensor snapshots, and closes its socket on stream cleanup. Multiple browser tabs still have independent connections; this is not eliminated by this patch.
- The sensor hook polled every five seconds even while hidden. The visibility handler fetched on both hide and show, and sensor invalidations could issue more hidden reads.
- Each primary sensor GET reads device configuration, sensor mirrors, and the stored RFID snapshot. A browser request is not equivalent to one database query.
- Operational record listeners use a separate 30-second fallback. This iteration does not change that cadence.

Change: skip sensor fetches while `document.hidden`, clear the timer on hide, suppress hidden invalidations and online-event reads, prevent a pending response from restarting hidden polling, and fetch once on return. A request already in flight may finish. Visible fallback remains five seconds. Notification streaming remains active independently.

Acceptance and evidence:

- Three new regression tests cover a simulated hidden hour with 720 invalidations, hiding during an in-flight read, and mounting while hidden.
- Before the patch the first two regressions failed; after it all sensor hook tests pass.
- With instantaneous successful responses and no events, the old five-second schedule allowed 720 periodic sensor requests per hour per tab, plus initial/event reads. Hidden tabs now initiate zero sensor requests until shown again. This is a deterministic harness result and schedule calculation, not a measured production CPU reduction. Browser throttling and request duration affect real baseline counts.
- The focused 37-test run covers sensor ingestion, presence, stream handling, push registration, server push delivery without an open app, and service-worker display without app windows. All passed.
- Final gates: full ESLint passed; all 571 app tests passed; all six relay tests passed after enabling localhost networking (the sandbox run could not complete its local HTTP/socket checks); the production build including TypeScript passed. The individual gates were completed after the interrupted aggregate check. No live production metrics or physical notification delivery were measured.

Push constraint: gas ingestion queues alerts and invokes delivery server-side. The service worker handles incoming push independently of sensor polling. Browser permission, a valid device registration, network access, and OS delivery rules still apply. A physical closed-app push test remains necessary after deployment.

Production/browser acceptance after deployment:

1. Open the dashboard with developer tools Network recording and filter `/api/sensors` (exclude `/presence-session`). Verify a visible tab retains its five-second fallback after responses finish.
2. Switch to another tab for one minute. Use preserved network recording to check that no new sensor GET starts while hidden; a request started before hiding may complete.
3. Return. Verify one immediate reconciliation and the latest reading, followed by normal polling.
4. Close all LitterSense windows on a phone with push enabled. Trigger one genuine gas event when hardware testing resumes. Confirm exactly one system notification. Do not infer physical delivery from provider acceptance alone.
5. Compare Supabase request rates and CPU over matched intervals with the same number of tabs/devices. CPU alone does not attribute load to this hook.

## Ordered backlog

1. Accept iteration 1 in a real browser and verify closed-app push.
2. Measure redundant operational reads: identical listeners, visibility refresh, and broad write invalidations in `operationalClient.ts`. Establish a request-count regression before selecting an improvement.
3. Measure Realtime connections across tab navigation, reconnects, and multiple tabs; investigate repeated subscription reconciliation before implementing connection sharing.
4. Inspect the highest-frequency/slowest database queries using read-only runtime metrics, then choose query, index, or read-batching changes based on evidence. Obtain before/after metrics before claiming CPU improvement.

## Iteration 2: scope write-triggered record refreshes

Baseline: commit `7600e6b`; no unrelated changes were present before this iteration. Status: committed on the work branch as `ca9a0cd`; production Vercel deployment `6f3659a` was confirmed Ready in the browser. Dashboard and notification history loaded without captured warnings/errors. The production write/read-count test remains pending because all existing notifications were already read.

Story: As an owner marking a notification read or saving a record, I want only related record listeners to reload so each action avoids unnecessary database traffic.

Reproduced behavior: `operationalClient.ts` notified every operational listener after any successful write. A runtime test mounted seven representative dashboard collection listeners, then marked one notification read. The baseline made seven follow-up list requests; the patched adapter makes one. That is six fewer requests (about 86% reduction) for this reproduced action, not a claim about total production traffic or CPU.

Change: successful writes pass their document paths to registered listeners. A listener refreshes only if its path equals, contains, or is contained by a written path, using slash boundaries. Each listener refreshes once for a batch, even if several writes match it. An overlapping in-flight read still queues its follow-up instead of racing. Rejected writes do not invalidate records, and unsubscribed listeners are removed. Query filters and snapshot formatting are unchanged.

Server push generation/delivery, the service worker, sensor polling, the 30-second operational fallback, camera behavior, and Realtime connections are unchanged. A database-side indirect change outside the listed write paths can still arrive through its existing live invalidation or fallback; the confirmed local write fast path refreshes its related records only.

Proof: two new request-count/path-boundary regressions failed against the baseline, then passed after the patch. Additional coverage checks rejected writes, deletes, and cleanup. Existing tests cover account isolation, transaction retries, notification live invalidations and background push.

Final verification: `npm run check` completed successfully: ESLint, all 574 app tests, all six relay tests, and the production build including TypeScript. This confirms local behavior; production request reduction, CPU impact, and physical push delivery have not been measured for this iteration.

Hardware-free browser acceptance after deployment:

1. In Network, filter `/api/operational/records`, clear the log after startup settles, and inspect each request payload's `action` and `path`.
2. Mark one existing unread notification read. Expect the write plus a read of `users/<owner>/notifications`; the action should not immediately reload cats, sessions, details, or health logs. Periodic 30-second reads and independent live invalidations may still appear; distinguish those by timing and payload.
3. Verify the unread count updates, the item stays read after reload, and a second signed-in browser tab eventually reflects the change through existing live/fallback updates.
4. If existing data allows, save one ordinary record and verify its related UI updates. Check navigation and history still load. No board, synthetic alert, or new firmware is required.

Rollback: iteration 2 changes only `lib/utils/operationalClient.ts`, `lib/utils/operationalClient.test.cjs`, and this document. Restore just the adapter and its test from `7600e6b`, or revert the isolated iteration 2 commit, then redeploy the website if needed. Preserve later/unrelated edits. Keep the accepted iteration 1 sensor optimization. No SQL, Render, or firmware rollback is needed.

## Iteration 3: overlapping Realtime streams

Baseline: clean work branch at `ca9a0cd`. Status: production commit `febbabf78dcb5dad29c339a4b6b3432d8382d663` was confirmed Ready. Two signed-in tabs loaded, navigated, and reloaded without captured warnings/errors; closing one left the other usable. The smoke test covered more than the existing 45-second stream lifetime. It did not measure database socket reuse, new-alert delivery, or physical push.

Story: As an owner using more than one LitterSense tab, I want overlapping live streams to reuse their database subscription where the server runtime permits, while continuing to receive notification, cat, visit, and sensor invalidations independently.

Findings:

- One root `NotificationProvider` starts the notification SSE connection; normal client navigation does not add a second provider.
- Each browser tab still needs its own authenticated SSE stream. Previously, each server stream independently opened a Supabase socket and heartbeat, including overlapping streams for the same owner and paired device.
- The SSE route expires its stream at 45 seconds and removes it on abort/cancel. The client renews healthy streams and backs off empty/failed streams.
- One socket subscribes to two table change sources when a sensor token is available. Each successful system confirmation previously reconciled notifications, cats, visits, and sensors, producing two rounds of refreshes when both confirmations arrived.

Change: the server module shares one active watcher for an exact owner/device-token-hash pair inside that running instance. Each authenticated SSE subscriber receives invalidations only. A late subscriber receives its own initial reconciliation; existing subscribers do not repeat theirs. Releasing one stream leaves other subscribers connected. Releasing the last stream closes its socket and clears its heartbeat immediately. An outage removes the failed watcher, closes all its streams once, and permits a fresh connection. Old cleanup/events cannot affect the replacement. Different owners, rotated hashes, and missing hashes remain separate.

The socket reconciles once at its first successful system confirmation; additional confirmation messages do not repeat the initial refresh. Actual later database change events continue to refresh normally. Existing periodic reads still cover unavailable live updates.

Measured in runtime tests: two overlapping same-owner streams formerly created two sockets; now they create one socket, one channel join, and one heartbeat in the shared instance. Two table confirmations previously produced eight invalidation callbacks per subscriber; now they produce four. Tests exercise renewal while another stream is open, late subscribers, last-release cleanup, owner/token isolation, socket failure, replacement, and late frames.

Final verification: `npm run check` passed with ESLint, 578 app tests, six relay tests, and the production build including TypeScript. The original sharing/failure regressions failed before implementation. This is local verification, not evidence of production connection counts or phone delivery.

Limits: this is per running server instance. Vercel may route tabs to separate instances or cold starts, so it is not a guarantee of one project-wide socket per owner. Streams in different instances remain independent and correct. No cross-tab browser leader, token transfer, shared worker, persistent idle watcher, or long-lived connection beyond the existing stream lifecycle is introduced. Production CPU and connection reduction remain unmeasured.

Server alert queuing, FCM delivery, service-worker display with the app closed, firmware, and camera/presence transport are unchanged. Background push remains an independent acceptance requirement, with physical testing postponed until hardware is available.

Hardware-free acceptance after website deployment:

1. Open two signed-in tabs for the same owner. Navigate between Home, My Cats, and Notifications in one tab; check both remain loaded and do not show live stream errors.
2. Expect a separate `/api/notifications/live` SSE request in each tab. Those are browser-to-server streams, not proof of duplicate Supabase sockets. Healthy requests renew around the existing 45-second limit.
3. Close one tab. The remaining tab must continue loading and renewing its stream. Reload it and verify notification/history data remains available.
4. When an existing unread notification is available, mark it read in one tab and verify the other catches up through its existing live/fallback path. Do not create a fake sensor event just for this check.
5. Compare Supabase connection/request metrics over equivalent tab counts and intervals. Routing across separate Vercel instances can limit sharing; do not infer a project-wide reduction from the local test count.

Rollback: restore only `lib/server/notificationRealtime.ts` and its test from `ca9a0cd`, or revert the isolated iteration 3 commit, then redeploy the website. Retain the previous sensor-polling and record-refresh optimizations. No firmware, SQL, or relay deployment is required.

## Iteration 4: measure query load and batch configuration reads

Baseline: clean `orlie-branch` at `be826c7c85117f89dc548c006b8a8830eac506f2`. Status: production commit `9ee1ceff408301dd08733ad211321b54b6ad2433` confirmed Ready; Home, Settings, notification history and two-tab smoke checks passed. The new batched read ran 22 times in a 104.642-second production sample. Overall request rate was similar to the preceding sample, so total request-rate/CPU improvement was not established. Test subscriptions returned to zero after cleanup. No production records, schema, schedules, firmware, or relay settings were changed in iteration 4.

Story: As an owner keeping the dashboard visible, I want each sensor refresh to use fewer database requests while retaining fresh authorization and the current update cadence.

### Production evidence, October 15

Read-only SQL inspected `pg_stat_statements`, activity, subscriptions, and performance advisories. Statistics were not reset. The statistics reset time was October 1, 2026, 13:39:09 UTC; cumulative totals therefore include older code and cannot attribute current load to this patch. Query execution time measures database time, not end-to-end response latency or CPU utilization.

The database report for the displayed last-hour interval (7:49-8:49 PM, UTC+8) showed CPU usage of 16.64%. The infrastructure node also showed a 4% point reading during inspection. The historical October 8-15 chart showed 98%; that older range is not the current point reading. Hardware was unavailable during this investigation, so these observations are not comparable with a fully powered litterbox test.

Fresh production query-count samples:

| Condition | UTC interval | Exact owner/path reads | Owner collection reads | PostgREST setup calls | Realtime subscription rows |
| --- | --- | ---: | ---: | ---: | ---: |
| No test dashboard open | 12:53:35.222643-12:54:06.650275 (31.43 s) | 0 | 0 | 3 | 0 at end |
| One signed-in dashboard open, after startup | 12:54:43.552722-12:55:44.376980 (60.82 s) | 107 | 38 | 209 | 2 at both endpoints |

The second sample is a production baseline using deployed code, not a result of the local patch. It contains polling, startup reconciliation near the boundary, stream renewal, and any concurrent project activity; it does not isolate sensor requests alone. Subscription rows represent table subscriptions, not socket counts. The test tab was closed after measurement, and a subsequent sample showed zero subscription rows. No browser warnings/errors were captured.

Cumulative statistics identified `realtime.list_changes` and PostgREST request setup as the largest database-time totals. Owner collection reads averaged about 1.515 ms and exact owner/path reads about 0.057 ms across the historical window. These measurements support reducing request fan-out; they do not establish a missing index as the cause of the earlier CPU spike. The sampled 12:40-12:55 UTC logs returned INFO/LOG severities only. The performance advisor reported informational missing foreign-key indexes on tag claims, device owners, and outbox token hashes, plus an Auth connection-allocation notice. None was proven responsible for the measured read path, so no index/configuration migration was made. Reference: [Supabase foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

### Smallest selected change

`readOperationalDeviceConfig` previously made four requests: migration readiness, owner account, owner device pointer, and owned credential. The sensor route then read mirrors and RFID state, totaling six database requests per normal paired refresh.

The account and pointer now use one exact-path, owner-filtered batch. Migration readiness is still checked first. A missing account still fails closed, a missing pointer still returns no configuration, and a missing/foreign credential still returns 403. The credential is read fresh on each call; there is no authorization cache. The helper quotes and escapes each exact path and limits its result to the requested path count. Existing single-record reads remain unchanged.

Measured in the real route/PGlite test harness: configuration lookup falls from four requests to three; a full paired sensor refresh falls from six to five (one fewer, approximately 16.7%). This is per-request database fan-out, not a 16.7% CPU or total-traffic claim. The same lookup is used by stream setup and presence-session configuration. Visible five-second polling, slower operational polling, live invalidations, alert deduplication, server FCM delivery, the service worker, and hardware ingestion are unchanged.

### Verification and acceptance

- The request-count regression failed before implementation (`4 !== 3`) and passed after implementation. Additional cases cover missing pointers/accounts, foreign credentials, changed pointers, unready storage, owner isolation, timestamp decoding, and quoted paths.
- A read-only production REST check returned the same two account/pointer records for a batched query as for separate reads. The exact quoted filter with comma, quote, and backslash characters was accepted. No keys, owner IDs, or record contents were printed or saved.
- Independent review found no actionable issues in the store helper, config lookup, or test diff.
- `npm run check` exited successfully: ESLint, all 580 app tests, all six relay tests, and the production build including TypeScript. The suite also emitted its existing `MODULE_TYPELESS_PACKAGE_JSON` warning for `sensorEndpointDiagnostics.ts` and expected failure-path diagnostics; neither failed a gate. Post-deployment request-rate/CPU comparison and physical closed-app push delivery remain pending.

Deployment: commit the three code/test files plus this document and deploy the website to Vercel. No firmware upload, Supabase migration, or Render deployment is required.

After Vercel is Ready, verify Home, Settings/device configuration, Notifications, and a two-tab open/close cycle. Compare query-count deltas over matched intervals with the same tab/device state. The new batch has a different SQL query ID, so include exact-path batch queries in the comparison rather than tracking only the old equality query. Real gas events and closed-app phone pushes need a separate hardware test when available. Do not create synthetic production alerts for this check.

Rollback: restore only `lib/server/operationalDevices.ts`, `lib/server/operationalStore.ts`, and `lib/server/operationalRfid.test.mjs` from `be826c7`, or revert the isolated iteration 4 commit after preserving later/unrelated changes. Redeploy the website. Retain iterations 1-3. No database or firmware rollback is needed.

Further finding: collection queries still fetch full owner collections before client-side filtering/order/limit. They are bounded by the existing page guard but can become expensive as history grows. Proper server pagination must preserve filter/cursor ordering; it was not added to this small iteration.

## Iteration 5: bounded notification history

Baseline: clean work branch `48bde78`; production baseline `9ee1cef`. Scope approved by the user: newest notifications from the server, older pages on demand, correct unread counts/actions and hardware-free verification. Firmware and sensor/push transport remain outside this task.

Story: An owner sees the latest 25 notifications without downloading the entire history. The Notifications page offers **Load older notifications**. All/Alerts/System filtering happens before the server page limit. The panel's unread badge counts all unread records in the account, including older pages; clearing the local panel remains a browser dismissal, not a read/delete operation on history.

### Data and behavior

- Existing notification dates include ISO strings and imported Firestore timestamp objects. An immutable sort helper normalizes them to nanoseconds for ordering; path is the descending tie-breaker. Invalid dates sort at zero and do not prevent index creation or rendering.
- An additive migration adds notification-only time/unread indexes, a server-only read RPC, and a server-only bulk-action RPC. Existing tables, RLS, ingestion, notification IDs, deduplication, FCM delivery, and schedules are retained.
- The read RPC checks cutover and the owner account internally. It returns at most 25 rows by default (maximum 50), an opaque time/path cursor, and account-wide unread/total counts. It never downloads full histories to apply client-side limits.
- The API uses the verified Firebase identity's UID. Client owner fields cannot select another account. Cursor ownership, category and page size are validated. RPC execution is revoked from PUBLIC/anon/authenticated and granted only to service_role; functions use SECURITY INVOKER.
- The root provider polls just its latest page on the existing 30-second notification fallback and existing invalidations. A history controller runs only while the history page is mounted. It refreshes the number of pages the user requested, starting from the newest cursor chain, so new arrivals do not leave gaps between loaded pages. Stale responses are discarded after invalidation, filter changes, account changes and unmount.
- On the full history page there is a bounded history request in addition to the provider's bounded recent request. This intentionally keeps the panel's All feed independent of history filters. It does not claim to remove every duplicate read. Leaving history stops its older-page refreshes.
- Mark all as read and Clear all remain account-wide, including unloaded records. The SQL updates/deletes only direct notification paths, preserves timestamps and other collections, increments revisions, coordinates with operational commits, and refuses writes during account deletion. Defining these functions does not execute bulk actions.
- A notification absent from the newest page is not assumed new: upsert reads its canonical document in a transaction, preserving its original read/date fields and avoiding another creation push.
- A failed read retains displayed records and shows a retry message. Individual read/delete failures and bulk failures report an error instead of becoming unhandled navigation actions. Legacy Firestore mode retains its existing full snapshot path.

### Proof and release

The route test compares the old path with the new path against real SQL: 55 history rows and three Supabase requests versus a 25-row page and one RPC, with all 55 included in the unread count. These are fixture measurements, not a claim about total production CPU. Further tests cover multiple pages, category filters, equal dates, nanoseconds, deleted cursors, inserted arrivals, malformed dates, unloaded bulk actions, owner/role isolation, account deletion, invalid input, stale requests, cleanup, retries, global badge counts, and preservation of old upserts. The new pager/provider/API tests failed before implementation, then passed. Review's malformed-timezone finding was reproduced and fixed.

Release verification: `npm run check` passed with ESLint, 593 app tests, six relay tests and the production build including TypeScript. Two additional page interaction/error tests and their lint check passed afterward (595 distinct app tests in total). Existing negative-path logs and the existing MODULE_TYPELESS_PACKAGE_JSON warning remain non-failing diagnostics. No real sensor events or physical pushes can be tested while hardware is unavailable.

Database migration applied successfully as `20261015134510_notification_pagination`; the local migration file is aligned with that recorded version. Read-only production SQL returned 25 records from an account with 447 notifications, retained its total count and indicated older pages. The security advisor returned the same 13 pre-existing informational RLS-without-policy notices for server-only tables, with no new warnings/errors; the relevant tables and RPCs retain their browser-role restrictions. Reference: [Supabase RLS advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Read-only production REST verification passed: 25 newest records, 25 older records with no repeated IDs, total count 447, and correct System filtering. A production EXPLAIN of the bounded page read used `operational_notifications_time` and returned 26 rows (25 plus the has-more probe); the sample's execution time was 3.038 ms including its owner-selection subquery. This is one query-plan observation, not a CPU or end-to-end latency improvement claim.

Production acceptance completed on `10443ef`: initial history showed 25 records, Load older increased it to 50, All/Alerts/System and navigation passed, and test-tab cleanup returned Realtime subscription rows to zero. No browser warnings/errors or scoped deployment warnings/errors were found. This verifies bounded history; total request-rate/CPU improvement was not demonstrated. No production bulk action or physical push test was performed.

After Vercel is Ready: open the panel and Notifications; confirm only the newest page appears, use Load older notifications, switch All/Alerts/System, navigate away/back, and compare the unread badge with the account-wide count. If suitable unread test records exist, test mark-read and a second-tab refresh. Destructive Clear all is covered by isolated tests and must not be run on real history just to verify deployment. Physical closed-app push and hardware timing remain separate acceptance checks.

Rollback: restore this iteration's website files from `48bde78` (preserving unrelated/later changes) or revert its isolated commit, then redeploy. Keep the additive database objects in place during website rollback; they do not alter the earlier website paths. Optional database cleanup after the website rollback: remove `operational_notifications_time` and `operational_notifications_unread`, then the `operational_notification_page(text,text,integer,jsonb)`, `operational_notification_bulk(text,text)` and `operational_notification_time(jsonb)` functions through a reviewed migration. This cleanup removes no notification rows. Do not roll back iterations 1-4 or alter firmware.

## Iteration 6: combine ordinary record reads with readiness checks

Baseline: clean work branch `993503b`; production `10443ef`. Scope: reduce repeated ordinary record-read requests while keeping sensor timing, notification delivery, database authorization, and account creation intact.

### Evidence and change

The production log window 14:10-14:20 UTC contained 609 operational-record GETs and 214 migration-state GETs. Privacy-preserving categorization counted 247 profile/other reads, 109 device-configuration reads, and 54/56 cat/catalog-detail reads. These are project-wide counts, not one endpoint's exclusive traffic. Source tracing confirmed that every ordinary collection request called migration readiness, owner-profile readiness, then the requested collection.

Separate one-visible-tab baseline samples on production `10443ef` were collected without hardware: Home 14:25:55.096098-14:27:05.604123 UTC (70.508 seconds), 224 PostgREST setups, about 190.62/minute; Notifications 14:27:38.686159-14:29:15.213547 UTC (96.527 seconds), 334 setups, about 207.61/minute. Both endpoints had two Realtime table subscription rows. The browser was visible and its error/warning logs were empty. Different sample durations/phases prevent attributing the difference solely to the page. Baseline JSON is saved in the task workspace outputs.

The additive `guarded_record_reads` migration defines a service-role-only, SECURITY INVOKER read RPC. It checks current migration/cutover state, owner profile, path shape and page offset inside the same database snapshot as the requested data. PUBLIC/anon/authenticated cannot execute it. No records, existing functions, schedules, table grants or RLS are changed. Implementation follows [Supabase database function guidance](https://supabase.com/docs/guides/database/functions).

Only ordinary owner-scoped reads in `readClientRecords` use this RPC. Firebase identity verification and `accessRecord` remain before it. Own missing-profile lookup still supports new-account creation; cross-owner reads still require an admin claim. Admin/system/deletion-request queries retain their existing paths. Raw imported timestamps and revisions remain intact, photo refresh still happens after reading, and existing 500-record transport batches, scan guard and direct-child filtering remain. Readiness is not cached. An unavailable RPC fails with 503 instead of falling back to an older database.

The runtime regression failed first on the old two-call profile path, then passed with one call. A real PGlite/API fixture compares six dashboard collections: 18 requests through the previous readiness/data primitives versus six guarded calls. A collection larger than 500 records still crosses page boundaries without gaps. Tests retain owner isolation, malformed paths, zero-collection/new-profile behavior, encoded notification IDs, roles, timestamp markers and fresh gates. Independent review found no actionable issues.

This is a database HTTP round-trip reduction for the ordinary record path. It does not remove the underlying readiness queries, bound every collection's total row count, or establish a whole-project CPU reduction. Sensor GET/ingestion, five-second fallback, Realtime/SSE, notification pager, notification IDs/deduplication, FCM/service worker, firmware and camera code are unchanged.

### Release and rollback

`npm run check` passed: ESLint, all 598 app tests, six relay tests and the production build including TypeScript. The existing MODULE_TYPELESS_PACKAGE_JSON diagnostic remains non-failing. Two earlier runs exposed an old three-request assertion and a test fixture that stubbed the former read transport; both were updated, passed focused tests, and were included in the successful full run.

Database migration applied successfully as `20261015143508_guarded_record_reads`; the local migration filename matches the recorded production version. Read-only production REST checks compared six collection results against existing canonical table reads and preserved every returned raw record, including 172 session records and imported data. Own profile lookup also passed. Database security advisors stayed at the same 13 pre-existing INFO notices for RLS-enabled server-only tables with no browser-role grants ([advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Test-tab cleanup returned Realtime subscription rows to zero.

The database dependency is prepared; commit and deploy the website next. After Vercel Ready, verify Home, My Cats, Settings, Notifications, history pagination and navigation using the new commit, then repeat the separate Home/Notifications query-count intervals. Browser acceptance and load measurements must use that new deployment; tests against `10443ef` remain baseline evidence. Include the new `operational_read_records` RPC in request accounting. Hardware, offline replay and closed-app physical push delivery remain separate and pending.

Rollback: restore only this iteration's `lib/server/operationalRecords.ts`, its changed tests and this documentation from `993503b`, or revert the isolated commit after preserving later/unrelated changes. Redeploy. Keep iterations 1-5 and the additive unused RPC during website rollback. Optional SQL cleanup after website rollback removes only `public.operational_read_records(text,text,boolean,integer,boolean)` through a reviewed migration. No record deletion or firmware rollback is needed.

## Vercel build memory follow-up

The preview deployment of `bb8b40c` failed during `npm test`, before the relay tests or Next build. Vercel reported at least one Out of Memory event and a whole-file failure for `lib/server/operationalRfid.test.mjs`; its summary was 597 passed and one failed. Other highlighted rows containing words such as "failed" or "failures" had passing checkmarks and were not failed assertions.

The test script previously left file concurrency at Node's automatic default. Seven application test files use PGlite, so separate PostgreSQL/WASM test processes could overlap and exhaust the build container. `npm test` now passes `--test-concurrency=1`, keeping process isolation and every existing glob/test while executing one test file at a time. The `check` chain still runs lint, all application tests, relay tests and the production build. No dependency, test assertion, database, runtime application, firmware, sensor interval or push-delivery code changes for this follow-up.

References: [Node test process concurrency](https://nodejs.org/api/test.html#test-runner-execution-model), [Vercel build memory troubleshooting](https://vercel.com/docs/deployments/troubleshoot-a-build#build-container-resources). This trades longer test execution for lower overlapping test-process memory; it is not a measured whole-project runtime memory reduction.

Full local `npm run check` passed with exit 0: lint, all 598 application tests, six relay tests and the production build including TypeScript. Application tests took 106.08 seconds. Point observations confirmed one test-file child, with runner-tree working sets of 517.2 MB early and 4437.5 MB during the large integration file; these are Windows point samples, not peak measurements or a guarantee of Linux usage. Independent review found no actionable issues. The existing MODULE_TYPELESS_PACKAGE_JSON diagnostic remains non-failing.

A successful new Vercel preview build remains required before calling the cloud build fixed. No paid build-machine upgrade or Supabase plan change was made. Commit/push `package.json` and this document to trigger that verification. Rollback: restore only the `scripts.test` line in `package.json` from `bb8b40c`, preserving unrelated changes; this restores automatic parallelism and can restore the memory risk. No SQL or firmware rollback is needed.

## Rollback

Only three files belong to iteration 1: `lib/hooks/useDeviceSensors.ts`, `lib/hooks/useDeviceSensors.test.mjs`, and this document. Preserve any later edits before restoring files.

If the patch has not been committed, restore the two hook files from `ea71464` with your Git file-history restore action. If committed as an isolated change, revert that specific commit. Redeploy the restored website if the optimization was deployed. There is no firmware upload, SQL rollback, or Render deployment for this iteration. Do not reset the whole branch.
