# Reload startup performance

The dashboard previously waited for sequential account checks and every page of visit history before displaying cat profiles. Supabase startup reads also repeated role and migration checks. These code paths can compound network latency on a reload.

## Changes

- Resolve profile and admin status concurrently. Keep protected routes gated until the required checks finish, and discard results from previous accounts or superseded profile refreshes.
- Publish the authenticated cat catalog immediately. Load visit history in the background, retain existing visits during refreshes, and preserve newer confirmed profile edits.
- Show history loading states while gas readings and live RFID activity remain usable. Prevent report generation from an unfinished history download.
- Request bounded 100-row startup history batches. The History page retains its default 20-row pagination; authentication, cursor ownership, and reset behavior remain enforced.
- Avoid role lookups for own-record authorization and use one migration readiness gate per read. Integration fixtures confirm owner profile reads decrease from four database requests to two, own admin reads from three to two, and owner collection reads from five to three.
- Clear and hide previous-owner health/session logs and owner-tag the saved report cache during account changes. Late archive callbacks and delete completions cannot replace a newer account's reports.

Hardware, heartbeat intervals, sensor freshness thresholds, and push delivery are unchanged.

## Verification

Controlled asynchronous regressions cover early catalog publication, pending/failed history, preserved activity and catalog edits, aborts, account changes, parallel account checks, and rejected incomplete reports. Database fixtures cover authorization and 100-row cursor pagination. Final `npm.cmd run check` passed lint, all 435 application tests, all 4 camera relay tests, and the production build.

Actual reload duration depends on the device and network. These tests verify removal of the application waits; they do not establish a measured browser reload time on the user's devices.
