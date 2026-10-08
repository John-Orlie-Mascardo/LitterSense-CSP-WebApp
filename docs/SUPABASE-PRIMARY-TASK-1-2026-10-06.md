# Task 1: Supabase primary migration inventory and plan

## Status and scope

Inventory completed on 2026-10-06. This document changes no runtime behavior, live schema, firmware, or production deployment. Complete one task at a time and report its result before proceeding.

Target: retain Firebase Authentication for account identity, and FCM for push transport. Make the existing Supabase project authoritative for operational records. Keep the existing camera relay for video and IPROG for SMS. Preserve owner UIDs, cat IDs, tag associations, device tokens, camera IDs and key hashes, session IDs, preferences, quiet hours, and existing alert behavior.

## Verified existing database

The local SUPABASE_URL matches the active LitterSense SMS project, reference `yrshzmpyiibchtznbjkv`. Read-only live schema inspection found these public tables, all with RLS enabled:

- `sms_accounts`: owner identity, phone, preferences, cats JSON, FCM tokens.
- `sms_devices`: device token hash and owner.
- `sms_visits`, `sms_outbox`, `sms_gas_state`: alert events, independent delivery state, and gas state.
- `sensor_snapshots`: RFID and gas/ultrasonic snapshots with server receipt times.
- `cat_backup_catalogs`, `cat_profile_backups`, `cat_visit_backups`, `cat_history_backup_progress`: existing catalog/history backup and recovery state.

Existing RPCs include `save_sensor_mirror`, `read_sensor_mirrors`, `remember_sensor_device`, catalog/history read/write/claim functions, `sync_sms_account`, `register_push_token`, and SMS/push outbox claim functions. Reuse this project, REST transport, ownership mapping, and alert outbox. There are no public camera or RFID enrollment tables in the inspected schema.

## Actual feature paths

| Feature | Files and dependencies to migrate |
| --- | --- |
| RFID enrollment | `app/api/rfid-enrollment/route.ts` starts, reads and cancels enrollment in Firestore; `app/api/sensors/route.ts` checks enrollment and accepts reader proof. `lib/contexts/CatContext.tsx` and `app/api/cats/route.ts` manage cat registration. |
| Cat/tag ownership and visits | `lib/utils/catCatalogSync.ts`, `catHistoryReads.ts`, `catHistoryBackfill.ts`, `catVisitRecovery.ts`, `lib/contexts/CatContext.tsx`, `lib/hooks/useSessionHistory.ts`, and `useCatBackup.ts`. Current mutation authority is Firestore even where backup reads work. |
| Gas and RFID snapshots | `app/api/sensors/route.ts`, `lib/utils/sensorSnapshotStore.ts`, `sensorSms.ts`, `smsAccountSync.ts`. Both sources already have snapshot fallback; registration is a separate missing path. Preserve freshness checks and source isolation. |
| Device provisioning | `lib/hooks/useDeviceProvisioning.ts`, `app/api/device-config/[configToken]/route.ts`, `components/onboarding/OnboardingFlow.tsx`. Preserve API response and board authentication contracts. Protect provisioning secrets and never log their values. |
| Camera | `lib/server/cameraCloud.ts`, `app/api/camera/pair/route.ts`, `app/api/camera/device-session/route.ts`, and camera session callers. Owner pointers, camera key hashes, revocation and last-seen writes currently use Firestore. Keep relay tickets and video transport. |
| Accounts and settings | `lib/contexts/AuthContext.tsx`, auth login/signup pages, dashboard Settings, `lib/hooks/useSettings.ts`, onboarding and SMS account sync. Firebase sign-in remains; profile, phone, onboarding and preference records move. |
| Notifications and analysis | `lib/contexts/NotificationContext.tsx`, `lib/utils/rfidNotifications.ts`, `pushDelivery.ts`, `app/api/push/register/route.ts`, `app/api/push/dispatch/route.ts`, `app/api/sms/sync/route.ts`, `app/api/predictive-health/route.ts`. Preserve alert IDs, deduplication, gas push cooldown, SMS cooldown and quiet hours. |
| Reports, administration, deletion and photos | `lib/hooks/useReports.ts`, `AdminContext.tsx`, `DeleteRequestContext.tsx`, admin routes/pages, `lib/utils/deleteUserData.ts`, `catPhoto.ts`, `ownerPhoto.ts`, Firebase configuration. Preserve current authorization policy; migrate operational records and media lifecycle without unrelated policy changes. |

Firmware locations found:

- RFID: `C:\Users\Admin\Documents\Arduino\littersense_rfid_test - platform\src\main.cpp` and `include\littersense_sync.h`, enrollment/session headers and tests.
- Gas: `C:\Users\Admin\Documents\Arduino\gas_sensor - platform\src\main.cpp` and sensor configuration/presence headers.
- Camera: `C:\Users\Admin\Documents\Arduino\LitterSense-Camera\CameraWebServer - platform\main.cpp`, `cloud_camera.h`, `app_httpd.cpp`, and router/setup headers.

