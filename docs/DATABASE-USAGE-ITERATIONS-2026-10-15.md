# Database usage iterations - October 15, 2026

## Goal and constraints

Reduce avoidable website database reads while retaining prompt visible sensor updates and server-originated push notifications with the app closed. Work one measured iteration at a time. RFID diagnosis is paused. Firmware, database schemas, alert generation, and the camera are outside iteration 1.

## Iteration 1: hidden dashboard sensor reads

Status: source implemented; local verification recorded below. Production deployment and device/browser acceptance remain pending.

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

## Rollback

Only three files belong to iteration 1: `lib/hooks/useDeviceSensors.ts`, `lib/hooks/useDeviceSensors.test.mjs`, and this document. Preserve any later edits before restoring files.

If the patch has not been committed, restore the two hook files from `ea71464` with your Git file-history restore action. If committed as an isolated change, revert that specific commit. Redeploy the restored website if the optimization was deployed. There is no firmware upload, SQL rollback, or Render deployment for this iteration. Do not reset the whole branch.
