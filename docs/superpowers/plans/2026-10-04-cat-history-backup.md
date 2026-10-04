# Cat Profile and Visit History Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve cat profiles and visit history during Firestore outages and recover pending visits without duplicate history or counter effects.

**Architecture:** Firebase remains primary. The existing Supabase project holds versioned profile catalogs, original-ID history and a leased pending-visit queue. Authenticated server reads provide fallback; a separate protected worker repairs backups and replays authorized visits through one atomic persistence helper.

**Tech Stack:** Next.js, TypeScript, existing Firebase Admin SDK, native fetch/crypto, Supabase PostgreSQL, existing Node tests. No new product dependencies.

**Spec:** ../specs/2026-10-04-cat-history-backup-design.md

## Global Constraints

- User approval before each implementation task. Do not deploy until Task 6 is approved.
- Same Supabase project; server-only tables/RPCs, RLS enabled, public/anon/authenticated roles denied.
- Identity and device ownership verified server-side; no client-provided owner authority or raw token/credential backup.
- Preserve existing Firebase session IDs, original event times, stored activity-day keys and device/enrollment acknowledgements.
- Unique history identity is `(owner_id, firebase_session_id)`; identical retries are no-ops, conflicting content cannot overwrite.
- Mirror failures cannot undo a confirmed primary save; queue storage alone cannot acknowledge Firestore history success.
- Profile edits require primary access; no offline profile editing or automatic restoration of deleted profiles.
- No firmware/camera/photo-byte/health-log/report-document/notification migration or new SMS dispatch behavior.
- Initial copying never creates Firestore visits or increments. No fabricated visits from aggregate-only data.
- Repair uses bounded resumable pages; recovery uses bounded leased claims and retry backoff.
- Every simulation stubs SMS/notification sending; database assertions run in rolled-back transactions.
- Preserve current source recovery commits/archive and the working sensor fallback.

## Review Focus

1. A backup page limit is not completion: import more than 1,000 rows, resume after interruption, preserve every ID (Task 2).
2. A Firestore commit whose response is lost must not cause another count on worker or board retry (Task 4).
3. Deleting a cat or rotating a device while visits are pending cannot resurrect profiles or authorize replay (Tasks 1, 4).
4. Primary and backup cursors cannot mix during a history source transition or expose a previous owner's rows (Task 5).
5. Older replay and differing worker timezones cannot move a visit to another day or move `lastVisit` backwards (Tasks 3, 4).

---

## Shared Contract and File Map

Create `lib/interfaces/CatHistoryBackup.ts` for these shared types:

```ts
type BackupVisitState = 'primary_saved' | 'pending' | 'claimed' | 'conflict' | 'cancelled';
type ProfileBackup = { catId: string; cat: Record<string, unknown>; details: Record<string, unknown> };
type CatalogBackup = { revision: number; profiles: ProfileBackup[]; sourceReadAt: string; complete: boolean };
type VisitBackup = { sessionId: string; catId: string; data: Record<string, unknown>; digest: string; tokenHash: string | null; state: BackupVisitState };
type BackupProgress = { cursor: string | null; scanned: number; complete: boolean; checkedAt: string; lastError: string | null };
type BackupPage<T> = { rows: T[]; nextCursor: string | null; source: 'firebase' | 'supabase' | 'mixed'; complete: boolean; backedUpAt: string | null; pendingCount: number };
type ClaimedVisit = VisitBackup & { ownerId: string; claimId: string; leaseUntil: string };
type HistoryQuery = { startDate: string; endDate: string; sort: 'asc' | 'desc'; catId?: string; states?: BehaviorStateId[]; cursor?: string; limit: number };
```

Import `BehaviorStateId` from the existing behavior-state presentation module. All owner IDs below come from verified identity or device mapping. Types are internal, not permission to accept their fields from an untrusted body. JSON serializers retain existing profile fields and recognized legacy fields within bounded document sizes, exclude credentials, and report unsupported/invalid records as incomplete rather than silently dropping data. Use the existing transpiled-module/VM test harness and mocked source/store clients for unit fixtures; these tests never touch live owners.

