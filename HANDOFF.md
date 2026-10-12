<!--
  HANDOFF.md

  Project-wide index of unresolved phase-zero decisions and defense blockers.

  DONE: open TODO(phase0)/FIXME(defense) items and completed QA architecture are indexed
  PLACEHOLDER: none; intentional skeleton loading states are not product placeholders

  NEXT: the listed owner for each item updates both the source comment and this index.
-->

# LitterSense Handoff

This index covers the open decisions and demo blockers found in source code as of October 7, 2026. When an item is resolved, remove its source tag and its matching entry here in the same change.

## Admin access and account deletion — Final handoff (Phase 6)

**Date:** October 7, 2026

This update replaces browser-managed administrator access with Firebase custom claims, adds server-authenticated admin login auditing, and moves account deletion requests into each owner's USER document. Owners can request deletion without immediately losing access. Administrators receive a live queue, can reject or perform the ordered permanent-deletion workflow, and can review the latest 50 immutable audit entries. Firestore rules now enforce claim-based admin access and owner isolation. The app, scripts, automated tests, and manual verification guide are ready, but no Firebase or Vercel deployment was performed in this phase.

### Acceptance checklist

| ID | Status | One-line verification |
| --- | --- | --- |
| A1 | Done | Sign in through the normal login page; there is no separate admin credential form or hard-coded admin email path. |
| A2 | Done | Grant `admin: true`, refresh the ID token, and confirm the app derives administrator state from the custom claim. |
| A3 | Done | Confirm the admin-management page exposes no browser control for granting or revoking claims; use the server-only script. |
| A4 | Done | Open an `/admin` route as an owner and confirm the neutral access boundary redirects without rendering admin content. |
| A5 | Done | Sign in as an owner and confirm owner navigation and routes remain available. |
| A6 | Done — needs manual test | Deploy the rules, then run the browser-console owner and non-owner USER-document reads in `docs/firestore-rules-manual-tests.md`. |
| A7 | Done — needs manual test | With deployed rules, confirm an owner cannot read admin-only audit data and an admin claim can. |
| A8 | Done — needs manual test | Deploy the rules, then run the browser-console checks proving client writes cannot create or modify audit entries. |
| A9 | Done — needs manual test | Sign in to a real Firebase project as an admin and verify one `admin_login` audit entry is recorded without blocking login. |
| A10 | Done — needs manual test | Revoke a real admin, refresh or reauthenticate, and confirm both UI access and admin API calls are denied. |
| D1a | Done — needs manual test | Submit deletion in Settings and verify the USER document receives `deletionStatus: pending`, timestamp, UID, and email. |
| D1b | Done | Submit twice and confirm the server/UI prevents a duplicate pending request. |
| D1c | Done — needs manual test | While status is pending, navigate through owner pages and confirm the account remains usable. |
| D2a | Done — needs manual test | Change a USER deletion status in the real project and confirm the admin queue updates in real time. |
| D2b | Done — needs manual test | Compare the pending-deletion KPI with the live queue and confirm both use the same records. |
| D3a | Done — needs manual test | Approve a disposable owner and verify linked Firestore data, Storage objects, USER, and Auth are removed in order. |
| D3b | Done — needs manual test | Inject a deletion-stage failure, verify safe failed state/audit details, then retry to successful completion. |
| D3c | Done — needs manual test | Complete approval and verify a `deletion_approved` audit entry retains target UID/email after the owner is gone. |
| D3d | Done | Call the approval endpoint with a non-admin token and confirm it returns 403 without deleting data. |
| D3e | Done — needs manual test | Delete the target account and confirm its admin audit record remains readable. |
| D4a | Done | Reject through the endpoint and confirm the USER reset and rejection audit are committed atomically. |
| D4b | Done — needs manual test | Reject a pending request and confirm the owner account and linked data remain intact. |
| D4c | Done — needs manual test | After rejection, confirm the owner can submit a new deletion request. |
| D4d | Done — needs manual test | Reject a real request and verify the live queue and KPI remove it immediately. |
| D4e | Done | Call the rejection endpoint with a non-admin token and confirm it returns 403 without changing the request. |

No acceptance item is marked Not done. Items marked “needs manual test” require deployed Firebase services, real Auth sessions, or deliberate failure injection and are not proven by the local automated suite alone.

### What changed

**Server**

- Added reusable owner/admin bearer-token verification, including forced revocation checks for privileged operations.
- Added server-written audit records for admin login, approval, rejection, and deletion failure.
- Added owner deletion-request and admin rejection endpoints; expanded approval into the required, retry-safe permanent-deletion workflow.
- Approval removes the optional Supabase backup, recursive owner subcollections, linked top-level device/config records, predictive-health limits, `users/{uid}/` Storage objects, USER document, and Auth user before writing the success audit.
- Kept the device configuration endpoint compatible with hardware by moving its Firestore access to the Admin SDK rather than weakening client rules.

**Frontend**

- Normal login now handles owners and administrators; custom claims determine the destination and route access.
- Admin pages use a neutral claim-aware boundary, live USER deletion requests, a matching pending KPI, server approve/reject operations, and the latest 50 audit events.
- Settings now submits deletion through the server and displays pending/processing/failed state without signing the owner out.
- Removed browser-side admin claim management and replaced it with instructions for the server-only script.

**Rules**

- Firestore rules now recognize only the `admin: true` custom claim, isolate owner documents and nested data, permit the narrow owner transition to `deletionStatus: pending`, keep audit data server-written, and preserve device-token compatibility through the server route.
- Rules were edited and documented but were not deployed.

**Scripts and tests**

