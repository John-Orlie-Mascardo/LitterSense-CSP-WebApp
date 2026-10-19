# RFID alerts away from Home — task 3

## Scope

The user reported inconsistent RFID entry/exit alerts on Settings and Notifications, with exits apparently requiring Home. This task investigates the server alert path and closes a verified notification-history retry gap. The physical Home-page correlation is not yet reproduced or explained by the available evidence.

## Evidence

- Current authenticated `POST /api/sensors` persists matched RFID events, queues their server alerts, and schedules push delivery independently of a browser. `RfidVisitBridge` has no RFID notification creation path; `useRfidVisitTracker` has no current callers.
- Read-only production checks on October 19 found that the latest 12 queued RFID notices each have an inbox row and `push_status=sent`. Provider acceptance does not prove display on a phone.
- The recorded 3:46:07.831 PM exit was queued at 3:46:49.259 PM, about 41 seconds later. A subsequent session began at 3:46:09 PM and was saved as `NO_EXIT_TIMEOUT` at the 4:01:09 PM limit. A timeout is not evidence of a physical exit, so it must not produce a "left the litter box" notice.
- These records do not establish that visiting Home caused delivery. Board capture time, network upload, server persistence, provider acceptance and browser display are separate stages.

## Verified defect and patch

Previously, even in Supabase primary mode, the bell notification was saved by a deferred `after()` callback. All failures there were logged and swallowed. The server could acknowledge a completed event after its session and push outbox row were durable but before its bell notification existed. A later idle heartbeat did not repair that missing row.

Primary inbox persistence now completes before `queueRfidNotifications` resolves, using the existing bounded revision-conflict retry. A failure propagates to the sensor route's existing HTTP 503 response without the event acknowledgement, allowing the reader to retry the same event. A duplicate retry repairs missing bell history while preserving an existing row's read state/date and the existing outbox delivery state. Push IDs and visit IDs remain stable.

Legacy Firestore background writes retain their existing behavior. No SQL migration, firmware upload, session-state logic, sensor cadence, preference rule or production record is changed. The code performs the same normal inbox read/write work before the response rather than deferring it; extra reads occur only on revision-conflict retries. No Vercel CPU reduction is claimed.

The existing eligibility limits still apply: entry notices must be at most three minutes old, and exit notices at most one hour old. This patch does not provide unlimited recovery after a long outage.

## Verification

- A real API/PGlite regression failed against the original source: an injected primary inbox failure returned HTTP 200 rather than the required retryable 503.
- Focused checks pass for failed entry/exit inbox persistence, retry repair without a browser or deferred callback, one saved visit/outbox event, preservation of read state/date, legacy queue behavior, and suppression of timeout/interrupted physical-exit notices.
- Final `npm run check` passed with exit 0: ESLint, 638 application tests, 6 relay tests, TypeScript and production Next.js build. The existing non-failing `MODULE_TYPELESS_PACKAGE_JSON` notice remains.
- `git diff --check` passed. Four task 3 files are local and uncommitted; no deployment or physical delivery test has been performed for this patch.
- Production checks were SELECT-only. Tests used isolated local storage; no real event, push or SMS was generated.

## Acceptance after deployment

1. Enable RFID Entry/Exit and verify notifications are allowed on the test device. Keep the hotspot and boards connected.
2. Stay on Settings throughout one confirmed entry and exit. Record the local scan times; do not return to Home to cause an update. Verify bell entries and phone/system pushes separately.
3. Repeat on Notifications. Confirm one entry and one exit, with one completed visit and no extra counts after a refresh.
4. Close the webapp and repeat using a valid existing push registration; phone delivery remains a physical test.
5. If an alert is missing, compare the same event's uploaded session, inbox row, outbox status and provider result before changing firmware. A timeout/interruption must remain distinct from a confirmed exit.

Commit and deploy this patch before claiming the reported hardware/browser behavior is fixed. The next separate tasks remain completed-versus-ongoing session identity, then gas telemetry recovery after internet reconnect.
