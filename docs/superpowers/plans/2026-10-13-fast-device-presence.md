# Fast Device Presence Implementation Plan

> **For agentic workers:** This plan is being executed in the current task under the user's direct authorization. Do not flash firmware or deploy the website or relay.

**Goal:** Show RFID and gas-board disconnection in about 3–5 seconds without writing heartbeat rows to Supabase.

**Architecture:** Both boards hold authenticated WebSocket publisher connections to the existing Render relay. The relay tracks connection state in memory and streams it to authenticated dashboard viewers; it does not persist heartbeat messages. The dashboard retains the existing sensor-data path as a fallback if the relay stream is unavailable.

**Tech Stack:** Next.js route handlers, Node WebSocket relay, React sensor provider, PlatformIO/ESP32 Arduino.

**Spec:** User request in the active Codex conversation.

## Global Constraints

- Do not add database writes for heartbeats.
- Do not change sensor values, RFID visit recording, offline queues, or notification behavior.
- Keep existing camera relay behavior unchanged.
- Do not flash hardware or deploy any service.
- Keep the exact baseline and rollback instructions in `C:/Users/Admin/Downloads/Platform IO/pl/OFFLINE-PRESENCE-ROLLBACK.md`.

## Review Focus

- Invalid, expired, wrong-role and revoked device credentials must not open relay presence streams.
- Camera tickets and camera streaming behavior must remain unchanged.
- A relay disconnect or reconnect must not leave the dashboard stuck online/offline.
- A missing relay session must fall back to the current database-derived sensor presence.
- Both firmware projects must build with the new presence connection enabled.

---

### Task 1: Create reproducible pre-change backup and rollback instructions

**Files:**
- Create baseline source copies and SHA-256 manifest under `C:/Users/Admin/Downloads/Platform IO/pl/_offline-presence-recovery/baseline-20261013/`.
- Create `C:/Users/Admin/Downloads/Platform IO/pl/OFFLINE-PRESENCE-ROLLBACK.md`.

- [x] Record website baseline commit and branch.
- [x] Copy the two non-Git firmware projects, excluding only generated `.pio` build/dependency caches.
- [x] Record checksums for copied files.
- [x] List modified and new files and record safe, path-specific restore steps in the rollback guide.

### Task 2: Add an authenticated, in-memory relay presence channel

**Files:**
- Modify `services/camera-relay/server.mjs` and `services/camera-relay/server.test.mjs`.
- Add a server-side presence-ticket helper and focused tests.
- Add authenticated API routes for device publisher and owner dashboard viewer sessions.

- [x] Write tests for ticket role/expiry/identity validation and relay presence connect/disconnect broadcasts; tests were run red before implementation.
- [x] Implement separate presence paths and memory-only state. Camera routes and the camera heartbeat loop remain unchanged.
- [x] Run relay and focused ticket/hook tests.

### Task 3: Connect both boards without per-heartbeat database writes

**Files:**
- Add a shared PlatformIO sensor-presence library under `C:/Users/Admin/Downloads/Platform IO/pl/shared/`.
- Modify the gas and RFID PlatformIO configuration and start the presence worker from each firmware project.

- [x] Keep a persistent TLS WebSocket to the relay, renew one-hour signed tickets, and reconnect after Wi-Fi loss.
- [x] Send one small application heartbeat per second over the existing presence socket; presence creates no sensor payloads or database writes.
- [x] Build both firmware environments; run existing host-side firmware tests.

### Task 4: Consume relay status in the website with safe fallback

**Files:**
- Modify `lib/hooks/useDeviceSensors.ts` and focused tests.
- Add a browser presence-stream helper and tests.

- [x] Overlay per-board live connection status while the relay stream is healthy.
- [x] Fall back to existing stored-heartbeat state on stream failure; reconnect without changing visit or sensor data behavior.
- [x] Keep the present sensor-data polling cadence unchanged in this task.
- [x] Run lint, focused tests, full app tests, and build.

### Task 5: Finalize recovery notes

- [x] Record changed files, test results, and the fact that flashing/deployment are still required for live verification.
- [x] Verify all baseline hashes still match the recovery snapshot.

## Acceptance boundary

The relay reports a board offline after four seconds without its application heartbeat, plus at most one 250 ms sweep interval and network delivery time. This bound is from source configuration, not a physical outage test. Live verification still requires relay deployment and uploading the matching firmware to both boards.