- Added `npm run admin:grant -- <email-or-uid>` and `npm run admin:revoke -- <email-or-uid>` using the Firebase Admin SDK.
- Expanded the test command to include script tests and added coverage for claims, auth boundaries, endpoints, queue/KPI state, deletion ordering/retry, audit display, and settings behavior.

### Changes to existing logic

| File or area | Change | Requirement |
| --- | --- | --- |
| `lib/contexts/AuthContext.tsx`, `lib/utils/adminClaims.ts` | Replaced email/document admin inference with refreshed Firebase custom claims. | A2, A10 |
| `components/AdminRoute.tsx`, `components/layout/AdminSidebar.tsx` | Added claim-aware neutral access handling and removed client admin management. | A3–A5 |
| `app/(auth)/login/page.tsx`, `lib/utils/adminLoginAudit.ts` | Kept one login flow and records a best-effort server admin-login audit. | A1, A9 |
| `lib/utils/adminApi.ts`, admin API routes | Standardized bearer-token calls and 401/403 handling with revocation checks. | A10, D3d, D4e |
| `app/dashboard/settings/page.tsx`, account-deletion helpers/component | Writes requests through the owner endpoint and renders USER deletion state. | D1a–D1c |
| `lib/contexts/DeleteRequestContext.tsx`, admin queue components | Replaced mock/local requests with a live USER query and server actions. | D2a–D2b, D3, D4 |
| `app/api/admin/delete-user/route.ts` | Replaced partial deletion with ordered recursive cleanup, failure state, audit, and idempotent retry. | D3a–D3e |
| `lib/contexts/AdminContext.tsx`, `app/admin/page.tsx` | Uses the live queue for the KPI and loads the latest 50 audit records. | D2b, D3c, D3e, D4d |
| `app/admin/add-admin/page.tsx` | Replaced client-side privilege mutation with server-script guidance. | A3 |
| `app/api/device-config/[configToken]/route.ts` | Uses trusted server Firestore access so restrictive rules do not break ESP32 provisioning. | A6–A8 compatibility |
| `firestore.rules` | Enforces claim-only admin access, owner isolation, narrow request writes, and server-only audits. | A6–A8, D1a |
| `package.json` | Includes script tests and exposes grant/revoke commands; dependencies were unchanged. | A3, verification |

### New files and their purpose

**Server and API**

- `lib/server/adminAuth.ts` — verifies bearer tokens and the admin claim, with optional revocation checks.
- `lib/server/ownerAuth.ts` — verifies authenticated owner bearer tokens.
- `lib/server/auditLog.ts` — centralizes server-only immutable admin audit writes.
- `app/api/account/deletion-request/route.ts` — validates and creates an owner's pending request on USER.
- `app/api/admin/login/route.ts` — records successful interactive administrator logins.
- `app/api/admin/deletion-request/reject/route.ts` — atomically rejects a request and writes its audit entry.

**Client and UI**

- `lib/utils/adminClaims.ts` — normalizes custom-claim admin detection.
- `lib/utils/adminApi.ts` — authenticated admin API request helper and access-error handling.
- `lib/utils/adminLoginAudit.ts` — best-effort login-audit client boundary.
- `lib/utils/accountDeletion.ts` — account-deletion status parsing and owner request helper.
- `lib/utils/adminDeletionRequests.ts` — USER request normalization, query status, and ordering helpers.
- `lib/utils/adminAudit.ts` — audit-record normalization and display helpers.
- `lib/utils/adminOverview.ts` — shared pending-deletion KPI calculation.
- `components/admin/ServerManagedAdminAccess.tsx` — explains the server-only grant/revoke workflow.
- `components/admin/DeletionQueue.tsx` — renders and operates the live request queue.
- `components/admin/AuditLogList.tsx` — renders the latest 50 read-only audit events.
- `components/settings/AccountDeletionRow.tsx` — renders request actions and pending/processing/failed owner states.

**Operations, documentation, and tests**

- `scripts/manage-admin.mjs` — grants or revokes `admin: true` without exposing Admin SDK credentials to the browser.
- `docs/firestore-rules-manual-tests.md` — browser-console A6/A8 checks, admin checks, device compatibility, and the rules deploy command.
- `scripts/manage-admin.test.mjs` — tests claim preservation, input handling, grant, and revoke behavior.
- `app/api/account/deletion-request/route.test.cjs`, `app/api/admin/adminRoutes.test.cjs`, `app/api/admin/delete-user/route.workflow.test.cjs`, `app/api/admin/deletion-request/reject/route.test.cjs`, `app/api/admin/login/route.test.cjs`, and `app/api/device-config/[configToken]/route.test.cjs` — cover authorization, state transitions, audit behavior, deletion ordering/retry, and device compatibility.
- `lib/server/adminAuth.test.cjs`, `lib/server/ownerAuth.test.cjs`, and `lib/server/auditLog.test.cjs` — cover the trusted authentication and audit boundaries.
- `lib/utils/accountDeletion.test.cjs`, `lib/utils/adminApi.test.cjs`, `lib/utils/adminAudit.test.cjs`, `lib/utils/adminClaims.test.cjs`, `lib/utils/adminDeletionRequests.test.cjs`, `lib/utils/adminLoginAudit.test.cjs`, and `lib/utils/adminOverview.test.cjs` — cover the new pure client helpers.
- `components/AdminAccessBoundary.test.cjs`, `components/admin/ServerManagedAdminAccess.test.cjs`, `components/admin/DeletionQueue.test.cjs`, `components/admin/AuditLogList.test.cjs`, and `components/settings/AccountDeletionRow.test.cjs` — cover access, admin UI, queue, audit, and owner status rendering.

### Setup

Configure names only; never commit values. Local values belong in ignored `.env` files, and hosted values belong in Vercel project secrets.

