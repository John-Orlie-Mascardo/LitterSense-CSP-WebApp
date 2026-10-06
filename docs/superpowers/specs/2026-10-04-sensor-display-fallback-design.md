# Sensor display during Firestore outages

## Goal and scope

Keep RFID, gas, and ultrasonic readings visible when Firestore cannot read or write because of quota or a temporary service failure. Determine connectivity from accepted device heartbeats, independently for RFID and gas/ultrasonic. Database failure must not imply hardware disconnection.

This phase changes only the existing sensor upload/read path and sensor status presentation. It does not migrate visit history, enrollment, camera, authentication, photos, notifications, or firmware. It does not implement full database replication or replay visits to Firebase.

## Existing flow

Devices POST to `/api/sensors` with a provisioning token. Firestore verifies ownership and stores RFID and gas snapshots separately. Authenticated dashboard GET requests read those snapshots. Both snapshot converters currently use a three-minute freshness window. Visit acknowledgements require history persistence; the existing SMS integration provides a hashed device-to-owner backup in Supabase.

## Storage and ownership

Reuse the existing Supabase project and server-only REST helper. Add one snapshot table keyed by verified device token hash and source (`rfid` or `gas-ultrasonic`), with normalized JSON readings and a server receipt timestamp. Link it to the existing verified device mapping with deletion cascading on device rotation/removal. Do not store raw tokens, Wi-Fi credentials, or client-supplied owner IDs.

Enable RLS and deny browser roles all table/function access. The server verifies Firebase identity for dashboard reads and resolves only that owner's active device mappings. SMS opt-in is not required for sensor snapshots.

Bootstrap ownership through the existing authenticated account/device sync while Firestore is healthy. During healthy device uploads, resolve the current owner from Firestore and refresh the corresponding trusted backup mapping; mapping maintenance must not erase SMS settings or other active mappings. Unknown tokens fail closed during an outage. A readable Firestore missing/revoked config must not be rescued by an older Supabase mapping. Existing account/device removal paths must clear fallback access; direct changes outside the app during an outage are not immediately discoverable.

## Upload behavior

Reuse the existing request normalization and snapshot builders. Store validated live readings in Supabase during healthy operation and when Firestore returns quota/service errors. Reject malformed readings before saving. Each source updates only its own snapshot and receipt timestamp. Partial RFID payloads preserve unrelated fields through an atomic merge; delayed concurrent writes cannot overwrite newer receipts. Event retries must not synthesize successful history or enrollment state.

Preserve the primary Firestore result and visit acknowledgement semantics. Saving a live snapshot in Supabase never acknowledges a completed visit that Firestore has not persisted. Devices retain their existing retry behavior during outages. A mirror failure must not change an already successful sensor response or refresh a stale timestamp. Report mirror failures in server logs without secrets.

## Dashboard behavior

Keep `/api/sensors` and its established reading fields. On a healthy Firestore read, use fresh Firestore readings; use a fresher authorized Supabase snapshot when Firestore is stale or missing, including immediately after quota recovery. Resolve the preferred reading independently for RFID and gas/ultrasonic. On Firestore quota/service failure, read the authorized Supabase snapshots.

Use server receipt times and the existing 180-second freshness window. Do not reset receipt time merely because a snapshot is read or copied. Fresh readings can show Online; expired readings show Stale / No recent heartbeat and expose their last-update time. If neither storage path can be read, show Status unavailable / Cloud error. Missing mappings or missing data must be distinguishable from a proven recent heartbeat. Never treat authentication failures as fallback eligibility.

Fallback metadata may be added to the response for last-update and source information. Existing reading fields and dashboard polling cadence remain compatible. On recovery, normal accepted device uploads refresh Firestore again; no bulk copying or role switching is required.

## Verification and release

Run targeted route/status tests for healthy mirroring, quota failures on GET and POST, separate source freshness, stale Firebase versus fresh Supabase, concurrent/partial updates, invalid payloads, owner isolation, unknown/revoked/rotated tokens, both databases unavailable, mirror failure after successful primary save, and recovery. Assert that fallback storage never invents visit/enrollment acknowledgements.

Run database checks in rolled-back transactions with temporary mappings; verify grants and cascading deletion. No test records or synthetic health alerts may reach the live SMS queue. Run existing sensor/RFID/SMS tests, lint, and production build before deployment.

Deploy with the previous deployment and migration rollback recorded. Verify real hardware heartbeats and dashboard freshness separately from simulations. Test simulated quota errors through controlled mocks; do not exhaust the real Firebase quota. Completion requires a real authorized heartbeat captured in Supabase and correct dashboard behavior under the simulated outage.

## Limitations

Supabase also has quotas and outages; this adds resilience, not guaranteed continuous availability. The initial verified ownership copy must precede a Firestore outage. History and enrollment may remain unavailable during that outage even while live sensor display works. Existing firmware retries can increase traffic; optimizing that is a separate task. The dashboard still relies on Firebase Auth and existing cat/profile context; this phase only protects sensor display, not the entire application.
