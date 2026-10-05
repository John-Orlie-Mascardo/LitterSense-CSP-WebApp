# RFID delayed exits and retry repair

## Confirmed causes

- Production `/api/sensors` logs during the incident report Firestore HTTP 429, `RESOURCE_EXHAUSTED`, `Quota exceeded`. A successful dashboard GET can use backup readings while board POSTs fail against Firebase.
- Firmware boot identifiers contain 32 hexadecimal characters. `preserveFirmwareVisitTime` accepted at most 16, so the existing sub-second timestamp-jitter protection did not apply to real board retries. Tests using the real identifier reproduced three failures before the one-line fix.
- A durably backed-up outage visit still returned the primary error without the board acknowledgement. The board therefore retained the head visit and delayed uploading subsequent completed visits.
- RFID notification inbox creation was awaited before returning the HTTP response and scheduling the push worker. Firebase SDK quota retries could delay that path independently of the durable push queue.

## Narrow repairs

- `lib/utils/catVisitIngestion.ts`: accept existing boot identifiers up to 32 hexadecimal characters; retain exact duration, status, cat, gas and sub-second time checks. After durable outage storage, acknowledge only one exact, owner-verified, matching visit in a usable backup state.
- `app/api/sensors/route.ts`: return HTTP 200 and the exact firmware event acknowledgement only when backup verification succeeds. Response explicitly reports Supabase storage with recovery pending. Conflicts, failed storage, unmatched tags and unauthorized devices stay unacknowledged. Push/SMS queue failures still request retry.
- `lib/utils/rfidNotifications.ts`: schedule best-effort Firebase inbox creation after the response. Durable outbox insertion still finishes before acknowledgement; the push worker does not wait for inbox creation. Existing limitation remains: failed inbox creation is not automatically replayed.
- Tests in `catVisitIngestion.test.mjs`, `catVisitRecovery.test.mjs`, `rfidNotifications.test.mjs` and `app/api/sensors/rfid.integration.test.mjs`: real firmware IDs, jitter, midnight, concurrent/lost replies, count-once recovery, quota backup acknowledgements, quarantined records, owner mismatch, and background inbox creation.

## Existing affected records

Two stored visits are quarantined: approximately 2:14 PM (49 seconds) and 2:22 PM (58 seconds), Philippine time on October 5. The 2:22 visit was absent from Firebase on the read-only audit; the other Firebase audit encountered quota code 8. Original backup data is preserved.

The accompanying SQL is a reviewed, guarded recovery operation, not a schema migration. It requeues only these two exact unchanged fingerprints, only under a current backup device/catalog mapping. It changes processing state and retry metadata, never visit data, duration, identity or digest. The existing recovery transaction checks Firebase identity again and will quarantine a genuine conflict instead of overwriting data or incrementing twice.

## Verification and release boundary

Focused tests: 22 passed. Full gate: 280 application tests and 4 camera-relay tests passed; lint, TypeScript and the production build passed. The initial sandboxed camera gate could not complete its socket tests; the approved socket-capable rerun passed them.

No firmware, sensor configuration, gas cooldown, SMS templates, UI or production database was changed. Publishing and executing the guarded recovery operation require the user's staged release approval. Physical timing and closed-app delivery remain unverified until deployed and tested with the real board.