- Server only: `FIREBASE_SERVICE_ACCOUNT_BASE64`. Do not prefix this with `NEXT_PUBLIC_`.
- Firebase client: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, and `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` if Analytics is enabled.
- Optional existing backup integration: `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Approval skips Supabase cleanup when these are not configured.

The first administrator must already exist in Firebase Authentication. Grant the initial claim from a trusted local terminal with server credentials configured:

```powershell
npm run admin:grant -- admin@example.com
```

The user must sign out and back in, or otherwise force-refresh the ID token, before the new claim appears. Revoke with `npm run admin:revoke -- admin@example.com`; existing tokens can retain their old claim until refreshed or expired.

### Deployment steps and warning

1. Add the environment names above to local `.env` and Vercel with their correct secret values; keep the service account server-only.
2. Deploy the application routes to Vercel before or in the same release window as the restrictive Firestore rules.
3. Grant the first existing Firebase Auth user with `npm run admin:grant -- <email-or-uid>`, then sign out and back in.
4. From the configured Firebase project, deploy the reviewed Firestore rules with `firebase deploy --only firestore:rules`.
5. Run `docs/firestore-rules-manual-tests.md`, the end-to-end checks below, and an ESP32 provisioning/sensor smoke test.
6. Review and deploy the separate existing Storage rules before hosted photo testing; this update did not change or deploy them.

**Warning:** Do not deploy only the restrictive Firestore rules while the old client is live. That can break device configuration and admin behavior. No rules, Vercel build, claims, or production data were changed by the coding agent.

### Manual tests after deployment

1. **A6/A8 browser-console rules checks:** run every owner-isolation, nested-data, cross-owner, audit-read, and audit-write snippet in `docs/firestore-rules-manual-tests.md` with the documented owner/admin sessions.
2. **Admin access:** verify owner denial, granted-admin entry, one login audit per interactive login, reload persistence, revoke, token refresh, and API denial.
3. **Owner request:** submit once, confirm the USER fields, confirm duplicate prevention, and browse all owner features while pending.
4. **Live queue and KPI:** watch the request appear without reload and confirm the pending KPI equals the pending queue count.
5. **Reject:** reject, confirm USER returns to `none`, data/Auth remain, audit appears, and the owner can request again.
6. **Approve:** use a disposable owner with cats, visits, device/config data, predictive limits, Storage files, and optional Supabase backup; verify the documented deletion order and retained audit.
7. **Failure and retry:** deliberately fail one stage, confirm the safe failed status and admin audit, repair the cause, retry, and confirm completion.
8. **Audit list:** create more than 50 audit events and confirm only the newest 50 appear in descending order and cannot be edited by clients.
9. **Hardware:** provision an ESP32 through the config-token endpoint and verify normal sensor upload/acknowledgement behavior after the rules release.

### Found, not fixed

- A deleted owner's previously issued ID token can remain valid until refresh/expiry. Approval revokes refresh tokens and privileged admin endpoints check revocation, but immediate owner-side lockout would require a durable deletion tombstone plus rule/API enforcement.
- `storage.rules` still needs its separate production review/deployment; it was outside this Firestore-focused update.
- The signup flow still contains a hard-coded post-signup redirect choice; the new admin boundary prevents privilege escalation, but the redirect should be cleaned up.
- Admin “Active Users” and Suspend/Restore behavior still uses non-persistent UI assumptions rather than a defined server-side account-status model.
- Some older mock admin data remains dead code, and the Users-page View action has no implemented destination/action.
- The prior dependency audit reported 11 high-severity findings; this update added no packages and did not change dependency versions.
- The existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning for `lib/utils/sensorEndpointDiagnostics.ts` remains; it does not fail checks.

### Open decisions

- Decide whether to add a server-managed deletion tombstone for immediate denial of cached owner tokens.
- Decide whether owners should be allowed to cancel a pending request; Phase 0 selected no cancellation.
- Decide whether owners should receive an approval/rejection notification; Phase 0 selected no notification.
- Define persistent meanings and server behavior for “active,” “suspended,” and “restored” users before changing those admin controls.
- Decide when to remove dead admin mocks, implement the Users View action, and replace the hard-coded signup redirect.
- Approve and deploy Storage rules separately, including the photo-path behavior already used elsewhere in the app.
- Finalize behavior-state threshold values and matching manuscript language before the defense build.

### Manuscript impact

- **Section 3.3.10 — Settings:** document the server-authenticated Delete Account request, the USER `deletionStatus` lifecycle (`none`, `pending`, `processing`, `failed`), duplicate prevention, continued owner access while pending, failure copy, and the absence of owner cancellation in this version.
- **Section 3.3.11 — Admin Dashboard:** replace any email-list/document-role description with Firebase `admin: true` custom claims; describe normal login, claim-aware routing, live deletion queue/KPI, approve/reject actions, and the latest-50 audit list.
- **Section 3.4 — Use Case Diagram/Description:** add Grant/Revoke Admin as a trusted maintenance-script use case; add Request Account Deletion for owners; add Review, Approve, Reject, Retry Failed Deletion, and View Audit Log for administrators.
- **Section 3.4.2 — ERD:** place deletion request fields on USER rather than a separate owner-controlled request record; add immutable ADMIN_AUDIT entries with actor/action/target/timestamp/details. Audit target UID/email intentionally remain after deletion. Also remove `weight` from CAT; legacy stored values are left untouched.
- **Section 3.4.3 — Architecture:** show Firebase custom claims, client ID tokens, Next.js server routes, Firebase Admin SDK, Firestore rules, Storage-prefix deletion, optional Supabase cleanup, Auth deletion, audit persistence, and the server-only grant/revoke script. No Cloud Functions or paid service was introduced.
- **Section 3.2.3 — Economic feasibility:** dependencies and paid services are unchanged. The design continues to fit the existing Firebase/Vercel/Supabase free-tier assumptions for the capstone, subject to their usage quotas; actual production volume can create hosting, Storage, or database charges.
- **Other existing `NOTE(manuscript)` items:** keep the owner-notification behavior-state name aligned with the paper; do not promise weight tracking on the dashboard; keep the signup minimum password length aligned; synchronize report ranges, labels, state copy, Session Accordion labels/descriptions/counts, numeric baseline periods/values, visible seven-day wording, and all configured behavior threshold/state definitions. Sections 3.3.6 and 3.3.7 must show that cat registration, profile display, and editing no longer use weight.

### Proposed conventional commit

One commit is valid for this tightly coupled security workflow. Separate phase commits would be cleaner for review—`auth claims and rules`, `owner request flow`, `admin queue and audit`, and `deletion workflow`—but the requested single message is:

```text
feat(admin): secure access and account deletion

