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

Baseline: clean `orlie-branch` at `be826c7c85117f89dc548c006b8a8830eac506f2`. Status: source change prepared; website deployment and post-deployment load comparison pending. No production records, schema, schedules, firmware, or relay settings were changed.

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

## Rollback

Only three files belong to iteration 1: `lib/hooks/useDeviceSensors.ts`, `lib/hooks/useDeviceSensors.test.mjs`, and this document. Preserve any later edits before restoring files.

If the patch has not been committed, restore the two hook files from `ea71464` with your Git file-history restore action. If committed as an isolated change, revert that specific commit. Redeploy the restored website if the optimization was deployed. There is no firmware upload, SQL rollback, or Render deployment for this iteration. Do not reset the whole branch.