- `catHistoryNormalization.ts`: allowlisted serialization, deterministic semantic digest, history merge by ID, date preservation.
- `catHistoryStore.ts`: native server REST/RPC adapter; versioned catalog/history storage, progress, claims and finalization.
- `catCatalogSync.ts`: authoritative catalog transaction/revision and confirmed profile mutations.
- `catHistoryBackfill.ts`: bounded primary collection pages and resumable copy/repair.
- `catVisitRecovery.ts`: atomic primary visit persistence, leased replay and retry handling.
- `catHistoryReads.ts`: owner-scoped catalog/history selection and source-aware pagination.
- New authenticated routes: `app/api/cats/route.ts`, `app/api/cat-history/route.ts`, `app/api/cat-backup/sync/route.ts`.
- Protected worker route: `app/api/cat-backup/process/route.ts`.
- Modify only needed integration in `app/api/sensors/route.ts`, `CatContext.tsx`, `useSessionHistory.ts`, affected backup banners and existing deletion/provisioning paths.
- Database files: `docs/cat-history-backup.sql`, `docs/cat-history-backup-check.sql`, `docs/cat-history-backup-rollback.sql`; release/setup instructions in `docs/CAT-HISTORY-BACKUP.md`.

### Task 1: Secure catalog/history storage and duplicate rules

**Files:** Create the shared type, normalization/store modules, their `.test.mjs` files, and the three database SQL files.

**Interfaces produced:**

- `buildVisitBackup(sessionId: string, data: Record<string, unknown>, tokenHash: string | null, state: BackupVisitState): VisitBackup`.
- `mergeHistoryById(primary: VisitBackup[], backup: VisitBackup[]): VisitBackup[]`; primary wins matching IDs; conflicts are reported by storage rather than combined.
- `saveCatalogBackup(ownerId: string, catalog: CatalogBackup): Promise<{ applied: boolean }>`; only complete authoritative catalogs can update/delete catalog rows.
- `readCatalogBackup(ownerId: string): Promise<CatalogBackup | null>`.
- `saveVisitBackups(ownerId: string, visits: VisitBackup[]): Promise<{ inserted: number; duplicates: number; conflicts: number }>`.
- `readVisitBackups(ownerId: string, query: HistoryQuery): Promise<BackupPage<VisitBackup>>`.
- `readBackupProgress(ownerId: string): Promise<BackupProgress | null>` and `saveBackupProgress(ownerId: string, progress: BackupProgress): Promise<void>`.
- `resolveCatBackupDevice(configToken: string): Promise<{ ownerId: string; tokenHash: string; catalog: CatalogBackup } | null>`; hashes the token, verifies the mapping and returns only a complete catalog.
- `claimPendingVisits(limit: number): Promise<ClaimedVisit[]>` and `finishClaim(claimId: string, outcome: 'primary_saved' | 'conflict' | 'cancelled' | 'retry', reason?: string): Promise<void>`.
- `claimRepairOwner(): Promise<{ ownerId: string; claimId: string } | null>` and `finishRepairOwner(claimId: string, outcome: 'success' | 'retry'): Promise<void>`; atomic oldest-due owner selection uses independent progress-row leases, not SMS scheduling state.

- [ ] Write helper tests named `sameVisitTwiceIsOneRow`, `differentPayloadWithSameIdIsConflict`, `receiptDoesNotChangeDigest`, `oldCatalogCannotUndoDeletion`, `ownerCannotReadOtherOwner`, `voidRpcHasNoJsonBody`, and `deviceRotationPreservesSavedHistory`. Assert identical IDs/content keep one record; changed cat/duration/times/day changes the digest; raw config tokens are absent; original missing/valid dates are preserved.

  Representative normalization assertion:
  ```ts
  const data = { catId: 'cat-a', date: '2026-10-04', durationSecs: 32, startedAt: '2026-10-04T08:00:00Z', endedAt: '2026-10-04T08:00:32Z', sessionStatus: 'NORMAL' };
  const first = buildVisitBackup('sync_event_1', data, null, 'pending');
  const retry = buildVisitBackup('sync_event_1', { ...data, receivedAt: '2026-10-05T00:00:00Z' }, null, 'pending');
  assert.equal(first.digest, retry.digest);
  assert.notEqual(first.digest, buildVisitBackup('sync_event_1', { ...data, durationSecs: 33 }, null, 'pending').digest);
  ```
