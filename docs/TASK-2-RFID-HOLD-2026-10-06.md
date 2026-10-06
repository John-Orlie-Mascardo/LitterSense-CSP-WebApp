# Task 2: five-second RFID registration

## App/backend files

- `lib/utils/rfidEnrollment.ts`: require version 2 reader proof of a continuous 5000 ms hold; progress/reset state, duplicate cat names, expired/malformed/legacy proof rejection and monotonic upload sequences.
- `app/api/sensors/route.ts`: accept hold metadata through the existing authenticated board endpoint, resolve duplicate tags to cat names, retain existing visit processing.
- `app/api/rfid-enrollment/route.ts`: display stale reader progress as reset; preserve online/idle and owner checks.
- `components/cats/RfidHoldProgress.tsx`: a single step-1 circle with smooth frame animation, removal reset and confirmed success checkmark. Animation stops below 100% until the backend verifies the hold.
- `app/dashboard/cats/page.tsx`: one-hold instructions, progress circle, success display, scanned tag handoff to the read-only form and named duplicate errors. Save Cat remains required to persist the profile.
- `lib/utils/catCatalogSync.ts`: reject duplicate tags during the existing profile transaction, including competing saves. Existing owner can retain its tag.
- Tests: `rfidEnrollment.test.mjs`, `catCatalogSync.test.mjs`, `app/api/sensors/rfid.integration.test.mjs`, and `components/cats/RfidHoldProgress.test.mjs`.

## Firmware files

Active project: `C:/Users/Admin/Documents/Arduino/littersense_rfid_test - platform`.

- `include/rfid_enrollment_hold.h`: continuous-read timer, immediate no-tag reset, changed-tag reset, stale-reader reset, timer rollover, completed-proof retention for retries.
- `src/main.cpp`: enrollment bypasses the visit scan latch and observes every valid tag read; visit detection otherwise retained.
- `include/littersense_sync.h`: version 2 progress/presence/duration payloads, latest sample transport, and restart after an acknowledged duplicate-tag rejection. Network uploads remain in the existing background task.
- `tests/enrollment_hold_test.cpp`: runnable host test for duration, removal, tag switch, read gap, rollover, completed proof/retry and reset.

## Defaults

- Continuous hold: 5000 ms.
- Reader-observation gap tolerance: 600 ms (poll interval remains 200 ms); an explicit no-tag reply resets immediately.
- Enrollment request lifetime: 120 seconds, unchanged.
- Normal idle discovery: up to the existing 60-second upload interval, unchanged.
- Browser status polling during enrollment: 500 ms.
- Animation can interpolate up to 2 seconds ahead of its latest sample, capped at 95%; stale server progress resets after 5 seconds. Only reader proof grants success.
- Success shows for 1200 ms before returning to Add Cat.
- No ultrasound is required for registration. Ultrasound visit changes belong to Task 4.

## Verification and limitations

App lint, 290 app tests, four camera relay tests, TypeScript and production build passed. Hold and existing RFID session/upload host checks passed. ESP32-CAM firmware compilation passed. The failing tests first confirmed the old three-scan acceptance, missing animation and missing save-time duplicate guard; the route integration test now covers the real version 2 payload through verification and cancellation.

Existing environment warnings remain: Node's module-type warning for `sensorEndpointDiagnostics.ts`; PlatformIO's Windows long-path/codepage notices. These files/settings were not changed. No new build/lint warnings were introduced.

No deployment, flashing, serial boot verification, physical registration or phone visual acceptance test has been performed. Other Arduino sketch copies were not modified; use the active PlatformIO project above. Registration still requires available Firestore and internet; quota fallback for enrollment is outside this task. Tasks 3–5 have not started.

## Physical test after deployment and RFID upload

1. Open Add Cat and press Scan; wait for Reader ready.
2. Hold an unused tag near the reader for 2 seconds, then remove it. Verify that the circle resets and the hold hint appears; the tag field must not be accepted.
3. Hold that tag continuously for 5 seconds. Verify the checkmark, Tag registered and scanned value in the read-only field. Save Cat.
4. Start another cat and hold the saved tag again. Verify the original cat's name and rejection. Try a different tag without restarting the reader.
5. Repeat with a tag switch mid-hold and a connection interruption; no short or stale progress should grant success.
