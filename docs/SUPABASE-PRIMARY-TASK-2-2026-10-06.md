# Task 2: schema and import foundation

## Result

Prepared and tested locally. The migration has **not been applied to production**, no live records have been imported, and the app still uses its existing database path. Task 3 will connect cat registration and RFID to this foundation after approval. Live schema application and importing real records remain separate, reviewable steps.

## Changed files

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261006121032_operational_foundation.sql` | CLI-generated additive migration: operational records, owner/tag claims, migration state, protected atomic import and compare-and-swap commits. |
| `lib/utils/operationalImport.mjs` | Private-export validation, canonical digest, owner/path checks, duplicate tag checks, camera credential linkage and Firestore type preservation; merge outage-only backed-up visits. |
| `scripts/operational-import.mjs` | Read-only Firestore export and existing Supabase visit reconciliation, dry-run and explicit apply commands using the existing server-only Supabase transport. |
| `lib/utils/operationalImport.test.mjs` | Tests source completeness, ownership, conflicts, camera credential preservation, source drift, data types and backed-up visits. |
| `lib/utils/operationalFoundation.test.mjs` | Executes the actual SQL against embedded PostgreSQL; tests rollback, repeated import, tag uniqueness, revisions, access restrictions and post-cutover import blocking. |
| `package.json`, `package-lock.json` | Pin PGlite 0.3.14 as a development-only SQL verification dependency. No production dependencies changed. |
| `.gitignore` | Exclude `migration-private/` exports from Git. |

The existing snapshot, SMS, push, catalog backup and visit backup tables/RPCs are unchanged. Operational records cover the full original document shapes that the sanitized backups do not retain; this is the new primary-store foundation in the same Supabase project, not another fallback transport.

## Schema and ownership defaults

- `operational_records` keeps original paths, owner UIDs, JSON data, source timestamps and a revision counter. It supports `users/...`, `deviceConfigs/...`, `cameraDevices/...`, `admins/...` and `deleteRequests/...`; unexpected root collections stop the export for investigation.
- `operational_tag_claims` enforces one normalized tag per owner. This matches the current app's duplicate-tag scope. Tags normalize to uppercase hexadecimal; invalid or conflicting tags block the entire transaction.
- Cat details require the corresponding owned profile. Tag indexes update transactionally when details change.
- `operational_migration_state` starts with `runtime_primary=false`. Importing does not switch the app. Once later cutover marks primary mode, the import RPC refuses stale source imports that could resurrect deleted records.
- New public tables have RLS enabled and no browser/anonymous access. RPCs use security invoker, an empty search path, and service-role-only execution. Server routes must still verify Firebase ID tokens, derive the owner, validate fields and validate device credentials before calling these operations.
- Writes use expected revisions; a stale revision or ownership conflict rolls back every change in the batch. Camera pairing can therefore revoke an old record and create a new pairing in one future server operation.
- A shared transaction lock serializes import and commit batches. This is a conservative starting point for the current small deployment; optimize only if actual write volume warrants it.
- Atomic imports are capped at 5,000 records / 20 MB. Runtime commit batches are capped at 100 changes / 2 MB. Oversized exports stop rather than silently truncating; separately reviewed scoped batches are required for larger datasets.

## Safe import behavior

Export recursively reads all supported documents and subcollections, including children of missing parent documents. It performs two full source passes and rejects changed contents/timestamps. Pause operational writers for the final export/cutover: two passes detect drift but are not a global Firestore point-in-time snapshot.

The exporter also reads existing Supabase visit backups before and after the source scan. Existing visit normalization/digests determine whether the same session is already present. Valid outage-only visits are added under their original session IDs; cancelled visits are not restored. Unresolved conflicts, missing current cats for restore candidates, invalid hashes or changed backups stop the export for review. Existing Supabase backups are retained.

The import is one transaction. Exact repeats are no-ops; different canonical data is a conflict. A dry run exercises the same database constraints and rolls back temporary records and tag claims. Failures report safe aggregate counts and error codes; raw database details containing credentials are not printed.

Firestore timestamps preserve type markers, ISO values and available seconds/nanoseconds; bytes, references, coordinates and non-finite numbers also have explicit markers. Later readers must decode these where appropriate. Existing ISO strings and millisecond-number fields remain unchanged. Photo URLs are preserved, but copying photo files to Supabase Storage is still part of the later media stage.

## Commands for the later approved import

Run from `C:\Users\Admin\LitterSense-CSP-WebApp` with Node 24 and existing `.env.local` settings. Never commit or share the private export: it includes account/device configuration. Create the ignored `migration-private` directory first and restrict its Windows folder access to the operator; Node's POSIX file mode alone does not configure Windows ACLs.

```powershell
New-Item -ItemType Directory -Path migration-private -Force
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/operational-import.mjs --export migration-private/operational.json
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/operational-import.mjs --dry-run migration-private/operational.json
# Run only after reviewing the export and successful dry-run counts:
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --env-file=.env.local scripts/operational-import.mjs --apply migration-private/operational.json
```

The warning switch addresses Node's module-format diagnostic for the existing TypeScript transport imported by the command-line tool; it does not alter the app's package module format or suppress application errors. Export refuses to overwrite an existing file. Failed reads or quota errors never become an empty successful export.

Apply the reviewed SQL migration through the existing Supabase migration workflow before running a database dry run. The migration file was generated with `supabase migration new operational_foundation`; it is additive and does not alter the existing deployment's tables or jobs.

## Verification and limits

- Nine new import/PostgreSQL tests passed, including actual SQL execution and service-role versus anonymous permissions.
- The complete existing app test suite passed after the final changes.
- Full ESLint passed; TypeScript `--noEmit` passed. Targeted lint on the import tooling also passed.
- No physical firmware changes, upload, camera test or phone delivery test was performed in this section. No production migration or real-data dry run is claimed.
- Supabase changelog and current database-function documentation were checked before implementing. The current adapter deprecation does not affect this existing REST transport: https://supabase.com/docs/guides/database/functions
- Package audit reports 11 high-severity issues in existing Firebase/ESLint dependency chains; the new PGlite dependency is not listed in those findings. Dependency upgrades were left outside this migration task to avoid unrelated changes.

## Gates before primary cutover

1. Apply the reviewed additive schema; verify the same access restrictions against the live project.
2. Obtain a complete source export after quota permits reads, or a verified alternative export. Do not infer completeness from the existing partial backup tables.
3. Review counts, conflicts and preserved camera key hashes without printing secrets. Import and compare owner/document totals.
4. Connect each feature in the next sections and run fault/ownership tests.
5. Before final cutover, quiesce old producers/recovery jobs, reconcile the final changes, verify import counts, and then set primary state. The mode change must use the same migration lock to avoid racing an import.
6. Rollback after Supabase receives new writes requires reconciling them before restoring the old Firestore path. Do not drop these tables or simply flip back.