- [ ] Run `node --test lib/utils/catHistoryNormalization.test.mjs lib/utils/catHistoryStore.test.mjs`. Expected RED: missing new helper/store behavior.
- [ ] Implement the shared interfaces and native helpers. Canonical digests include normalized cat ID, duration, event start/end, activity-day key, status and gas deltas; exclude receipt/storage time, display formatting, recovery state and raw token. Validate finite numbers and document/path IDs. Keep source profile fields supported by the current schemas, including legacy weight if present; unsupported fields cannot be silently declared fully backed up.
- [ ] Implement separate owner-linked catalog/profile, visit and progress tables. Catalog replacement/tombstones and revision checks are atomic. Matching pending rows may become primary-saved; primary-saved rows never downgrade. Visits retain optional device hashes without a device-deletion cascade. Account deletion cascades all new data. Claim at most **5** visits with **120-second** leases; repair-owner claims also use independent **120-second** leases. Finalization requires the current claim ID. Definitive conflicts/cancellations are never automatically retried. Retry delay starts at **30 seconds** and doubles to a **900-second** cap.
- [ ] Add rolled-back SQL assertions covering unique rows/digests, concurrent claims, stale claim IDs, expired leases, tombstones, empty complete catalog, partial catalog rejection, unknown/revoked mappings, state transitions, browser denials and account cascade. Apply reviewed migration and run the assertions using Supabase tools; verify no simulation rows remain.
- [ ] Run helper tests, targeted lint/TypeScript and `git diff --check`; expect GREEN. Commit only this task's files.

### Task 2: Confirmed profile operations and complete initial copying

**Files:** Create `catCatalogSync.ts`, `catHistoryBackfill.ts` and their tests; create cats/sync routes and route tests. Modify profile mutation methods in `lib/contexts/CatContext.tsx`; extend the primary collection reader only as needed for bounded explicit pages.

**Consumes:** Task 1 catalog/visit/progress functions. Existing `getAdminAuth`, Firebase Admin SDK, profile interfaces and photo helpers.

**Interfaces produced:**

- `captureCatalog(ownerId: string): Promise<CatalogBackup>`; transaction captures cats/details and advances `users/{owner}/backupState/catalog` revision.
- `mutateCatProfile(ownerId: string, mutation: { action: 'create' | 'update' | 'delete'; catId: string; cat?: Record<string, unknown>; details?: Record<string, unknown> }): Promise<{ revision: number; backupPending: boolean }>`.
- `copyHistoryPage(ownerId: string): Promise<BackupProgress>`; imports at most **100** primary sessions from the saved cursor, stores the page, then advances progress. Completion only after the explicit last page.
- `POST /api/cats` applies validated profile mutations; `GET /api/cats` initially returns primary catalog, extended with fallback in Task 5. `POST /api/cat-backup/sync` advances only the verified caller's backup by one page and reports progress.

- [ ] Write tests `backfill1201SessionsWithoutTruncation`, `restartDoesNotSkipUnstoredPage`, `importDoesNotIncrementPrimaryCounters`, `completeEmptyCatalogDiffersFromUnavailable`, `olderProfileCopyCannotResurrectCat`, `primaryUnavailableDoesNotReportProfileSaved`, `callerCannotChooseOwner`, and `mirrorFailureKeepsConfirmedPrimaryMutation`. The 1,201-row fixture must retain 1,201 exact IDs after retries.

  In the 1,201-row mocked primary fixture, assert after repeated `copyHistoryPage('owner-a')` calls:
  ```ts
  assert.equal(progress.complete, true);
  assert.equal(progress.scanned, 1201);
  assert.equal(new Set(storedRows.map(row => row.sessionId)).size, 1201);
  assert.equal(primaryCounterWrites, 0);
  ```