- use Firebase custom claims for admin routing and APIs
- add server-only grant, revoke, login audit, and request endpoints
- enforce owner isolation and server-written audit records in rules
- add the live deletion queue, KPI, rejection, and audit history
- delete linked data, Storage, USER, and Auth with retry support
- document manual rules checks and manuscript changes

Deploy notes:
- configure Firebase client env names and FIREBASE_SERVICE_ACCOUNT_BASE64
- deploy the app and reviewed Firestore rules in the same release window
- grant the first existing admin with npm run admin:grant -- <email-or-uid>
```

### Groupmate summary

#### What changed

Admin access now uses Firebase custom claims through normal login. Owners request deletion from Settings; admins get a live queue/KPI, reject or run ordered permanent deletion, and see the newest 50 server-written audit events. Firestore owner/admin rules and a server-only claim script were added.

#### What you need to do by person

- **Firebase/Vercel owner:** set the documented env values, deploy app plus reviewed Firestore rules, then review/deploy Storage rules.
- **Admin lead:** grant the first existing Auth user with `npm run admin:grant -- <email-or-uid>` and re-login.
- **QA/hardware lead:** run the manual rules, deletion, audit, failure/retry, and ESP32 checks.
- **Manuscript lead:** apply the listed changes to Sections 3.2.3, 3.3.10, 3.3.11, 3.4, 3.4.2, and 3.4.3 plus existing NOTE items.

#### Watch out

Do not deploy restrictive rules before the matching app routes. Cached owner tokens remain an open hardening item. Use only disposable QA accounts for approval tests.

#### How to test quickly

Run `npm run check`, then test owner request → admin live queue → reject; repeat and approve a disposable owner. Verify audit retention and ESP32 provisioning.

#### Still open

Deletion tombstones, cancellation/notifications, persistent suspension/activity semantics, Storage-rules release, dead admin UI cleanup, and final behavior thresholds.

## Admin access and account deletion update — Phase 5

Phase 5 moves the administrator deletion queue to a real-time USER query and makes Approve and Reject authenticated server operations. Approval follows the required `processing` → linked data → Storage → USER → Auth → audit order; a failed step recreates or updates the USER request as `failed`, records a safe retry message, and writes `deletion_failed`. Rejection atomically returns the USER status to `none` and writes its audit entry without changing Auth or owner data. The dashboard also displays the latest 50 server-written audit records. Requirements addressed: D2a–D2b, D3a–D3e, and D4a–D4e.

### Phase 5 files and responsibilities

- `app/api/admin/delete-user/route.ts` — revocation-checked approval endpoint; deletes every USER subcollection recursively, owner-linked device/camera/legacy request records, the predictive-health limiter, configured backup data, the complete `users/{uid}/` Storage prefix, the USER document, and the Auth user before writing `deletion_approved`.
- `app/api/admin/deletion-request/reject/route.ts` — revocation-checked transaction that clears a pending request and writes `deletion_rejected` atomically.
- `lib/configs/firebase-admin.ts` — exposes the Admin SDK Storage bucket using the existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` name; no credential or new paid service was added.
- `lib/contexts/DeleteRequestContext.tsx` and `lib/utils/adminDeletionRequests.ts` — replace the legacy `deleteRequests` listener/client writes with one admin-only real-time query over USER documents and authenticated server actions.
- `components/admin/DeletionQueue.tsx` and `app/admin/requests/page.tsx` — show requester name, submission date, pending/processing/failed states, permanent-deletion confirmation, rejection, and retry for failed deletion.
- `lib/contexts/AdminContext.tsx`, `lib/utils/adminAudit.ts`, and `components/admin/AuditLogList.tsx` — subscribe to and render the latest 50 audit records as a read-only list after the admin route guard authorizes the viewer.
- `lib/utils/adminOverview.ts` and `app/admin/page.tsx` — keep user/cat/gender totals derived from real Firestore records and drive the pending-deletion KPI from the same live queue used by the request page and sidebar.
- Phase 5 tests under `app/api/admin/**`, `components/admin/**`, and `lib/utils/**` cover ordered deletion, partial-failure retention, retry safety, authorization, atomic rejection, queue states, server action routing, audit normalization/display, and KPI aggregation.

### Changes to existing logic in Phase 5

