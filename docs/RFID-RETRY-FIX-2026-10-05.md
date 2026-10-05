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

No firmware, sensor configuration, gas cooldown, SMS templates or UI was changed. Physical timing and closed-app delivery still require a real board test.

## Approved production release

After user approval, checkpoint `d8765ce475ad8cb1c4349b6ecfe09b2c4d791468` was deployed as `dpl_4v1qxZBrv8kQy22HDrzSPE7mfyrU` and aliased to https://litter-sense-csp-web-app.vercel.app. Vercel repeated the complete gate: 280 application tests, 4 camera tests, lint, TypeScript and production build passed.

The guarded SQL completed successfully for both unchanged fingerprints. Both original timestamps and digests remain unchanged; their conflict flags were cleared and the existing recovery worker subsequently claimed them. Firebase restoration is not yet confirmed while quota errors persist. A manual recovery request returned 401 because the local environment lacks `CAT_HISTORY_PROCESS_SECRET`; no credential was changed, and the existing production worker already claimed the rows.

New-deployment runtime logs show board POSTs returning HTTP 200 through the durable backup path even while their primary Firebase operation reports quota errors. Idle or other unacknowledged uploads can still return 429. This does not prove physical delivery timing; the user was asked to perform a fresh entry/exit test.

A failed local release-export attempt created an empty separate Vercel project named `rfid-repair-d8765ce`; it never replaced the LitterSense alias and was removed during this turn. The corrected release archive was verified to contain `package.json`, the existing project link, and no `.env.local` before the actual deployment.
