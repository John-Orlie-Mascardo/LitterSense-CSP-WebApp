# Cat profiles and visit history during Firestore outages

## Agreed goal

Extend the verified sensor-display fallback so owners can read backed-up cat profiles and visit history during Firestore quota/service failures. Retain completed RFID visits received during an outage and restore them to Firestore after recovery, without recording or counting the same visit twice.

Firebase remains the primary database. The existing Supabase project stores backups and pending visits. Profile editing remains a confirmed Firestore operation; this phase does not introduce profile editing in Supabase during an outage. Work proceeds one implementation task at a time, with user approval between tasks.

## Scope

Included:

- Existing `users/{owner}/cats` and `catDetails` records, including RFID assignments and existing baseline fields needed to interpret visits.
- Existing persisted `sessions` records, retaining their exact document IDs and original activity dates. Preserve existing incomplete historical rows as historical data; do not change which new device events qualify for persistence/counting.
- New completed visits accepted from known device mappings, their outage queue, duplicate-safe Firestore recovery, and history/profile fallback reads.
- The session-derived counts and trends used by affected screens, with one contribution per unique persisted visit and the existing counting rules.
- Ownership, deletion, retry, monitoring, recovery documentation and controlled simulations needed for those flows.

Excluded: photo file replication, health-log/report-document/notification migration, camera or firmware changes, new SMS behavior, full database replication, automatic restoration of missing/deleted profiles, or two independently editable databases. Existing avatar URLs may be copied; the image bytes remain in their current storage. Existing aggregate-only records without corresponding sessions are not reconstructed as invented visits; aggregate preservation is a separate scope.

## Existing code and integration points

`CatContext.tsx` currently reads and mutates cats/details directly through Firestore. `useSessionHistory.ts` performs filtered, paginated Firestore reads. `/api/sensors` is the single writer for completed device visits: `buildSessionDocumentId` supplies the ID and `buildVisitWritePlan` builds one atomic commit containing the new session and summary increments, with a session `exists:false` precondition.

The SMS account backup holds only a limited cat projection. It is not a complete profile/history backup and must not be used as one. Reuse its server REST helper and verified owner/device associations without changing SMS consent, recipients, scheduling, retention or delivery.

The current REST collection helper stops at 1,000 documents. Initial history backup needs an explicit bounded page/cursor interface; reaching a limit must never be reported as a complete backup.

## Storage and authority

Use separate server-only tables for profile catalog state, profile records and visits. Enable RLS and deny browser-role table/function access; authenticated app endpoints verify Firebase identity and scope every query to that identity. Device ingestion resolves the owner through the existing verified token-hash mapping; it never accepts an owner ID or cat ID supplied by the device as authority.

Profile records use `(owner_id, cat_id)`. A catalog revision orders full verified profile snapshots and deletion tombstones. Move only the existing profile mutation methods behind an authenticated server endpoint so Firestore can update the affected profile/details and catalog revision atomically. Keep the current forms, enrollment flow, photo helpers and field meanings. Reads for a catalog backup must capture a consistent catalog revision and records; an older copy cannot overwrite a newer catalog. Only a complete authoritative catalog read can identify absent/deleted cats; a failed or partial read cannot delete backup rows. Empty valid catalogs must be distinguishable from unavailable catalogs.

Visit records use `(owner_id, firebase_session_id)`, preserving existing IDs. Store normalized allowlisted session fields, original event times, optional verified device hash, an immutable semantic payload digest, and a state: `primary_saved`, `pending`, `claimed`, `conflict`, or `cancelled`. The digest excludes storage receipt time and replay bookkeeping. Repeated identical IDs/payloads are a no-op; an ID reused for different cat/event content becomes a visible conflict, never a silent overwrite. Existing imported records are already `primary_saved` and are never replayed or added to counters again.

Keep visits linked to the owner account for deletion cascading. Device rotation must revoke new ingestion/recovery authority without deleting already saved historical visits. Do not store raw device tokens, passwords or credentials in Supabase.

## Initial copy and ongoing maintenance

Backfill every authorized owner's existing cats/details and sessions using bounded pages and resumable cursors. Record progress, failures and completion separately; do not claim full protection before the initial catalog and history copy completes. Initial copy inserts/updates backups only and never writes visits or increments to Firestore.

While Firestore is healthy, mirror confirmed profile revisions and persisted device visits. A mirror failure must not undo a confirmed primary save or turn it into a second visit. Use a bounded repair worker with durable progress to recover missed copies, including failures/crashes after a primary commit. Its rolling reconciliation scans have a fixed read budget and revisit earlier ID ranges on subsequent passes; do not scan all history on each sensor heartbeat or dashboard poll. Report repair lag explicitly. Profile reconciliation captures the catalog and advances its source revision in one primary transaction so direct external edits can also receive an ordered backup revision. A primary profile change with a failed mirror is saved but visibly pending backup; an older fallback catalog may temporarily lag until repair.

Bootstrap uses server-read records and verified account/device associations, including owners who have not opted into SMS. Direct edits outside the app cannot update an outage backup immediately; healthy reconciliation must pick them up before the next outage.

