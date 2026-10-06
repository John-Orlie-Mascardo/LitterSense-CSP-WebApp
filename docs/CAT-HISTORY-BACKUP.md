# Cat profile and visit backup

## Current checkpoint

Tasks 1–5 implement server-only Supabase storage, confirmed profile/catalog copying,
visit mirroring, an authorized outage queue, protected recovery and owner-scoped
display fallback. Firebase remains primary; the existing Supabase project is reused.
The release must pass the Task 6 checks below before recovery is enabled.

An initial copy can be verified against Firebase, but a later confirmed Firebase
visit may fail to mirror if Supabase is unavailable. During a Firebase outage,
the display therefore marks backed-up history **incomplete** even when the last
copy cycle completed. It never claims that an unseen new visit is present.

## Recovery configuration

Set these only in server environments:

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY`: existing SMS/sensor backup project.
- `CAT_HISTORY_PROCESS_SECRET`: a new random secret, different from `SMS_PROCESS_SECRET`.
- `CAT_HISTORY_RECOVERY_ENABLED=false`: retain until Task 6 passes initial copying,
  permission checks, deployed authentication and controlled recovery tests.

`POST /api/cat-backup/process` requires `Authorization: Bearer <CAT_HISTORY_PROCESS_SECRET>`.
Missing/wrong credentials return 401. A correct request while disabled returns
`{ "enabled": false }` without claiming work. Enabled runs return aggregate counts only;
failures return a sanitized 503. Credentials must never use `NEXT_PUBLIC_` variables.

Proposed schedule: once per minute, an authenticated **POST** from the existing
Supabase scheduler using `pg_cron`/`pg_net`, with the distinct secret stored in Vault.
Do not reuse a Vercel GET Cron URL for this POST endpoint. Configure/enable the
schedule only in Task 6 after review. No schedule is created by Task 4.

For an approved manual run from PowerShell with server variables already loaded:

```powershell
$taskHistoryHeaders = @{ Authorization = "Bearer $env:CAT_HISTORY_PROCESS_SECRET" }
Invoke-RestMethod -Method Post -Uri "$env:LITTERSENSE_APP_URL/api/cat-backup/process" -Headers $taskHistoryHeaders
```

## Guarantees and limits

- Up to five visit claims per run; 120-second leases and current-claim finalization.
  A crash before finalization leaves the lease recoverable. Backoff starts at 30
  seconds and caps at 15 minutes. The route has a 60-second budget and starts no
  additional work after 40 seconds; unfinished claims expire for later processing.
- Board ingestion and recovery share an Admin SDK transaction. The original session
  ID and affected summaries are read before any writes. One transaction creates the
  session and increments its summaries; matching duplicates never increment.
- Recovery retains the stored activity day. Past-day visits never increment today's
  top-level summary, and an older visit never moves `lastVisit` backward.
- Genuine firmware retries with equal timestamp shifts below one second preserve
  the first stored timestamp only for the same encoded boot/start/end identity and
  otherwise identical content. Meaningful changes are conflicts and are not acknowledged.
- Recovery verifies the current Supabase mapping and Firebase Auth account, owner
  document, active cat and current device configuration before creating a visit.
  Deleted/disabled accounts, removed cats and rotated/revoked devices cannot create
  new history. A matching already-saved primary visit is a no-increment duplicate.
  Unknown authority failures retry; they never become permission to replay.
- Imported `primary_saved` history is never claimed for replay. Queuing alone does
  not give the board a visit-saved or enrollment acknowledgement. Recovery sends no SMS.
- Repair has an independent owner lease and copies at most one owner's 100-row page
  plus a consistent catalog per run. Persisted cursors resume copying; completed cycles
  restart to catch late inserts. Oldest-due ordering shares work between owners.
  A classified primary outage backs off the remaining batch and repair without
  repeatedly reading Firebase. Unsupported records remain explicitly incomplete.

These guarantees are covered by transactional simulations and rolled-back SQL checks.
They do not constitute a production outage or physical board verification.

## Inspect progress

Run read-only SQL in Supabase:

```sql
select state, count(*) from public.cat_visit_backups group by state;
select owner_id, scanned, complete, checked_at, last_error
from public.cat_history_backup_progress order by checked_at;
select count(*) as incomplete_catalogs from public.cat_backup_catalogs where not complete;
```

`repairedRows` is the number copied in this run's page; `scanned` is cumulative for
the current copying cycle. Exact ID/count comparison is required before release;
`complete` alone is not evidence that all historical source data was copied.
Investigate conflicts without editing IDs, reassigning cats or resetting counters.
The test script `docs/cat-history-backup-check.sql` rolls back its synthetic owners,
visits, claims and account-cascade assertions, and does not queue SMS.

## Rollback

1. Disable the new scheduler and set `CAT_HISTORY_RECOVERY_ENABLED=false`.
2. Restore the saved compatible app deployment/source checkpoint. Preserve existing
   SMS, camera and sensor backup tables and their environment settings.
3. Retain new history backups for investigation; do not delete queued visits or
   recreate historical records to simulate an outage.
4. Only if removing this feature is explicitly approved, after restoring a compatible
   app and stopping its jobs, review `docs/cat-history-backup-rollback.sql`. It removes
   only the new history objects, not existing SMS or sensor storage.

Account deletion already deletes `sms_accounts` before primary removal. Foreign-key
cascades remove these new owner backups. Device rotation deletes the old public
Firebase configuration; the transactional current-token check blocks its queued
replay without deleting saved history. No provisioning or account-removal changes
were needed for Task 4.

## Task 6 release record

- Previous production deployment: `dpl_9GMqQ8aRa8Cq8DRnxs2fZDS5z57X`.
- The storage migration was already present. `cat-history-backup-read-visits-fix.sql`
  corrects a row-alias bug that returned null visit IDs. Apply that migration
  before verifying or releasing history reads.
- Before release, the verified owner had three cats and 93 Firebase sessions.
  The bounded initial copy reproduced all three cat IDs and all 93 exact session
  IDs in Supabase. The rolled-back storage assertions left no synthetic accounts.
- The first deployed read check found a repeated visit across history pages when
  a stored query date differed from the presentation date. Cursor keys now use
  the stored date, with a regression test for the boundary.
- `CAT_HISTORY_PROCESS_SECRET` is distinct from the SMS secret and is server-only.
  Keep `CAT_HISTORY_RECOVERY_ENABLED=false` until deployed ownership, route,
  initial-copy and controlled recovery checks pass. Verify fresh sensor
  heartbeats separately before closing release acceptance.
- The release repair migration keeps the one-minute scheduler but checks a
  completed copy hourly. Incomplete copying continues one bounded page each
  minute; retry failures retain the capped backoff. This avoids repeatedly
  reading the entire Firebase history every five minutes after completion.
- Final production deployment: `dpl_DmA7FPfVUkCa67kaNjgNd49yn3VF`, from
  source commit `2b1680e`. Production checks returned 401 without an owner
  token, 403 for a foreign history cursor, 3 owner profiles and 93 distinct
  history visits across five pages, with no repeated IDs. The sensor route
  returned 200, but both hardware receipts were stale while the boards were
  powered off; fresh hardware display still needs acceptance.
- Controlled primary-failure reads against the real backup returned three
  profiles and 93 unique visits with `complete=false`. The manual recovery
  call restored zero visits, repaired 93 existing rows, and sent no synthetic
  alert. It does not prove a real live outage or pending-visit replay.
- `littersense-cat-history-worker` runs every minute using a separate Vault
  secret. Its first scheduled request returned HTTP 200. At the release check,
  Supabase held 93 visits, zero pending visits and zero synthetic accounts.
- At initial release, a signed-in visual browser check and fresh RFID/gas
  heartbeats remained outstanding because the boards were off. API checks
  prove authenticated data reads but do not substitute for that UI check.
- After the boards were powered on, an authenticated production check returned
  `rfidState=online` and `gasUltrasonicState=online` with current timestamps.
  The same check returned 96 distinct visits across five pages with no repeat
  IDs, and an exact ID/digest comparison found all 96 visits in both Firebase
  and Supabase. The owner refreshed the signed-in dashboard and History page
  and confirmed both sensors show online and recent visits are visible.
- On rollback, pause the cat-history scheduler first, restore the previous app
  deployment, and retain history tables and queued rows for investigation. The
  SMS and sensor tables must remain in place.