Keep public board API contracts stable where possible. Changing the database behind those endpoints should not require reflashing. A firmware upload is required only if a verified protocol dependency needs a source change; compilation alone is not hardware verification.

## Diagnosis boundaries

The RFID start route requires Firestore reads and a write before enrollment can begin, explaining why gas snapshot fallback alone cannot keep registration running. Camera authorization reads Firestore and device-session updates lastSeen before granting a relay ticket, so quota errors can block reconnects. The camera screenshot's generic unavailable message also covers missing relay configuration: source inspection demonstrates the dependency but does not prove the exact runtime cause of that incident.

## Ordered implementation tasks

1. **Inventory and migration plan (this document).** Read-only source and live schema inspection.
2. **Schema, ownership and import foundation.** Add versioned, additive migrations and atomic server-only operations for authoritative operational records. Reuse existing tables and RPCs where their invariants permit; do not blindly turn incomplete backups into canonical data. Preserve Firebase UIDs as text. Include profile/settings/device configuration, cat/tag uniqueness, enrollment, camera registry, history and notification needs. Add an idempotent import with counts/conflict reports and a dry-run mode. Keep runtime on the old path until reviewed.
3. **Cat registration and RFID.** Move catalog mutation/lookups and enrollment lifecycle to Supabase, including continuous five-second hold proof, early-removal reset, duplicate tag rejection, cancellation, expiry, board ownership, session persistence and retry deduplication. Keep the current entry/exit state machine constants and semantics.
4. **Sensors, provisioning and camera.** Make existing snapshot storage primary, preserve gas behavior, and remove Firestore requirements from device configuration and camera authorization/pairing/status. Preserve camera IDs and key hashes so existing boards remain paired. Keep video on the existing relay.
5. **Remaining app records and cutover.** Move profile/settings, in-app notifications, report/analysis inputs, administrative operational records and photo storage lifecycle. Keep Firebase Auth and FCM SDKs. Remove operational Firestore listeners/writes and disable old Firestore-to-Supabase catalog repair/account-sync jobs and Supabase-to-Firestore visit recovery before enabling primary mode. All producers and workers must use the same authoritative records.
6. **Full QA, deployment and physical acceptance.** Run existing tests, build/type/lint gates, migration tests, browser checks, fault tests and user hardware checks. Report software results separately from deployment, flashing and observed hardware behavior.

## Data safety and transition gates

- Export available source records and existing Supabase backups; compare stable IDs and per-owner counts. Retain tombstones, revisions, session dedupe keys and deletion semantics.
- A backup that is missing records cannot recreate them. If Firestore quota prevents reading unbacked profiles, provisioning or camera credentials, wait for accessible source reads or obtain a verified export before declaring import complete. Do not manufacture camera secrets or reset pairing silently.
- Use additive schema changes and constrained atomic writes. Enrollment proof and cat/tag claim must not allow concurrent registrations to attach the same tag to different cats.
- Keep service credentials server-side with existing env configuration. Restrict public-table access and RPC execution; derive owner identity from verified Firebase ID tokens and device identity from existing validated credentials.
- Do not switch a live deployment to Supabase primary until required schema and import checks pass. Preserve the old database for a recovery window; no destructive deletion during migration.
- Rollback after new Supabase writes requires exporting/reconciling those writes into the old path first. Simply flipping back would risk missing new cats, visits, settings and pairing changes.
- Log source/mode transitions, ownership failures, retry state and import counts without tokens, keys, phone numbers or Wi-Fi passwords.

## Required QA evidence

- Firebase Authentication continues to work while operational Firestore reads/writes are deliberately rejected in controlled tests. Do not disable authentication verification to simulate an outage.
- Register a new cat/tag through Supabase: hold five seconds, remove early, duplicate tag, reader offline, timeout, cancel and retry.
- Exercise entry/exit pairs, repeated tags, other cat while occupied, no ultrasonic confirmation, 15-minute incomplete timeout and reboot recovery using current configured values.
- Verify snapshots, config/provisioning and camera pairing/reconnect with Firestore unavailable; confirm wrong-owner/revoked credentials fail.
- Compare imported history and cat IDs; repeated events/import runs create no duplicates. Verify empty cats/history, offline UI and deletion behavior.
- Verify NH3 and H2S separately for foreground, background and closed LitterSense; confirm actual phone notification arrival, not merely FCM acceptance. Verify SMS preferences/quiet hours and cooldown independently from push.
- Run existing app, firmware state/hold, and relay tests plus necessary migration/ownership/concurrency tests. Build/lint/typecheck and inspect mobile/desktop navigation.
- Document actual migration/deployment status and any unperformed physical tests. Do not label compilation or an HTTP success as end-to-end hardware success.
