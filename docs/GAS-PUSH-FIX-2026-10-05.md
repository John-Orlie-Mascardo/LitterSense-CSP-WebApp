# Gas push alerts and dismissible cat backup notice

## Findings

- NH3 and H2S use the same authenticated board ingestion path. A website window is not required to queue or send either gas push.
- The database's `ingest_sensor_sms` function shared the one-hour SMS cooldown with push. The dashboard's separate gas inbox bridge can add another inbox item during that hour without a new push. This explains the repeated-test mismatch.
- The latest live NH3 alert at 14:54:16 UTC and H2S alert at 15:01:01 UTC on October 5 have `push_status=sent`. That means at least one registered device's request was accepted, not that a notification appeared on the phone. Historical records do not retain individual device outcomes.
- Both gas preferences are enabled, quiet hours are disabled, and two devices are registered on the affected account.
- User reports that the latest NH3 notice appeared only inside the app. Closed-phone delivery is not considered verified by the database's aggregate status.

## Prepared changes

1. `docs/gas-push-cooldown.sql`: replace only the existing ingestion function. On a new Clear -> Detected transition, each gas can queue push again after one minute. SMS remains limited to once per gas per hour. Continuous detection and repeated uploads do not repeat alerts. Preferences still apply; existing workers still enforce quiet hours. No historical alerts are requeued, and no tables or existing visit records change.
2. `lib/utils/pushDelivery.ts`: request `Urgency: high` for gas alerts only, retain the existing one-hour TTL, and save each gas target's provider acceptance/error under `context.pushDelivery`. Device tokens are represented by SHA-256 hashes, never raw tokens. A PC acceptance no longer hides a phone rejection in diagnostic evidence. Partial batches are not blindly resent.
3. `lib/contexts/CatContext.tsx`: add an accessible X to the backup status banner in the existing dark style. Dismissal lasts while the same account and warning remain mounted. A refresh, changed warning, or resolved/new incident can show it again. Backup polling, collection and recovery continue.
4. `lib/utils/pushDelivery.test.mjs` and `public/sw.test.mjs`: verify both gas payloads, preferences, no-phone operation, partial device outcomes, urgency, and system notification display with zero app windows.

The dashboard inbox bridge remains unchanged. An inbox item is not a delivery receipt, and a very rapid new detection can still be inside the one-minute push limit.

## Checks completed

- `npm run check`: lint passed; 282 app tests and 4 camera relay tests passed; TypeScript and production build passed.
- Isolated PostgreSQL test using PGlite: reproduced the old function's suppression after 61 seconds, then verified the prepared migration's separate one-minute push and one-hour SMS limits for both gases. Verified continuous detection, retry deduplication, both preference switches, unknown devices and duplicate uploads. No production data or notifications were created by these tests.
- Runnable database regression check saved at `C:/Users/Admin/Documents/Codex/2026-10-01/yes-i-can-handle-it-your/work/gas-sql-test/check.mjs`.
- Source review: no firmware, camera, RFID behavior, SMS templates, settings or cat history synchronization changes.

Urgency asks the push service to prioritize an important message; it cannot guarantee a display or bypass browser/phone restrictions. Reference: https://web.dev/articles/push-notifications-web-push-protocol#urgency

## Publishing and physical verification remaining

Apply the reviewed `gas-push-cooldown.sql` migration to the existing Supabase project and deploy the tested app after publishing approval. No new Supabase project is needed.

After deployment:

1. Refresh LitterSense on the PC and phone. Check that gas alert switches and push registration are enabled on the phone.
2. Tap the backup banner X; confirm it stays hidden during ordinary sensor updates. This hides the banner, not the underlying backup status.
3. Leave the box powered and online. Close LitterSense and its tabs on the phone; do not force-stop Chrome. Keep internet and Chrome notifications enabled.
4. Use the existing safe gas test procedure for one sensor at a time. Do not generate hazardous ammonia or hydrogen sulfide for testing.
5. Start from a confirmed Clear reading. Wait at least 65 seconds since that gas's previous queued alert, then cause a new Detected reading. A continuous Detected state is not a new event.
6. Check for the correctly named NH3/H2S system notification without opening Chrome. Repeat independently for the other sensor.
7. Inspect each new outbox record's `context.pushDelivery.devices`: identify phone and PC by their registered token hashes and distinguish provider acceptance from actual display. Confirm no additional SMS within the hour.
8. If both phone requests were accepted but the phone displays them only after Chrome opens, investigate phone background restrictions using that evidence. Do not call closed-app delivery fixed until the physical test passes.