- [ ] Run `node --test lib/utils/catCatalogSync.test.mjs lib/utils/catHistoryBackfill.test.mjs app/api/cats/route.test.mjs app/api/cat-backup/sync/route.test.mjs`; expect RED.
- [ ] Implement catalog capture and profile mutations with primary transactions/revisions. Match existing create/update/detail-merge/delete behavior and validation. Preserve existing unrelated fields, enrollment semantics, photo cleanup and summary deletion; route requests never accept owner IDs as authority. Confirm Firestore mutation before success; distinguish a saved mutation whose backup is pending.
- [ ] Change only `addCat`, `updateCat`, `updateDetails`, `removeCat` client mutation calls to authenticated server requests; preserve their public context signatures and existing UI behavior. An outage rejects edits clearly, without queuing client-side primary writes.
- [ ] Implement name-ordered explicit primary pages and progress. Persist progress only after successful page storage; on completed rolling repair restart at the first range on the next cycle so late inserts before a cursor are eventually copied. Preserve original session fields/IDs, incomplete historical records and undated classification. No synthetic dates or visits; record unsupported rows as incomplete/error.
- [ ] Run new tests and existing RFID enrollment, cat/date/normalization and photo tests; lint/TypeScript and whitespace checks must pass. Commit the tested task.

### Task 3: Mirror healthy visits and retain authorized outage visits

**Files:** Modify `app/api/sensors/route.ts` and its RFID integration tests; create `lib/utils/catVisitIngestion.ts` and `.test.mjs`. Modify `sensorSync.ts` only for exposing the original activity-day/write-plan fields needed by recovery; retain existing IDs and acknowledgement spelling.

**Consumes:** Task 1 visit serialization/storage and complete device catalog resolution; existing normalization and visit write plans.

**Interface produced:** `backupSensorVisits(configToken: string, normalized: SensorSyncRequest, primary: { ownerId?: string; saved: VisitBackup[]; fallbackAllowed: boolean }, receivedAt: Date): Promise<{ inserted: number; duplicates: number; conflicts: number }>`.

- [ ] Add failing tests `healthySavedVisitMirrorsOnce`, `quotaRetryStoresOnePendingVisit`, `partialCatalogCannotAuthorizeVisit`, `ambiguousTagIsRejected`, `malformedAndRevokedTokensNeverQueue`, `queueDoesNotAckHistory`, and `delayedReceiptKeepsOriginalDay`. Assert no enrollment ack is invented and existing sensor mirroring still runs.

  After posting the same valid completed-event fixture twice with primary 429, assert:
  ```ts
  assert.equal(pendingRows.length, 1);
  assert.equal(response.headers.get('x-litersense-ack') ?? '', '');
  assert.equal(pendingRows[0].data.date, originalActivityDay);
  assert.equal(syntheticSmsCalls, 0);
  ```
- [ ] Run `node --test lib/utils/catVisitIngestion.test.mjs app/api/sensors/rfid.integration.test.mjs lib/utils/sensorSms.test.mjs`; expect RED for missing backup/queue behavior.
- [ ] Implement exact-one active tag matching and existing event validation/countability. Resolve healthy authority from Firestore and outage authority from verified mapping plus complete catalog only. Capture the canonical day and session fields at ingestion; do not change stable session IDs. Store batches of at most **100** records per storage call without discarding excess normalized events.
- [ ] Mirror actual primary-saved/verified duplicate records after the response using existing `after()`. On classified quota/service failure, await durable pending insertion before returning the original primary failure; do not manufacture an ack. A failed queue save retains the original retry/error path and records a sanitized repair diagnostic. Preserve current SMS behavior and live sensor mirroring.
- [ ] Run targeted tests plus full app tests; expect GREEN, zero synthetic sender calls and unchanged entry/exit/enrollment acknowledgements. Commit only this task's files.

