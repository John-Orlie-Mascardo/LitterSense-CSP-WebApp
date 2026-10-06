# Task 4 - RFID and ultrasonic visit flow

## Status
Source implementation and automated checks complete. No deployment, board upload, boot-log inspection, or physical verification performed. Task 5 has not started.

## Flow
IDLE -> TAG_READ -> INSIDE -> EXIT_TAG_READ -> IDLE.
Both TAG_READ states request a unique authenticated ultrasonic confirmation. A matching response is accepted only before the deadline. Each request requires two fresh near readings. Keeping a tag on the reader does not count as a second tap.

## Defaults and edge cases
| Case | Behavior |
| --- | --- |
| Presence without a prior RFID request | Sensor readings continue; no session is created. |
| RFID without ultrasonic confirmation | Request expires after 5 seconds. Entry returns to idle; failed exit returns to inside with the original start and cat. |
| Different tag during an open session | Ignored; original cat and session retained. |
| Rapid or continuously held tag | 1-second debounce plus 3 continuous seconds of successful no-tag readings before rearming. UART failures do not count as removal. |
| No confirmed exit | At 15 minutes, close as NO_EXIT_TIMEOUT and display Incomplete / Not confirmed. Existing timeout health notification rules remain. |
| Reboot during a pending pair | Pending request is discarded. Require a new removal window and new pair. |
| Reboot during a confirmed visit | Persist active identity in ESP32 Preferences. On boot, queue SESSION_INTERRUPTED with stable identity; never resume it as inside or report a physical exit. |
| Recovery awaiting cloud acknowledgement | New visits wait until the interrupted record is durably accepted. It survives another reboot and retries without changing identity. |
| Recovery storage/upload-task failure | Block new visits and emit a serial error instead of silently losing recovery. |

Constants: RFID_DEBOUNCE_MS, REMOVE_TAG_MS, SESSION_TIMEOUT_MS near the top of RFID src/main.cpp; RFID_CONFIRM_TIMEOUT_MS at the top of rfid_confirmation.h. Existing ultrasonic constants stay at 2-30 cm detection, 34 cm clearance, and 100 ms sampling. The existing /confirm-entry endpoint name remains for compatibility and now serves both pairs; it already resets confirmation for every unique request.

The sensor confirms fresh presence, not physical direction. Entry versus exit follows the first/second same-tag pair requested by this task.

## Files changed
### RFID project: C:/Users/Admin/Documents/Arduino/littersense_rfid_test - platform
- src/main.cpp: explicit states, confirmation for both pairs, debounce, timeout closure, safe initial rearm.
- include/rfid_confirmation.h: serial errors now describe entry and exit confirmation.
- include/littersense_sync.h: upload event status, active-visit Preferences journal, stable interrupted replay, acknowledgement handling, startup failure guard, test transport observations.
- include/rfid_session_journal.h (new): versioned active/recovery record validation and reboot transition.
- tests/session_test.cpp: real firmware entry/exit, failed exit, different tag, repeated scans, stale response, timeout, rollover, recovery gate, existing UART tests.
- tests/session_journal_test.cpp (new): interrupted recovery and stable identity across repeated reboots.

### Gas project: C:/Users/Admin/Documents/Arduino/gas_sensor - platform
- src/main.cpp: clarify the confirmation serial trace for both pairs. Existing two-fresh-readings logic was reused without changing pins, thresholds, sampling, uploads, or Wi-Fi.
- tests/presence_test.cpp: presence without a request cannot authorize a visit; existing fresh-request/noise/timeout coverage retained.

### App project: C:/Users/Admin/LitterSense-CSP-WebApp
- lib/utils/sensorSync.ts: accept and persist SESSION_INTERRUPTED distinctly.
- lib/utils/catVisitRecovery.ts: retain interrupted history without incrementing measured visit summaries.
- lib/utils/sensorSms.ts: interrupted records cannot generate duration-based health SMS.
- lib/utils/deviceSensorSnapshot.ts: interrupted records do not increment completed-session totals.
- lib/hooks/useDeviceSensors.ts: interrupted status type support.
- lib/presentation/behaviorStates.ts: timeout/reboot records map to Incomplete; description covers unconfirmed exits.
- components/dashboard/SessionTimelineCard.tsx: show Not confirmed for uncertain exits and unknown timing after restart.
- lib/contexts/CatContext.tsx: keep interrupted history visible; exclude unknown duration from statistics/trends and summary reconciliation.
- lib/utils/dashboardBehaviorMetrics.ts, lib/utils/predictiveOverview.ts, lib/utils/predictiveHealth.ts: exclude interrupted/unfinished visits from measured completion evidence.
- Matching sensorSync, sensorSms, catVisitRecovery, behaviorStates, predictiveOverview and SessionTimelineCard tests extended.
- lib/contexts/CatContext.interrupted.test.mjs (new): interrupted history remains visible without distorting summary-backed visits.

## Verification
- Observed the original exit test fail because RFID alone immediately ended the visit; new implementation passes it.
- Observed interrupted ingestion/presentation tests fail before backend support; final checks pass.
- 296 app tests and 4 camera relay tests passed, zero failures.
- Lint, TypeScript, production build, and diff whitespace checks passed.
- Actual RFID, journal, enrollment-hold, upload-scheduling, and ultrasonic host tests passed.
- ESP32-CAM RFID and ESP32 gas firmware builds passed.
- Existing Windows long-path/codepage notices remain; no new compiler warnings found.

## Limits to check
- Restart timing cannot be reconstructed exactly. The internal event uses a deterministic minimum-duration placeholder solely for compatibility with existing storage validation; the timeline explicitly labels timing unknown, and measured statistics/AI evidence/SMS exclude it.
- The pre-existing 32-event completed-visit queue is still RAM-only. Completed visits waiting for upload can be lost on a later power failure; this task protects the active visit at reboot, not the entire offline backlog.
- An interrupted record needs a registered tag, valid owner mapping and reachable cloud storage to be acknowledged. New visits remain blocked if that recovery cannot be accepted; check serial output if this occurs.
- Physical uploads must follow the app deployment so the receiver recognizes SESSION_INTERRUPTED.

## Physical tests after deployment and RFID upload
1. Use a registered tag; allow 3 seconds with no tag after boot.
2. Scan once and put an object in the 2-30 cm detection zone within 5 seconds. Confirm one entry.
3. Keep scanning without removing the tag: confirm no exit.
4. Remove the tag for at least 3 seconds, then scan the same tag and trigger fresh ultrasonic readings. Confirm one exit and final duration.
5. Repeat with no ultrasonic confirmation: no entry, or an existing visit remains open after a failed exit pair.
6. Try another tag while inside: it cannot replace the active cat.
7. Leave a confirmed session open for 15 minutes: incomplete timeout, no confirmed exit.
8. Reboot during a confirmed session: incomplete interrupted history, no resumed visit or false exit; verify recovery acknowledgement and subsequent new entry.
9. Recheck the five-second Add Cat registration separately.