- `app/api/admin/delete-user/route.ts` — the old two-step legacy flow deleted only `cats` and `catDetails`, then updated a `deleteRequests` document. D3a–D3e require one admin-approved operation that covers all nested entities, linked device data, Storage, USER, Auth, failure retention, and traceable success/failure audits.
- `lib/contexts/DeleteRequestContext.tsx` — owner submission and browser approve/reject writes were removed because Phase 4 owns submission and D3d/D4e require privileged decisions to run only on the server. Non-admins now start no deletion-queue query.
- `app/admin/requests/page.tsx` — `approved`, `rejected`, and `deleted` legacy request rows were replaced by active USER statuses. Approve now means permanent deletion after confirmation; failed rows remain visible with Retry, while Reject immediately returns a pending account to normal.
- `components/settings/AccountDeletionRow.tsx` — the failed-state copy no longer promises that all data is untouched, because D3b permits a failure after some ordered cleanup stages have completed; it tells the owner that an administrator can retry.
- `lib/contexts/AdminContext.tsx` and `app/admin/page.tsx` — add the approved Q7 audit list and make the pending KPI wait for its live request listener. Existing total-user, total-cat, gender, and cats-per-user widgets continue using real Firestore user/cat records.

### Deletion and retry behavior

Approval first captures the target identity for traceability and sets `deletionStatus: processing`. It recursively deletes all collections beneath `users/{uid}` so current and future CAT, SESSION, ANOMALY, HEALTHLOGENTRY, REPORT, notification, summary, and device-state nesting is covered. It also removes top-level `deviceConfigs` and `cameraDevices` owned by the UID, any legacy `deleteRequests`, the UID's predictive-health limiter, cascading Supabase backup/SMS data when that configured service is present, and all Firebase Storage objects under `users/{uid}/`. Only then does it delete USER and Firebase Auth and record `deletion_approved`.

If a stage fails, the endpoint retains/recreates a minimal USER request with `deletionStatus: failed`, the original request date and target identity, and a safe stage-specific error. It records the underlying failure in the admin-only audit log. Retrying repeats idempotent deletes and treats an already absent Auth user as success, so failures after USER or Auth deletion remain recoverable. The `NOTE(manuscript)` comment beside the success audit documents why target UID/email intentionally survive account deletion.

### Phase 5 manual checks

1. With a disposable owner, submit a request and confirm the administrator queue, sidebar badge, and Pending Deletions KPI update without refresh and show the owner's name and submission date.
2. Reject that request and confirm it disappears from the queue/KPI, Settings returns to the normal request action, the existing owner session stays active, and no CAT, SESSION, profile, device, report, or Storage data changed. Confirm one `deletion_rejected` audit entry.
3. Submit again, seed representative nested USER documents, an owned `deviceConfigs` document, optional camera record, and files below `users/{uid}/`, then approve. Confirm the USER tree, linked records, Storage prefix, backup row (when configured), and Auth account are gone; subsequent login fails; and `deletion_approved` retains actor and target identity.
4. In a local disposable project, force one deletion stage to fail (for example, use a deliberately unavailable test Storage bucket), confirm the queue clearly shows `failed`, restore the configuration, click Retry deletion, and confirm it completes without duplicate surviving data.
5. Confirm Recent audit activity shows at most the latest 50 entries in descending time order and exposes no editing controls.

### Phase 5 verification and remaining work

- `npm run check` passed: ESLint, 357 application tests, 4 camera-relay tests, TypeScript, and the 42-route production build. The build includes `/api/admin/deletion-request/reject` as a dynamic server route.
- The test run still emits the existing deliberate sensor-failure diagnostics and Node module-type warning for `lib/utils/sensorEndpointDiagnostics.ts`; no unrelated logging or package metadata was changed.
- Firestore rules were not deployed. Release the application changes first or together with the rules, then execute `docs/firestore-rules-manual-tests.md` and the device compatibility checks.
- Phase 6 remains: compile the final requirement-status table, consolidated handoff/deploy steps, commit message, and groupmate summary.

### Found, not fixed in Phase 5

- The Active Users KPI marks every freshly loaded Firestore user active because no persisted activity-status model exists. The Users page Suspend/Restore control also changes only local React state and does not disable Firebase Auth. These pre-existing placeholders were not changed because D2b only requires the pending-deletion KPI and no suspension requirement or data model was approved.
- `lib/data/data.ts` still contains unused legacy mock admin users/deletion requests. The live Admin Dashboard does not import those values; removing dead demo data is outside this update.
- Firebase Auth deletion prevents future sign-in and refresh, but a previously issued owner ID token may remain usable until it expires, analogous to the documented A10 claim window. The current owner rules do not maintain a permanent deletion tombstone, so an actively hostile still-open client could theoretically attempt to recreate owner-scoped Firestore or Storage data during that window. Adding a server-only deletion-lock/tombstone collection plus matching Firestore and Storage rules is a defense-hardening decision outside the approved data model; review it before claiming immediate token revocation in the manuscript.

## Admin access and account deletion update — Phase 4

Phase 4 replaces the owner's legacy `deleteRequests` document creation with an authenticated server transaction on the USER document. One transaction verifies that no request is active, sets `deletionStatus: pending` and `deletionRequestedAt`, and creates the `deletion_requested` audit entry. Settings listens to those USER fields, disables repeat submission, and explicitly tells the owner that normal app access continues during review. Requirements addressed: D1a, D1b, and D1c.

### Phase 4 files and responsibilities

- `app/api/account/deletion-request/route.ts` — owner-authenticated, revocation-checked transaction that atomically creates the pending status and audit entry; returns 409 for duplicate/active requests.
- `lib/server/ownerAuth.ts` — shared bearer-token verification for authenticated owner API routes.
- `lib/server/auditLog.ts` — exposes the same canonical audit-record builder used by both normal writes and compound Firestore transactions.
- `lib/utils/accountDeletion.ts` — client request helper plus safe USER deletion-state normalization.
- `components/settings/AccountDeletionRow.tsx` — renders loading, available, pending, processing, and failed states; pending uses a disabled `Request pending` button.
- `app/dashboard/settings/page.tsx` — subscribes to the signed-in owner's USER document and calls the server endpoint instead of the legacy `DeleteRequestContext.submitRequest` path.
- `app/api/account/deletion-request/route.test.cjs`, `lib/server/ownerAuth.test.cjs`, `lib/utils/accountDeletion.test.cjs`, and `components/settings/AccountDeletionRow.test.cjs` — cover authorization, transaction shape, duplicate rejection, audit traceability, client errors, status parsing, and pending UI behavior.

