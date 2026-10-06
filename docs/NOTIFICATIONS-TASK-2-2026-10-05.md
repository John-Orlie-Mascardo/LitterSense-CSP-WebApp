# Notification task 2: server RFID entry and exit alerts

Scope: normal RFID entry/exit push and notification creation without an open dashboard. No firmware, sensor detection, gas cooldown, SMS recipient or SMS detection rule changes. Deployed after approval on October 5, 2026; closed-app physical delivery verification is pending.

## Changes

- `lib/utils/rfidNotifications.ts`: authenticated device mapping resolves the owner and registered cat. Fresh active-session uploads create entry alerts. Persisted completed visits create exit alerts. Exit timeouts are not falsely called confirmed physical exits.
- Stable per-device event keys and the existing outbox unique constraint deduplicate concurrent heartbeats and visit retries. RFID rows are push-only (`status=cancelled` for SMS). Global/per-cat RFID preferences and existing worker quiet hours apply.
- `app/api/sensors/route.ts`: queues alerts from accepted sensor ingestion, verifies primary saved session IDs or durable backup records for exits, then invokes the existing independent push worker. An alert-store failure requests firmware retry without incrementing the saved visit again.
- `components/dashboard/RfidVisitBridge.tsx`: removes the browser RFID writer; existing gas behavior stays in place.
- `app/api/push/dispatch/route.ts`: refuses browser dispatch for RFID records so old open dashboard tabs cannot send a second push.

## Verification

Tests cover server-only entry/exit, stable IDs despite heartbeat duration and sub-second retry timestamp changes, concurrent duplicate uploads, unmatched/ambiguous tags, stale replay exclusion, disabled global/per-cat preferences, owner mismatch, persisted-exit requirements, and queue failure/recovery without visit increments. Existing gas, SMS, sensor, history and service-worker tests remain in the suite.

Vercel's deployment checks passed all 278 application tests (including the queue-failure assertions), all 4 camera tests, lint, TypeScript and the production build. No test notifications or synthetic sensor records were sent during this verification.

Production deployment: `dpl_Dnq3h3La8qMGYFqzPENGnDGCdXfs`, source checkpoint `9465feb`, aliased to https://litter-sense-csp-web-app.vercel.app. Live `/sw.js`, `/manifest.json` and the PNG notification icon returned HTTP 200 with correct content types.

## Limits and rollout

- A push marked sent means Firebase accepted at least one device; physical background delivery still needs task 3/4 verification.
- Entries older than 3 minutes and exits older than one hour are not replayed as new alerts.
- During a Firestore outage, push can still be queued from verified backup ownership. Saving the notification history is best effort and is not automatically retried if that Firestore create fails.
- Old open tabs may still create their legacy inbox records until refreshed; their browser RFID push dispatch is disabled in the new server deployment. Refresh all clients after deployment.
- No database migration was required. After the controlled background push test, test a registered tag with an object, with all dashboards closed. Confirm one entry and one exit push and one visit; refresh dashboard afterward to inspect history.

Task 3 remains separate: establish background OS notification delivery on Android and PC and diagnose any per-device failures without changing the gas cooldown.