## Outage ingestion and acknowledgements

During a classified Firestore 429 or service failure, validate events through the existing sensor normalization/countability rules, resolve the previously verified device owner and match exactly one active backed-up RFID assignment. Reject unknown/revoked mappings and ambiguous/unmatched tags. Require a complete verified catalog; no guesses from partial SMS projections. Malformed requests, permission failures and readable missing/revoked Firestore configurations cannot authorize fallback.

Atomically store each accepted outage visit once as `pending`. Duplicate retries with identical content cannot create another row or another count. Preserve the original event time and the activity-day key determined by the primary write-plan convention at ingestion; delayed receipt/replay time or a different worker timezone must not change that stored key. Imported history keeps its existing persisted date fields. Undated legacy records retain their original fields and are not assigned today's date.

Keep existing device responses and visit acknowledgements: a Supabase queue save alone does not acknowledge a successful Firestore history write. The board may retry its existing pending events while the server also retains a durable copy. Enrollment acknowledgements remain on their existing path. This adds no new synthetic SMS/notification dispatch.

## Recovery and exactly-once counter effects

A separate protected worker claims a small bounded batch with a lease. Recheck the active account, device authorization and current primary cat registration before replay. Deleted cats/accounts or revoked devices cannot be recreated or used to accept new replay writes; affected pending rows are cancelled with a reason. A failed authority check is retryable only when the authority store is unavailable, not when it reports deletion/revocation.

For each queued visit, use its original Firebase session ID and semantic fields. Reuse the existing atomic session-plus-summary write strategy: session creation with `exists:false` and all associated count/duration increments belong to the same Firestore commit. Use the queued original activity-day key for daily summary paths. Do not apply a past day's contribution to today's headline statistics. Preserve the greatest existing `lastVisit` timestamp when replaying older visits, using a transaction or guarded summary writes in the same commit; replay must not move the latest-visit display backwards.

If the session already exists and matches, mark the queue row `primary_saved` without incrementing again. If the existing content conflicts, mark `conflict` and stop that visit. If the commit succeeds but its response is lost, the next attempt verifies that same session before writing. A concurrent board retry or recovery worker can create the session only once; a precondition conflict triggers a re-read and comparison. Only after a confirmed successful commit/matching existing session may the worker mark the row saved. Lease expiry allows safe retries after interruption.

Keep recovery scheduling separate from the SMS sender even if both use Supabase Cron. Use a distinct server-only worker secret, bounded batches and retry backoff. Do not treat every dashboard request as permission to replay history.

## Fallback display

Keep existing page layouts, cat selection and history filters. Authenticated server reads return owner-scoped cats/details and history with source, backup freshness/completeness and pending-recovery metadata. The history endpoint preserves date range, sorting, pagination and filtering behavior with deterministic cursors.

During a primary failure, show the backed-up catalog/history with a clear backup-mode message. During recovery, show the union of primary history and authorized pending visits, deduplicated by the same Firebase session ID; a pending row that is already in the primary result must not contribute twice. Derived totals and trends use the same unique visit set and existing inclusion rules. Do not fabricate legacy aggregate-only totals or represent an incomplete backup as empty complete history.

Fresh devices remain independent of catalog/history storage status. Storage errors must not turn a working sensor offline. Account switches abort outstanding work and clear prior-owner data. Profile edit/add/delete actions require confirmed primary access; during an outage they return an actionable unavailable message and cannot appear successfully saved from a local pending Firestore write.

## Verification and release gates

Tests must cover complete multi-page backfill beyond 1,000 rows; restart/cursor continuity; owner isolation; browser grants; out-of-order catalog copies; tombstones; profile failures and missing catalog state; unknown/revoked devices; duplicate event IDs; conflicting payloads; original dates; countability; history pagination/filtering; account switches; and both stores unavailable.

Recovery tests must exercise a board retry racing a worker, commit success followed by lost response, a worker crash before saved-state update, expired leases, past-day replay, midnight/day-key consistency, non-regressing latest-visit summaries, already imported visits, deletion/revocation and conflicts. Assert exactly one session and exactly one set of counter effects after repeated recovery attempts.

Run database simulations in rolled-back transactions. Stub SMS/notification paths in synthetic ingestion tests. Never exhaust the actual Firebase quota or send synthetic cat-health alerts. Require the full app/camera regressions, lint and production build before release.

Record the existing sensor fallback deployment (`dpl_9GMqQ8aRa8Cq8DRnxs2fZDS5z57X`) as the current baseline and verify it again before promotion. Preserve a clean source archive and scoped commits; document app rollback before schema rollback. Verify initial-copy completeness, a real primary-saved visit backed up once, controlled outage/recovery behavior, final history display and unchanged live sensor display. Do not report source tests as physical or deployed outage proof.

## Limits

Firebase Auth and existing image storage remain dependencies. Supabase also has quotas/outages. A stale profile backup may not know about direct external edits made during an outage. Outage protection starts only after a complete verified initial copy. The board's existing retry capacity remains finite because firmware is outside scope. This is durable profile/history fallback with controlled replay, not full bidirectional replication or guaranteed continuous service.