### Changes to existing logic in Phase 4

- `app/dashboard/settings/page.tsx` — account-deletion state now comes from `users/{uid}.deletionStatus` and `deletionRequestedAt`, as selected in Phase 0. The two-step warning/confirmation UI and optional reason remain; only persistence changed (D1a, D1b).
- `lib/server/auditLog.ts` — record construction was extracted without changing the stored audit shape so the USER update and `deletion_requested` entry can commit atomically. This prevents a pending request from existing without its required audit record (D1a).
- No authentication state, CAT, SESSION, notification, device, or profile field is modified when requesting deletion. The owner stays signed in and continues using the app while status is pending (D1c). Cancellation and owner notifications remain intentionally out of scope per the Phase 0 decisions.

### Phase 4 manual checks

1. Use a disposable owner whose USER document has missing/`none` deletion status. Submit from Settings and confirm the UI changes to disabled `Request pending` without signing out or losing access to cats, history, reports, or device data.
2. Confirm the USER document contains only the new `deletionStatus: pending` and server `deletionRequestedAt` fields in addition to its previous data.
3. Confirm exactly one `auditLogs` entry has action `deletion_requested`, matching actor/target UID and email, the selected reason, and a server timestamp.
4. Reload Settings and confirm the pending state persists. Repost to `/api/account/deletion-request` with the same owner's token and confirm HTTP 409 with no second audit entry.

### Phase 4 verification and remaining work

- Focused tests covered the server transaction, duplicate rejection, owner auth, client request, status normalization, and pending/available UI states.
- `npm run check` passed: ESLint, 338 application tests, 4 camera-relay tests, TypeScript, and the production build. The build includes `/api/account/deletion-request` as a dynamic server route.
- The test run still emits the existing Node module-type warning for `lib/utils/sensorEndpointDiagnostics.ts`; no package metadata was changed because it is outside this phase.
- Phase 5 replaced the remaining legacy admin queue, KPI, approve, and reject paths with the live USER queue and authenticated server actions.
- `DeleteRequestContext` no longer exposes the legacy owner submission helper or browser Firestore mutations; it now provides only the admin live queue and server-backed actions.

## Admin access and account deletion update — Phase 3

Phase 3 replaces the Firestore email/admin-document rule with `request.auth.token.admin == true`, applies owner isolation to the real nested user data layout, makes audit data read-only for admins and unwritable from browser clients, and constrains owner deletion status to one `none` to `pending` transition. The rules were not deployed. Requirements addressed in the rules file: A6, A7, A8, A10's documented Firestore token window, D1a, and D1b.

### Phase 3 files and responsibilities

- `firestore.rules` — custom-claim admin predicate; owner/admin read boundaries; owner-only nested writes; protected `auditLogs`, `admins`, and legacy admin data; constrained USER deletion transition; default deny.
- `app/api/device-config/[configToken]/route.ts` — reads device provisioning through the existing server Admin SDK instead of an anonymous Firebase browser client. This keeps the ESP32 endpoint stable while direct `deviceConfigs/{token}` reads become owner/admin-only.
- `app/api/device-config/[configToken]/route.test.cjs` — proves the provisioning endpoint works without public Firebase client configuration and keeps invalid or unknown tokens closed.
- `docs/firestore-rules-manual-tests.md` — reproducible browser-console checks for admin-only data, cross-account cat/session denial, USER transition constraints, and post-deploy device compatibility.

### Changes to existing logic in Phase 3

- `firestore.rules` — browser administrator authority now comes only from the boolean custom claim because A6 requires direct Firestore enforcement consistent with A2. Browser administrators retain reads but cannot write owner records or audit logs; privileged mutations use server credentials.
- `firestore.rules` — all nested paths below `users/{uid}` now share one owner-write and owner/admin-read boundary. This covers current CAT, SESSION, health log, report, anomaly/future nested entity, settings, notification, and summary paths without changing their storage layout (A7, A8).
- `firestore.rules` — USER creation accepts only missing/`none` deletion status. Normal owner profile updates must preserve the deletion fields; the sole owner status transition is `none` to `pending` with `deletionRequestedAt == request.time`. Browser deletes are denied because permanent deletion belongs to the Phase 5 server workflow (D1a, D1b, D3d).
- `firestore.rules` — direct `deviceConfigs` access is limited to its owner or an administrator. Owners cannot transfer `ownerId`, and client administrators cannot write configurations (A7).
- `app/api/device-config/[configToken]/route.ts` — provisioning now requires the already-documented server service-account environment configuration. The hardware URL and returned payload are unchanged; the change is required so tightened DEVICE_CONFIG rules do not break setup.

### Device compatibility

The ESP32 reads configuration from `/api/device-config/{configToken}` and posts sensor/RFID data to `/api/sensors`. Sensor persistence uses the service-account Firestore REST client, and provisioning now uses the Admin SDK; both server identities bypass client Firestore rules. No firmware path or payload changed. Post-deploy hardware checks are listed in `docs/firestore-rules-manual-tests.md` and remain required.

### Phase 3 deploy warning

The Phase 4 owner request and Phase 5 administrator decision paths now match these rules. The rules were not deployed by the coding agent; deploy them only in the same coordinated release as the application changes and immediately perform the documented manual and device checks.

Deploy command for that later coordinated release:

```text
firebase deploy --only firestore:rules
```

