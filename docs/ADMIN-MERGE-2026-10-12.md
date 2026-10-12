# Admin merge into orlie-branch

This merge combines Ashton's custom-claim admin module with Orlie's current Supabase data storage, authentication race guards, owner profile photos, and hardware provisioning paths.

Firebase Authentication remains the identity provider. The `admin: true` custom claim controls administrator access in the UI and server APIs. Legacy admin email and document allowlists no longer grant access. In Supabase primary mode, owner profiles, deletion requests, and administrator audits use canonical `operational_records`. The Firestore fallback remains available when primary mode is disabled; `firebase.json` continues selecting the existing Supabase-primary Firestore rules.

Account requests and rejection update canonical state and audit entries atomically. Approval claims the request before cleanup, revokes owner sessions, removes Supabase and legacy Firebase data and media, deletes Firebase Auth, and atomically finalizes the canonical profile and approval audit. Failed requests retain enough profile information for retry. Processing requests left by an interrupted worker can be reclaimed after ten minutes through **Retry cleanup**. Completed-deletion audit records prevent stale verified requests from recreating deleted owner data. Uploads that overlap deletion are checked again and cleaned up.

Ordinary profile saves preserve server-managed deletion, role, and push-token fields. The admin queue supports membership filters through the existing client adapter. Audit reads select the newest fifty entries in the database rather than scanning the full history.

## Deployment prerequisites

1. Review and apply `supabase/migrations/20261012120000_operational_admin.sql` to the intended Supabase project before deploying this merged app in primary mode. The migration adds canonical admin RPCs, audit indexes, and deletion guards. It was tested locally and was not applied to a live project.
2. Grant intended administrators the Firebase custom claim with the existing server-only command: `npm run admin:grant -- admin@example.com`. The command requires the target environment's server credentials. No real privileges were changed during this merge.
3. Sign out and back in, or refresh the ID token, after changing claims. Revocation removes the claim and revokes refresh tokens.
4. Verify login, owner profile changes, queue updates, audits, claim revocation, device provisioning, and deletion using a disposable test account against the intended environment. The local suite uses controlled fixtures and does not prove live service configuration.

The merged code was not pushed or deployed. The earlier Firestore-specific acceptance checklist in `HANDOFF.md` describes the incoming admin branch; use this note for the current primary database path.
