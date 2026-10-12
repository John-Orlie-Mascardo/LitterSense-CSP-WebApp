# LitterSense offline sensor sync

## Status

Implemented and tested locally on `orlie-branch`. This change has **not** been pushed, deployed to Vercel, applied to a production database, or flashed onto a board. Existing hardware continues running its previously installed firmware.

## Simple explanation

When internet is unavailable, the RFID and gas boards save a limited number of events in their own flash memory. When internet returns, they retry uploading. An event is deleted from the board only after the website acknowledges its exact ID and the board successfully saves that deletion.

Old gas readings are saved as history. They do not replace current readings, make a disconnected board look online, or generate new gas alerts. Current sensing and live uploads continue separately.

## Files and behavior

Firmware projects used:

- `C:\Users\Admin\Downloads\Platform IO\pl\littersense_rfid_test - platform`
- `C:\Users\Admin\Downloads\Platform IO\pl\gas_sensor - platform`

RFID stores completed visits before clearing the existing active-session journal. Startup reconciles both stores, preventing a completed visit from also being recorded as interrupted after a restart. Dated visits use the existing `/api/sensors` ingestion and exact acknowledgment contract with their original IDs, durations and timestamps. The request contains separately captured current RFID state.

If a visit had no trustworthy clock before a restart, its date remains unknown. A separate worker uploads it to history with `capturedAt: null` and `timingKnown: false`. An interrupted session also has an unknown duration. These undated records do not count toward today's visits or dated charts. They remain available for authorized database inspection; this task adds no new history screen.

Gas history records changes in gas/presence and one unchanged-state sample per minute. Changes within two seconds are coalesced to limit flash writes. Local doorway detection and the existing live snapshot queue still use the original sensing logic. Full history storage preserves older unacknowledged records and explicitly logs that additional history is omitted until space returns. Failed writes retry with a five-second minimum interval.

History upload workers are independent of live HTTP workers. They begin only after a recently accepted live request. Failed history attempts have a five-second minimum retry interval. This prevents a slow history HTTP request from directly holding the live worker; shared Wi-Fi, flash and available memory still require testing on real boards.

## Capacity and timing limits

| Board | Pending capacity | Queue blob | NVS partition |
|---|---:|---:|---:|
| RFID | 8 completed/undated records | 2,448 bytes | 20,480 bytes, shared |
| Gas/ultrasonic | 16 samples/events | 2,448 bytes | 20,480 bytes, shared |

Sizes were measured from the compiled ESP32 binaries and partition tables. Replacement blobs use heap memory instead of placing a multi-kilobyte copy on the task stack. Allocations and persistent writes must succeed before changing the in-memory queue.

Capacity is a record count, not a guaranteed outage duration. Frequent transitions fill gas storage faster than unchanged samples. RFID blocks new attributed visits when full or when its session storage cannot be safely updated. The boards cannot guarantee unlimited retention. Actual NVS fragmentation, power-loss behavior, runtime TLS memory and flash endurance require physical verification. Never erase NVS as an ordinary recovery step: it contains pending events and existing configuration.

Times can be resolved from NTP and uptime only in the same boot. Records from an earlier boot without an original clock remain undated. Normal heartbeat intervals and existing notification logic are unchanged.

## Historical API

`POST /api/sensors/history` requires the existing `x-device-config-token` header, operational primary mode and an active credential linked to its owner.

- Maximum body: 8 KiB; maximum batch: 8 events. Firmware currently sends one at a time.
- `source`: `gas-ultrasonic` (default) or `rfid`; `deviceId`: board MAC.
- Gas event: `eventId`, `capturedAt` (ISO or null), `mq135Raw`, `mq136Raw`, `distanceCm`, `entranceOccupied`.
- Undated RFID event: `eventId`, `capturedAt: null`, `rfidHex`, `status`, `durationMs` (zero only for interrupted sessions).
- Server derives `timingKnown`; rejects invalid values, future timestamps, mismatched paired devices, revoked credentials and conflicting reuse of an event ID.
- Storage: `users/{verifiedOwner}/sensorHistory/{SHA256(source:deviceId:eventId)}` in existing operational records.
- Identical retries are acknowledged without another row. A conflicting retry returns 409 and is retained on the board.
- Response: `acknowledged` IDs and `x-litersense-ack` for a single event.

The receiver never writes live snapshots or queues notifications/SMS. Client-controlled owner fields are ignored. General browser record mutations cannot write this collection. Existing SQL supports the collection and atomic create/retry; no new migration is needed.

## Verification completed locally

- 12 firmware host simulation programs: queues, exact/wrong/lost acknowledgment, failed persistence, full/corrupt storage, restart reconciliation, undated recovery, capture scheduling, timers, enrollment hold and doorway behavior.
- Both PlatformIO firmware builds.
- App lint, 525 app tests, four camera relay tests and Next.js production build.
- Database regression using the existing schema: owner isolation, revoked credential, idempotency, conflicts, malformed and oversized bodies, undated history, unchanged live state and no queued alerts.

Compilation and simulations do not prove actual board operation. No board upload, serial boot check, physical outage test, deployed receiver check or phone delivery check was performed for this change.

## Later activation — requires separate authorization

1. Review and commit the app and firmware sources in their respective repositories; exclude build output and local credentials.
2. Deploy the historical receiver first. Verify it with the correct device credential and owner; inspect history and confirm live state is unchanged. No new SQL migration is required.
3. Open each downloaded project folder in VS Code with PlatformIO. Select the correct board and USB port. Upload one board at a time. Do not upload these builds to the camera.
4. Collect fresh serial boot logs and run the physical checklist below. Keep the old firmware available for rollback; do not erase NVS without first safeguarding pending records.

## Physical checklist

- Establish live uploads first; note board MAC, free memory and successful heartbeat.
- Disconnect internet while leaving boards powered. Complete several RFID visits and gas/presence changes; restore internet. Verify original times, one copy per event and accurate current readings.
- Reboot with pending events. Verify persistence and that a completed visit is not also interrupted.
- Start without internet/time, record an event, restart, then reconnect. Verify null time and exclusion from today's dated statistics.
- Simulate a rejected or missing history acknowledgment: the pending event must remain and retry unchanged.
- Fill queues: confirm explicit serial warnings, no overwriting, preserved live sensing and the RFID attribution guard.
- Make the history receiver slow/unavailable while live ingestion works; observe live cadence, local doorway responsiveness and runtime memory.
- Test repeated NVS replacement and controlled power cuts. Check for corruption/storage faults rather than assuming a successful compile proves flash behavior.