### Phase 3 verification and remaining work

- Java and Firebase rule-emulator tooling are unavailable in this environment, matching the team's Phase 0 choice to use manual rule checks. Rule behavior therefore needs the documented manual verification after coordinated deployment.
- `npm run check` passed: ESLint, 327 application tests, 4 camera-relay tests, TypeScript, and the production build. The two new provisioning-route tests are included in that total.
- The test run still emits the existing Node module-type warning for `lib/utils/sensorEndpointDiagnostics.ts`; no package metadata was changed because it is outside this phase.
- Phase 4 replaced owner `deleteRequests` writes with the guarded USER status transaction and atomic server audit entry.
- Phase 5 replaced browser approve/reject writes with authenticated server routes. Coordinated application/rules deployment and manual verification remain.

### Found, not fixed in Phase 3

- `app/(auth)/signup/page.tsx` still uses one hardcoded email for redirect selection. The claim-based `AdminRoute` prevents that redirect from granting access, but the legacy redirect condition should be removed in a later authentication cleanup. It was not changed because Phase 3 is limited to Firestore rules and required device compatibility.

## Admin access and account deletion update — Phase 2

Phase 2 moves browser admin access to the Firebase `admin == true` custom claim. The Admin Dashboard stays behind a neutral loading gate until authentication and the claim resolve, and its `AdminProvider` remains inside that gate so admin listeners cannot start early. Real email/password and Google sign-ins call an authenticated server route to write `admin_login`; auth restoration, reloads, and token refreshes do not call it. Requirements addressed: A1, A2, A4, A5, A9, and the client-response portion of A10.

### Phase 2 files and responsibilities

- `lib/contexts/AuthContext.tsx` and `lib/utils/adminClaims.ts` — replace the email allowlist and `admins/{email}` lookup with the strict boolean custom claim. Profile and claim reads run together, and stale asynchronous results are ignored during rapid account changes.
- `components/AdminRoute.tsx` and `app/admin/layout.tsx` — keep a neutral screen until the claim is known, replace history on denial, and mount `AdminProvider` only after authorization.
- `app/(auth)/login/page.tsx` and `lib/utils/adminLoginAudit.ts` — call the audit route only from successful interactive sign-in handlers. The existing single login screen remains the owner and admin entry point (A1, A9).
- `app/api/admin/login/route.ts` — verifies the bearer token and custom claim through the Phase 1 helper, validates the sign-in method, and writes the traceable server audit entry (A9).
- `lib/utils/adminApi.ts` and `lib/contexts/DeleteRequestContext.tsx` — centralize bearer-token admin requests. A 401 or 403 forces an ID-token refresh and replaces the current page with `/dashboard`, even if refresh fails because the session was revoked (A10).
- `components/AdminAccessBoundary.test.cjs`, `lib/utils/adminClaims.test.cjs`, `lib/utils/adminApi.test.cjs`, `lib/utils/adminLoginAudit.test.cjs`, and `app/api/admin/login/route.test.cjs` — cover the guard/provider boundary, absence of owner-nav admin links, strict claim handling, stale authorization recovery, and real-sign-in audit behavior.

The existing `TopBar` and `BottomNav` had no Admin Dashboard destination, so A5 needed no navigation edit. `AdminSidebar` is rendered only inside the guarded admin layout.

### Changes to existing logic in Phase 2

- `lib/contexts/AuthContext.tsx` — administrator status no longer comes from a hardcoded email or Firestore admin document because A2 requires the custom claim as the only role source. The shared `loading` state is reset whenever auth changes because A4 requires a neutral gate while each new claim resolves.
- `components/AdminRoute.tsx` — denied redirects use `replace` instead of `push` so the protected URL is not left as a usable back-navigation entry (A4).
- `app/(auth)/login/page.tsx` — successful interactive sign-ins now await the admin audit call; no auth-listener or page-load audit was added because A9 excludes reloads and refreshes.
- `lib/contexts/DeleteRequestContext.tsx` — the existing admin deletion call now uses the shared browser admin request helper so 401/403 responses enforce A10 consistently.

### Phase 2 manual checks

1. Sign in as a regular owner, enter `/admin` directly, and confirm the neutral loading view is followed by `/dashboard` without dashboard content appearing.
2. Grant a test account with `npm run admin:grant -- admin@example.com`, sign out, then sign in through each supported login method. Confirm one `admin_login` document per interactive sign-in and no new entry after reloading `/admin`.
3. While the test administrator is signed in, revoke it with `npm run admin:revoke -- admin@example.com`, then trigger an admin API action. Confirm the response is rejected, token refresh is attempted, and the browser leaves the admin page.
4. Confirm neither owner navigation component displays an Admin Dashboard destination.

### Phase 2 verification and remaining work

- ESLint passed with no findings.
- The application test suite passed: 325 tests, including 15 Phase 2 access/audit tests.
- The Next.js production build and TypeScript checks passed; `/api/admin/login` is included as a dynamic server route.
- Phase 3 updated the repository rules and documented the token-refresh window; the rules remain undeployed until the matching Phase 4 and 5 application changes are live.
- Phases 4–5 must replace the legacy deletion-request flow, move approve/reject fully server-side, and add the requested read-only audit list.

## Admin access and account deletion update — Phase 1

Phase 1 adds the server-only foundation for Firebase custom-claim administrators. Admin API authorization now accepts a Firebase bearer token, verifies it with revocation checking enabled, and requires `admin == true`. A shared audit writer records server-timestamped actions, and a local service-account script grants or revokes the claim while preserving unrelated claims. Revocation also revokes refresh tokens. No Cloud Functions or paid Firebase features were added. Requirements addressed: A2, A3, A10, D3d, and D4e foundation; A9, D3e, and D4d audit foundation.