### Task 4: Atomic recovery and bounded repair worker

**Files:** Create `catVisitRecovery.ts` and `.test.mjs`, the protected process route and `.test.mjs`, and `docs/CAT-HISTORY-BACKUP.md`. Integrate the shared primary visit writer in `app/api/sensors/route.ts`; extend its tests. Modify provisioning/account-removal paths only for new-data revocation/cascade integration if existing paths are insufficient.

**Consumes:** Task 1 claims/finalization/store, Task 2 copying/catalog capture, Task 3 original-ID queued records.

**Interfaces produced:**

- `persistVisitOnce(ownerId: string, visit: VisitBackup): Promise<'created' | 'duplicate' | 'conflict'>`; shared by device primary ingestion and recovery.
- `processCatHistoryRecovery(): Promise<{ restored: number; duplicates: number; conflicts: number; cancelled: number; retried: number; repairedRows: number }>`.
- `POST /api/cat-backup/process` verifies a separate `CAT_HISTORY_PROCESS_SECRET`; returns only aggregate progress. `CAT_HISTORY_RECOVERY_ENABLED=false` by default until Task 6 verification.

- [ ] Write tests `lostCommitResponseCountsOnce`, `boardAndWorkerRaceCountsOnce`, `crashBeforeFinalizeIsSafe`, `pastDayNeverIncrementsToday`, `olderReplayPreservesLastVisit`, `midnightReplayKeepsStoredDay`, `importedRowsNeverReplay`, `deletedCatOrRevokedDeviceCancels`, `authorityUnavailableRetries`, and `workerRejectsMissingOrWrongSecret`. Assert one session and one set of daily summary effects after repeated attempts; matching duplicates create no increments.

  For one 32-second visit in a transactional primary fixture after race/lost-response/retry runs:
  ```ts
  assert.equal(primarySessions.size, 1);
  assert.equal(originalDaySummary.visits, 1);
  assert.equal(originalDaySummary.totalDurationSecs, 32);
  assert.equal(backupRow.state, 'primary_saved');
  ```
- [ ] Run `node --test lib/utils/catVisitRecovery.test.mjs app/api/cat-backup/process/route.test.mjs app/api/sensors/rfid.integration.test.mjs`; expect RED.
- [ ] Implement shared primary persistence using the installed Admin SDK transaction: read session and affected summaries before writes; compare canonical digest for an existing session; create the session and all increments atomically. Preserve stored activity-day paths, greatest `lastVisit`, existing countability and current-day summary rules. Classify SDK quota/service errors consistently with existing fallback eligibility; permissions/auth errors remain closed.
- [ ] Implement leased replay with current account/device/cat rechecks; compare an existing matching primary record before incrementing; finish only the current claim. Use Task 1 backoff/lease limits. Account/device revocation cannot erase saved history or allow profile resurrection. Normal ingestion and replay use the same writer so concurrency has one atomic winner.
- [ ] Implement protected repair with a per-run budget of **one owner's 100-row history page**, plus that owner's catalog capture. Use `claimRepairOwner`/`finishRepairOwner` independently of visit claims; oldest-due owner ordering and persisted page cursors prevent large owners from starving others. When primary is unavailable, back off without repeated full scans. Document distinct secret, disabled gate, **one-minute** proposed Cron schedule and progress/rollback commands; do not enable Cron or replay yet.
- [ ] Run worker/route/storage tests, SQL lease/state assertions and full app/camera regressions; expect GREEN and no SMS sends. Commit tested recovery code and instructions.

### Task 5: Owner-scoped fallback views and duplicate-safe display

**Files:** Create `catHistoryReads.ts` and `.test.mjs`, `app/api/cat-history/route.ts` and `.test.mjs`, and `lib/hooks/useCatBackup.ts` and `.test.mjs`. Extend cats GET. Modify `CatContext.tsx`, `useSessionHistory.ts`, their tests and only needed backup banners in dashboard/history/cats.

