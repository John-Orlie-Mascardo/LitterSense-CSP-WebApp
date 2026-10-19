# Background record reads and Vercel CPU

## Evidence and scope

The supplied Functions screenshot shows about 7,100 invocations and 3 minutes of active CPU for `/api/operational/records`, compared with about 1,000 invocations and 6 seconds for `/api/sensors`. The visible chart spans about 12 hours and includes all environments. These figures identify an investigation target; they do not attribute the entire rolling-window CPU allowance to this route or establish duplicate subscriptions.

Current primary-mode record subscriptions each own a 30-second fallback timer. Before this patch they continued refreshing while the browser tab was hidden, and hiding itself triggered another refresh. A controlled local test of five ordinary subscriptions recorded 60 total reads after five hidden minutes: five initial reads plus 55 additional hidden reads. The same scenario after the patch retains only the five initial reads.

This is a measured reduction in the local scenario, not a measured production CPU reduction. Writes, authentication, notification reads, other routes, connected boards and other browser tabs can still consume resources.

## Patch

- Pause ordinary primary-mode record subscriptions while the browser tab is hidden, after their first successful snapshot.
- Preserve initial hydration and retry until the first successful snapshot, including a hidden mount.
- Allow an already running read to finish without starting another hidden timer.
- Coalesce hidden write invalidations into one immediate refresh per subscription on return; then restore the existing 30-second visible cadence.
- Keep notification records and `settings/notifications` subscriptions active in the background. Leave the notification pager, live stream, server push queue and sensor ingest routes unchanged.
- Keep the separate catalog/history refreshes used by primary-mode abnormal-health calculations running in the background. Primary cat status and visit statistics select those snapshots, not the ordinary record snapshots paused here.
- Preserve explicit writes, legacy Firestore subscription setup/metadata, account guards and unsubscribe cleanup.

Navigating between Home, Settings and Notifications is not the same as hiding a browser tab. A visible application retains its normal refresh cadence on all those pages.

## Verification

- Six focused regressions/compatibility checks were added. Four failed on the prior implementation: continued hidden reads, a completing hidden request rescheduling polling, continued reads after hidden hydration, and an unnecessary hide refresh before account change.
- The five-subscription virtual-clock scenario now has zero additional ordinary reads over five hidden minutes, followed by one immediate read per subscription on return and the normal visible cadence afterward.
- All 53 focused dashboard QA, adapter, settings, notification context/pager/live and sensor-polling tests pass.
- Read-only review found no actionable correctness defect. It traced primary health alerts through the independently refreshed catalog/history snapshots; no changed health-alert dependency was found.
- The first full run passed 650 tests and failed one older source assertion requiring every record loop to ignore visibility. That assertion now protects alert, catalog/history and camera loops specifically; ordinary record behavior and notification exceptions are exercised by the behavioral tests.
- Final full `npm run check` passed with exit 0: ESLint, 651 application tests, 6 relay tests, TypeScript and the production Next.js build. The existing non-failing `MODULE_TYPELESS_PACKAGE_JSON` notice remains.
- `git diff --check` passed. Four files are local and uncommitted: `lib/utils/operationalClient.ts`, `lib/utils/operationalClient.test.cjs`, `app/dashboard/qa2.test.mjs` and this note. Production deployment and live acceptance remain pending.

No production load test, hardware event, credential change, schema change or deployment was performed.

## Acceptance after deployment

1. Use one existing signed-in browser tab with the current production deployment. In Network, filter `/api/operational/records`; inspect request payloads to distinguish ordinary collection reads from notification/preferences reads and explicit writes.
2. Switch to another browser tab for one minute. After existing reads finish, ordinary subscribed paths should stop refreshing. Notification/preference reads and actual event processing are expected to remain active.
3. Return to LitterSense. Each ordinary subscription should refresh once immediately, then return to the 30-second fallback. Verify Settings and Notifications still work without toggling saved preferences.
4. Verify a gas alert and one RFID entry/exit, including with the application closed, as part of the existing hardware acceptance work. Local tests do not establish real device push delivery.
5. Compare Production-only invocation and CPU figures over matching usage windows. This patch cannot erase already consumed quota. Inspect the separately reported presence-session errors independently; no cause for those errors is established here.
