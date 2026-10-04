# Sensor Display Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Keep live RFID, gas, and ultrasonic display available during a Firestore quota/service outage without falsely acknowledging visit history.

**Architecture:** Extend the existing sensor upload/read endpoint with an owner-scoped Supabase mirror. Preserve independent source timestamps and choose the freshest authorized readings. Reuse the existing verified hashed device mapping and native REST helper.

**Tech Stack:** Next.js, TypeScript, native fetch, Supabase PostgreSQL, existing Node test runner.

**Spec:** ../specs/2026-10-04-sensor-display-fallback-design.md

## Global Constraints

- Freshness window: 180 seconds, based on server receipt times.
- No new dependencies or firmware/camera/history/enrollment migration.
- No raw tokens or Wi-Fi secrets in fallback storage or logs.
- Browser roles cannot access mirror tables/functions; authenticated server reads are owner-scoped.
- Unknown/revoked devices fail closed; fallback is limited to quota/service failures.
- Preserve existing visit/enrollment acknowledgements; a mirrored snapshot never acknowledges history.
- Synthetic tests must not reach the live SMS queue or send messages.
- User reviews each completed implementation task before the next task starts, following the existing phased-work preference.

## Review Focus

1. A fresh gas heartbeat must not revive stale RFID: independent receipt times (Tasks 1, 3).
2. A mirror failure after primary success must not reject that saved sensor upload (Task 2).
3. A rotated token must lose access even if its snapshot still existed (Tasks 1, 2).
4. A delayed concurrent write must not replace a newer reading (Task 1).
5. A stale Firebase read immediately after recovery must not hide a fresher mirror (Task 3).

## File Map

- Create `docs/sensor-snapshot.sql`: table, atomic ownership/mirror functions, grants.
- Create `docs/sensor-snapshot-check.sql`: rolled-back database assertions.
- Create `lib/utils/sensorSnapshotStore.ts`: trusted mapping, mirror write/read, freshness selection.
- Create `lib/utils/sensorSnapshotStore.test.mjs`: helper checks using existing test conventions.
- Modify `app/api/sensors/route.ts`: integrate live mirroring and fallback.
- Modify `app/api/sensors/rfid.integration.test.mjs`: route regression cases.
- Modify `lib/hooks/useDeviceSensors.ts`: optional source/receipt metadata only.
- Modify `lib/utils/liveSensorStatus.ts` and its existing tests: distinguish stale/unavailable status.
- Modify `app/dashboard/page.tsx` only if last-update presentation needs metadata.
- Modify `docs/SMS-SETUP.md`: document sensor mirror and boundaries.
- Existing `app/api/sms/sync/route.ts`, account/device deletion paths, and `sync_sms_account` migration are touched only where mapping bootstrap/revocation requires it.

### Task 1: Secure snapshot storage and ownership

**Interfaces:** Define `SensorSource = 'rfid' | 'gas-ultrasonic'` and `StoredSensorSnapshot = { source: SensorSource; data: Record<string, unknown>; receivedAt: string }`. Export `rememberSensorDevice(ownerId: string, configToken: string): Promise<void>`, `saveSensorMirror(configToken: string, source: SensorSource, data: Record<string, unknown>, receivedAt: string): Promise<boolean>`, and `readSensorMirrors(ownerId: string): Promise<StoredSensorSnapshot[]>`. Boolean false means no authorized mapping. Errors indicate storage failure. Use `smsStoreRequest` internally.

- [ ] Write failing helper tests that unknown tokens cannot write, owner A cannot read owner B, and partial RFID updates preserve previous values.
- [ ] Run `node --test lib/utils/sensorSnapshotStore.test.mjs`; confirm the intended missing-helper failure.
- [ ] Implement the helper and migration: snapshot key `(token_hash, source)`, FK to `sms_devices` with cascade; atomically merge same-source JSON only when incoming receipt time is newer. Strip raw config tokens before storage. Receipt time comes from the server, not the request.
- [ ] Add trusted mapping maintenance that creates the minimum account/device association without modifying saved SMS consent/phone/preferences. Reuse authenticated sync to reconcile rotations; do not remap an existing token to a different owner silently. Clean mappings on existing app account/device removal paths.
- [ ] Write rolled-back SQL assertions for source isolation, concurrent receipt ordering, unknown tokens, owner isolation, rotation/deletion cascade, and browser-role denials. Verify constraints/grants using Supabase tools.
- [ ] Run helper checks and rolled-back SQL checks; confirm no simulation rows remain. Commit only this task's files.

