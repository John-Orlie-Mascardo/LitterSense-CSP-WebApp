# Gas telemetry recovery after reconnect — task 5

## Report and verified defect

After internet was restored, the reported dashboard kept showing Syncing for several minutes. Relay connectivity proves that the board has a connection; it does not prove that a fresh sensor upload reached the API.

Source inspection found a separate, reproducible browser recovery defect. `pollSensors` set its in-flight guard before awaiting `user.getIdToken()`, but the existing 10-second request deadline started only after that token resolved. An unresolved token left the guard occupied indefinitely. Reconnect, Realtime and navigation refreshes could not start another sensor read.

The installed Firebase library bounds part of its token network work, but its response-body and persistence waits do not establish a deadline for this dashboard operation. This confirms a possible blocked polling path, not the cause of the earlier physical board outage. The earlier production capture also had a gap in accepted gas uploads; this patch cannot manufacture missing readings.

## Patch

- Apply the existing 10-second budget across token acquisition and the sensor request.
- Release a token wait when the operation expires or its account/provider is cleaned up, allowing the existing retry loop to recover.
- Prevent a late token from starting an expired or previous-account request.
- Preserve the visible five-second fallback, hidden-tab pause, failure backoff, immediate reconnect refresh, gas freshness checks and account isolation.

No additional polling, firmware, database schema, production records or push-delivery changes. Stale readings still show Awaiting readings rather than a guessed Clear or Detected value.

## Verification

- Before implementation, regressions reproduced a permanently loading state after token expiry and a late sensor request from the previous account.
- Both regressions pass after the fix. A recovered fresh detection replaces the loading/error state, and the abandoned token cannot initiate another read.
- All 36 focused sensor polling, RFID projection, gas normalization and air-quality tests pass.
- Full `npm run check` passed with exit 0: ESLint, 645 application tests, 6 relay tests, TypeScript and the production Next.js build. The existing non-failing `MODULE_TYPELESS_PACKAGE_JSON` notice remains.
- Read-only review found no further actionable defects in the timeout/cleanup change. `git diff --check` passed.
- Tasks 4 and 5 have six local changed files in total; commit/push and deployment remain pending. No live API load test, hardware event or production record mutation was performed.

## Acceptance after deployment

1. With fresh gas uploads arriving, verify that Clear and Detected follow the accepted readings.
2. Disconnect and restore the browser's internet connection. After authentication and a fresh API response recover, the cards must leave Syncing without a page reload.
3. Reconnect the board's internet separately. If Syncing persists, compare the latest accepted gas upload time with the test time. Board connectivity alone must not make an old reading current.
4. Verify a new gas alert on Settings and Notifications, then with the webapp closed. Real device push delivery and the installed firmware's reconnect behavior remain physical acceptance checks.

The RFID freshness fix is documented separately. Deployment and physical acceptance remain pending; the Vercel CPU investigation remains deferred at the user's request.