**Consumes:** Task 1 history/catalog pages, Task 2 primary profile catalog, Task 4 saved/pending state semantics. Existing history filters, session presentation and count/trend helpers.

**Interfaces produced:**

- `readCatCatalog(ownerId: string): Promise<{ catalog: CatalogBackup; source: 'firebase' | 'supabase'; backupPending: boolean }>`.
- `readCatHistory(ownerId: string, query: HistoryQuery): Promise<BackupPage<VisitBackup>>`.
- `GET /api/cat-history` accepts existing date/filter/sort options and an opaque cursor; caller identity fixes the owner. Page size uses existing `HISTORY_BATCH_SIZE`.
- `useCatBackup()` returns owner-isolated catalog/session metadata plus source, completeness and pending-recovery state; no direct Supabase access or automatic replay.

- [ ] Write tests `sameSessionInBothStoresShowsAndCountsOnce`, `pendingRowsRemainVisibleAfterPrimaryRecovers`, `sourceChangeRestartsCursorSafely`, `accountSwitchCannotLeakRows`, `incompleteBackupIsNotEmptyHistory`, `historyFiltersAndCategoriesPreserved`, `bothStoresUnavailableIsCloudError`, and `healthySensorsUnaffectedByHistoryError`.

  For matching primary/backup rows in a read fixture and a subsequent owner switch:
  ```ts
  assert.equal(page.rows.filter(row => row.sessionId === 'sync_event_1').length, 1);
  assert.equal(derivedVisits, 1);
  assert.equal(nextOwnerVisibleRows.length, 0);
  ```
- [ ] Run read/route/hook tests and existing history UI tests; expect RED for missing fallback/merge behavior.
- [ ] Implement primary preference and fallback only for classified quota/service errors. Combine primary records and pending backups by exact session ID; matching primary records take precedence. Use separate underlying cursors encoded with owner/source/filter version; never reuse a primary-only cursor as a backup cursor. A changed source/filter version returns HTTP **409** with `{ error: 'History source changed', resetRequired: true }`; the hook clears its cursor and reloads without duplicate visible rows. A cursor belonging to another owner is rejected, never used to select that owner.
- [ ] Keep category filtering and pagination deterministic after the union. Deduplicate before deriving counts/trends. Retain existing primary aggregates during healthy operation; in backup mode derive only what the unique backed-up sessions support and mark incomplete/aggregate-only gaps. Block stale auxiliary primary summaries from overriding fallback session-derived values.
- [ ] Integrate owner-scoped fallback data only for affected profile/history/session state. Bootstrap the backup hook once per owner; preserve normal listeners when healthy. While in fallback or when pending recovery exists, check at **30 seconds** foreground / **60 seconds** hidden, with no overlapping requests; stop that loop when healthy with no pending data. Re-establish failed primary subscriptions on confirmed recovery. Load the context's required backup session range through bounded pages rather than silently retaining only the first page. Suppress primary-only derived summary writes while in backup mode, abort old requests and clear state on account changes. Keep health logs, photos, report documents, notifications, live sensors and their poll cadence on current paths. Banner states: backup mode, backup incomplete, saved/pending backup, pending recovery or cloud unavailable.
- [ ] Run all affected UI/hook/read tests and full app/camera regressions, lint, TypeScript and build; expect GREEN. Commit only required display integration.

### Task 6: Complete copying, release and prove recovery

**Files:** Update setup/recovery documentation and this plan's completion record. Keep source/release/verification artifacts in the existing thread workspace.

**Consumes:** Tasks 1–5 and their recorded tests. No further feature scope.