### Task 2: Mirror validated live uploads without changing acknowledgements

**Interfaces:** Consume Task 1 helpers. Existing `POST /api/sensors` input and acknowledgement fields stay unchanged. Capture a server receipt time for each request; use existing `normalizeGasUltrasonic`, `normalizeSensorSyncRequest`, and `buildDeviceSensorSnapshot`.

- [ ] Add failing route assertions: healthy live upload mirrors; quota/service failure mirrors via verified mapping; invalid gas payload never mirrors; missing/revoked readable Firestore config is rejected; unknown outage token never writes; successful primary save retains its response if mirror fails.
- [ ] Run `node --test app/api/sensors/rfid.integration.test.mjs`; confirm the added assertions fail before implementation.
- [ ] Integrate ownership refresh and snapshot mirroring. During failures classify only Firestore quota/service errors as fallback eligible. Do not fall back on malformed inputs, authentication failures, permissions errors, or known revoked configs.
- [ ] Build fallback RFID live state from validated current fields and previous mirror; never invent a persisted visit/enrollment result. A gas upload updates only the gas source. Preserve the original failure response and omit visit acknowledgements when history is unsaved.
- [ ] Add regression assertions that SMS queue errors cannot erase successful mirror data and that mirror storage alone cannot produce a history acknowledgement. Avoid calling the real sender in tests.
- [ ] Run sensor/RFID/SMS targeted tests; commit only this task's files.

### Task 3: Read fresh authorized snapshots and show accurate status

**Interfaces:** Add optional metadata `rfidUpdatedAt?: string`, `gasUltrasonicUpdatedAt?: string`, `rfidDataSource?: 'firebase' | 'supabase'`, `gasUltrasonicDataSource?: 'firebase' | 'supabase'`, `rfidState?: 'online' | 'stale' | 'unknown'`, `gasUltrasonicState?: 'online' | 'stale' | 'unknown'`. Existing readings/booleans remain compatible. Export `selectSensorSnapshot(source: SensorSource, firebase: StoredSensorSnapshot | null, mirrors: StoredSensorSnapshot[], now: number): StoredSensorSnapshot | null`; choose the greatest valid receipt time for that source, preferring Firebase on equal timestamps.

- [ ] Write failing route/helper/status tests for quota GET with fresh mirror, stale Firebase/fresh mirror after recovery, independent source age, future/invalid timestamps, both stores unavailable, no snapshots, and unauthorized owner access.
- [ ] Run targeted checks; confirm the new assertions fail before implementation.
- [ ] Implement per-source selection and owner-scoped fallback GET. Read failure yields HTTP 503/status unavailable if no authorized store result exists; an empty successful store read is unknown/no data. Never convert authentication failure into a fallback read.
- [ ] Preserve the original timestamps and derive online only from valid age <=180000 ms. Show expired snapshots as Stale / No recent heartbeat with last-update time; unknown data is Unavailable / No data. Keep existing Cloud error presentation for unreadable storage. Reuse shared status helpers for dashboard consumers.
- [ ] Update hook types and only necessary dashboard last-update presentation. Keep polling cadence and camera/session-history logic unchanged.
- [ ] Run helper, route, status, and existing dashboard tests; commit only this task's files.

### Task 4: Release and verify real heartbeats

**Interfaces:** Consume Tasks 1–3 changes. Deploy through the existing Vercel project with its existing server-only Supabase credentials.

- [ ] Run `npm run check` and `git diff --check`; require lint, existing/new tests, camera relay regression tests, and production build success.
- [ ] Record previous deployment, create a source-only recovery snapshot, and document migration rollback. Disable only the new mirror/read path for rollback; preserve existing SMS data/schema.
- [ ] Apply the reviewed migration and seed verified ownership while Firestore is healthy; check signed-in owner and device token associations without printing secrets.
- [ ] Deploy a clean source tree, verify authentication boundaries, then verify a real RFID and gas heartbeat in both stores with independent timestamps.
- [ ] Re-run simulated quota GET/POST tests and recovery tests. Do not consume the real Firebase quota or send synthetic SMS. Request physical verification only for real board freshness/display.
- [ ] Report source/test/deployment/hardware evidence separately. Mark completion only after real mirror heartbeats and simulated-outage display verification; report any external blockers plainly.

## Execution Handoff

Recommended: native execution in this session, one task at a time, with a final independent review. These tasks share the same ownership and timestamp contract; keeping one implementer reduces interface drift. The user reviews this plan and selects the execution approach before implementation.