### Phase 1 files and responsibilities

- `lib/server/adminAuth.ts` — shared 401/403 authorization boundary for admin API routes.
- `lib/server/auditLog.ts` — server-only `auditLogs` writer using a Firebase server timestamp.
- `scripts/manage-admin.mjs` — local grant/revoke command using the Admin SDK; the service-account email is recorded as the script actor.
- `lib/configs/firebase-admin.ts` — now explicitly marked server-only.
- `app/api/admin/delete-user/route.ts` and `app/api/admin/update-password/route.ts` — replaced email/Firestore-admin authorization with the custom-claim helper because A2, A3, and A10 require one server authority source.
- `lib/contexts/DeleteRequestContext.tsx` — the existing delete endpoint call now sends the ID token in the Authorization header because the shared helper accepts bearer authentication.
- `app/admin/add-admin/page.tsx`, `components/admin/ServerManagedAdminAccess.tsx`, and `components/layout/AdminSidebar.tsx` — remove browser grant/revoke and account-creation controls, replacing them with server-command guidance because A3 permits only server-side claim management.
- `package.json` — adds the grant/revoke commands and includes script tests in the normal test suite.
- `app/api/admin/adminRoutes.test.cjs`, `lib/server/adminAuth.test.cjs`, `lib/server/auditLog.test.cjs`, and `scripts/manage-admin.test.mjs` — authorization, revocation, audit, and script regression coverage.

### Phase 1 setup

Required local and Vercel environment variable name:

- `FIREBASE_SERVICE_ACCOUNT_BASE64`

Keep the base64-encoded service-account JSON in the untracked `.env` file locally and in Vercel project environment variables for deployed API routes. Never prefix it with `NEXT_PUBLIC_`, commit its value, or place a service-account key file in the repository.

Grant the first administrator locally:

```text
npm run admin:grant -- admin@example.com
```

Revoke an administrator locally:

```text
npm run admin:revoke -- admin@example.com
```

The affected user must refresh their Firebase ID token to observe a grant. Revocation removes the claim and revokes refresh tokens; admin API routes reject revoked tokens immediately because they enable the revocation check.

### Phase 1 verification and remaining work

- Focused tests cover missing/invalid tokens (401), valid non-admin tokens (403), `admin == true`, revocation checking, audit shape, preserving unrelated claims, and refresh-token revocation.
- Phase 2 completed the frontend custom-claim role source, real-sign-in auditing, and admin-route 401/403 handling; see the section above.
- Phase 3 replaced the repository rule predicate, added `auditLogs` rules, and documented the up-to-one-hour Firestore-rule token window. Deployment remains pending.
- Phases 4–5 replaced the legacy `deleteRequests` workflow and use the audit helper for all deletion decisions.
- Do not deploy changed Firestore rules before the matching application phase is live; doing so can block existing clients and device provisioning.

### Found, not fixed in Phase 1

- Existing account deletion remains incomplete and is reserved for Phases 4–5.
- The Phase 3 Firestore rules are not deployed and require the coordinated manual checks after Phases 4 and 5.
- Phase 5 added the read-only latest-50 audit list to the guarded Admin Dashboard.
- npm reports 11 existing high-severity dependency audit findings after an exact lockfile install; no dependency versions were changed in this phase.

## Completed QA repairs

- `components/charts/MetricTrendChart.tsx` is the single trend renderer for Home (`components/dashboard/CatBehaviorTrends.tsx`), My Cats (`app/dashboard/cats/[catId]/CatDetailClient.tsx`), and Reports (`app/dashboard/reports/page.tsx`). Metric titles, units, ticks, reference lines, normal bands, and Y-axis domains now come from `lib/presentation/trendCharts.ts`.
- Owner photos now upload through `lib/utils/ownerPhoto.ts` before their download URL is mirrored to Firebase Auth and Firestore. Replaced Storage objects are cleaned up after successful synchronization.
- Cat edits await `lib/utils/catPhoto.ts`, report real progress, time out with actionable copy, and omit the photo field unless a replacement succeeds or removal is explicit.
- Session History restores filters, separates loading/account-empty/filter-empty states, keeps state chips from overlapping, and lists unattributed sessions after named-cat sessions.
- The header logo links to `/dashboard` with pointer, keyboard-focus, and accessible-label affordances.

## TODO(phase0)

- `lib/configs/behaviorThresholds.ts:16` — Research/device team: decide whether the incomplete-session floor remains duration-only or also uses gas-sensor change as a completion signal.
- `lib/configs/behaviorThresholds.ts:20` — Research team: approve the normal duration range and keep the application, firmware, and manuscript values aligned.
- `lib/configs/behaviorThresholds.ts:25` — Research team: approve the visit-count presentation thresholds and keep their existing comparison operators aligned.
- `lib/configs/behaviorThresholds.ts:30` — Research team: approve the baseline-building period and update the manuscript at the same time.
- `lib/configs/behaviorThresholds.ts:34` — Research team: approve the visit, duration, air-quality, and odor deviation tolerances used in baseline explanations.

## FIXME(defense)

- `firestore.rules:39` — Firebase/project owners: Firestore reads may retain a revoked admin claim until the cached ID token refreshes, normally within one hour; server admin routes reject revoked tokens immediately.
- `storage.rules:10` — Firebase/project owners: review and deploy the owner-only Storage rules before testing owner or cat-photo uploads in the hosted app.
- `app/dashboard/page.tsx:338` — Device integration team: supply persisted sensor deltas for live-only session cards instead of temporary zero values before the Aug 26–28 defense.
- `app/dashboard/live/page.tsx:45` — Device/video team: connect real recording history before enabling the currently feature-flagged mock recording browser.