- [ ] Obtain a final independent review of all task commits against the spec, particularly unique IDs, primary counter effects, catalog deletion, leases and cursor transitions. Fix release blockers with failing regression tests before GREEN; record deferred minor findings.
- [ ] Run `npm run check` and `git diff --check`; require all app tests, camera relay tests, lint and production build to pass.

  Controlled release-verification assertions, with primary failure mocked and no real quota exhaustion:
  ```ts
  assert.equal(backupProgress.complete, true);
  assert.deepEqual(new Set(copiedSessionIds), new Set(primarySessionIds));
  assert.equal(recoveryFixture.sessionCount, 1);
  assert.equal(recoveryFixture.visitCounterDelta, 1);
  assert.equal(syntheticSmsCalls, 0);
  ```
- [ ] Verify current production baseline, preserve source archive and previous deployment, and review rollback. Keep existing sensor/SMS schema and functionality during app rollback; pause new history jobs before rollback. Database rollback removes only new objects after restoring a compatible app.
- [ ] Check/apply the reviewed storage migration, bootstrap verified catalogs and copy all actual owners' history using bounded pages. Verify exact copied IDs/counts, progress completion and no synthetic remnants. Preserve SMS opt-in/phone/preferences. No recovery enablement with an incomplete authoritative catalog/history bootstrap.
- [ ] Configure the distinct server secret and disabled recovery gate on the existing Vercel project; deploy a clean source tree. Verify authenticated ownership, denied browser roles, profile/history reads and unchanged real sensor heartbeats.
- [ ] Verify a real completed visit is present once in Firebase and Supabase. Repeat its event safely using mocks first; require deterministic counters in controlled integration/transaction tests. Use controlled primary-failure mocks with real backed-up reads to verify outage and recovery UI; do not consume the live quota or send synthetic alerts.
- [ ] Enable the reviewed one-minute recovery/repair job after the deployed secret/gate checks pass. Test job claims/finalization with rolled-back fixtures and mocked primary; use a real pending visit only if a naturally occurring outage supplies one. Do not rewrite existing real history merely to stage an outage.
- [ ] Collect final signed-in browser evidence for profiles/history and confirm sensor display. Report source, simulation, production and real-board evidence separately. Save all scoped commits, deployment IDs, copy progress and rollback instructions. Mark complete only when those release requirements pass; explicitly report any unverified live outage/replay scenario.

## Execution Handoff

### Task 6 release status (2026-10-04)

Independent review found and fixed a false backup-completeness claim after a
failed mirror and an avoidable Firebase write on each catalog read. Live copy
verification exposed a Supabase row-alias bug and a history page-boundary
duplicate; both were corrected before the final deployment. A legacy
`weightKg` profile field is mapped into the supported backup field. The
completed-copy repair interval is hourly to protect the Firebase read quota.

The reviewed migration and follow-up fixes are applied. One verified owner has
3 catalog profiles and 93 exact Firebase/Supabase visit IDs and digests;
rolled-back SQL checks left no synthetic rows. Local and Vercel `npm run check`
passed. Production deployment `dpl_DmA7FPfVUkCa67kaNjgNd49yn3VF` returned
3 profiles and 93 unique visits across five owner-scoped pages, and denied
unauthenticated/foreign-cursor reads. A controlled Firebase failure read all
93 backed-up visits with an incomplete marker. The protected manual worker
restored zero pending visits and repaired 93 rows. The separate one-minute
Vault-backed scheduler's first HTTP request succeeded.

At initial release, both physical boards were off, so fresh RFID/gas heartbeats
and signed-in visual dashboard checks remained. No live Firebase outage or
naturally pending visit occurred, so real outage replay remains unverified.
The release is deployed and scheduled, but Task 6 was not marked fully complete
at that point.

After the boards were powered on, authenticated production reads showed both
RFID and gas/ultrasonic online with fresh timestamps. History returned 96
distinct visits with no repeated IDs; exact Firebase/Supabase ID and digest
comparison found 96 on each side. Signed-in browser acceptance is still open.

Six implementation tasks, each followed by the user's approval gate. Recommended execution: **native**, keeping one implementer for the shared ID/revision/lease contract, with a final independent reviewer before release. This preserves the prior working approach and avoids per-task delegation overhead. No implementation begins until the user reviews this plan and confirms the execution method.
