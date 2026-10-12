# Offline Gas Notifications and History

## Status — October 12, 2026

Production Supabase migration applied on October 12, 2026, following explicit approval. The deployed Vercel app was verified to expose gas history and the notification interface. The 9:03 PM test notification was recovered, stored once, and delivered through the existing push worker. The user confirmed it appeared on both phone and website. No SMS was sent and no firmware changed during activation. Source Git push/commit state was not changed during this activation.

## What failed in the physical test

The gas board captured and uploaded the readings correctly. The verified production rows show MQ135 detection at 8:17:55 PM and clear at 8:18:27 PM (UTC+08:00), received at 8:19:34 and 8:19:36 PM. The website previously stored these historical events without rendering gas history or creating historical notifications.

## What changes

- Dashboard Recent Activity includes a Gas Sensor History preview. Session History includes the full gas history with 50-row receipt-based cursor pages and a Load older readings button.
- Each row separates Recorded time from Uploaded time. An unavailable original time stays Time uncertain.
- The owner-authenticated history GET endpoint returns only that owner's gas records. It cannot edit history. Existing device-token POST validation and exact acknowledgments remain.
- Saved gas history invalidates the existing realtime sensor channel; the history component also refreshes while visible every five seconds and immediately on returning to the tab.
- A database trigger atomically creates missed gas notification/push intent together with the history row. If alert persistence fails, the history write rolls back and the board retains its event for retry.
- Saved detections have their original occurrence time and are clearly labeled. Consecutive active readings, retries, and delayed earlier samples from one episode do not produce separate alerts.
- Current gas snapshots and gas-state tracking are not changed by historical replay. A new current detection does not hide an earlier closed detection.
- Existing urine/stool preferences and push delivery quiet hours apply. Unknown-time samples are history only. Events older than 24 hours can appear in the notification history but do not produce stale push backlogs.
- The existing push worker is scheduled after a dated gas history upload, using the device's verified owner. Historical gas rows set SMS status to cancelled; no SMS sender is invoked.

## Files

- `supabase/migrations/20261012210000_offline_gas_notifications.sql`: transactional alert bridge, episode dedupe, service-only recovery, capture index.
- `lib/server/gasHistory.ts`: bounded owner-scoped reads and receipt/path pagination preserving database timestamp precision.
- `app/api/sensors/history/route.ts`: authenticated GET and background push processing after saved dated gas history POST.
- `components/history/GasSensorHistory.tsx`: preview/full history, original/upload time, retry, pagination, realtime/fallback refresh, account isolation.
- Dashboard and Session History pages: embed the shared history component.
- `lib/server/notificationRealtime.ts`: history insertion invalidation.

## Activation order

The activation below was completed for this production project on October 12, 2026. Firmware did not need another upload. Retain this sequence for future releases; production database changes still require authorization.

1. Apply the new SQL migration to the intended Supabase project. It requires existing operational primary/cutover and gas notification/outbox/snapshot tables. It does not automatically send old alerts.
2. Deploy the webapp to Vercel and verify its production alias is ready.
3. For already acknowledged events, call `public.reconcile_gas_history(verified_owner_id, receipt_start_time)` server-side. Scope it to the user's test window, not all accounts. The function accepts a maximum seven-day range and refuses more than 1,000 matching rows; narrow the range if needed. It is idempotent and runs under the same commit lock. Browser roles cannot execute it.
4. Run the existing push worker for that owner. Only after activation, check the notification bell, history rows, and actual phone/PC push. Provider acceptance alone is not proof of system notification display.
5. Run a fresh physical test: online baseline, internet off with hotspot/boards powered, gas detect then clear, internet restored. Confirm original times, one saved detection notification, history rows, and accurate current Clear state.

## Verification

Database regression tests use the real PostgreSQL schema (PGlite), including actual `service_role` privileges: detection/clear replay, original times, retries, opt-out, owner isolation, independent gas kinds, missing heartbeat, unrelated later live detection, out-of-order samples, old-record recovery, failed-alert rollback, old push suppression, and browser permission denial.

Additional tests cover authenticated API reads, immutable acknowledgments, background push without SMS, bounded cursors with microseconds, history rendering, account changes, realtime invalidation, and existing push delivery. Production build passed. The initial full app run caught an unnecessary background worker for undated gas history; corrected and the original database regression now passes. The full app suite passed 539 tests; the final focused run passed 16 tests after the last SQL checks, including short outages and service-role permissions. Targeted ESLint and the production build passed. Results are recorded in the workspace verification log.

Production SQL application, exact test recovery, website notification display, and gas history timestamps were verified. Phone system notification display was confirmed directly by the user. A new physical outage after activation remains the next acceptance check for automatic trigger operation; recovery of an already uploaded test alone does not prove future automatic delivery.

## Rollback

Revert the website patch to hide the added history reader/UI. To stop future historical alerts, drop only the `queue_missed_gas_history` trigger on `public.operational_records`. Restore `save_gas_notification_history` from the prior `20261008094002_notification_realtime.sql` migration if reverting its presentation too. Preserve the historical readings and existing notification/outbox records. Reverting source does not unsend already delivered notifications; use owner/event-scoped reconciliation for pending outbox state when necessary.



## Production activation evidence — October 12, 2026

All times UTC+08:00.

- Correct Supabase project verified: `yrshzmpyiibchtznbjkv` (LitterSense SMS). Required Vercel variables present; deployed primary mode true. Secret values remained hidden.
- Previous production `save_gas_notification_history` function was read and backed up before changes.
- First migration transaction hit PostgreSQL deadlock `40P01` while live uploads continued and rolled back. Added the existing writer's advisory-lock order and explicit table lock with five-second lock timeout and thirty-second statement timeout; ten real SQL tests passed after this guard. The guarded transaction then succeeded.
- Production API schema exposes `reconcile_gas_history` and `queue_missed_gas_event` after application.
- Recovery processed only exact gas-board events `a68ef1b7c8bab87e_66` and `_67`, asserting two rows and one owner, under the same commit lock. It did not replay every user's history.
- One recovered notification: `Urine detected (saved detection)`, occurred `2026-10-12T13:03:06.000Z` (9:03:06 PM).
- Its SMS status is `cancelled`; push status `sent`. Provider accepted four of four registered devices at 9:20:19 PM. The user independently confirmed phone and web display.
- Gas history UI shows detection Recorded 9:03:06 PM / Uploaded 9:04:27 PM and clear Recorded 9:03:14 PM / Uploaded 9:04:28 PM. Current gas cards stayed Clear.
- Dashboard gas history preview and full Session History gas section verified in the existing production Vercel deployment after refreshing the older open tab. No new Vercel deployment or environment edit was performed during database activation.
- Verification screenshot and sanitized activation results saved in the Codex workspace outputs. No secret values are included.

### Remaining physical check

Run a fresh offline detect/clear cycle with the LitterSense hotspot and boards powered. Restore internet and confirm the new notification arrives automatically without manual recovery. This is separate from the recovered-event delivery already confirmed.
