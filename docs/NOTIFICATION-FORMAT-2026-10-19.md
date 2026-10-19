# Notification formatting — task 1

## Report and scope

The October 19 retest showed that gas notifications now arrive away from Home, but the bell, saved alerts, system push and foreground toast use different titles/messages. This task changes gas notification presentation only.

The remaining reported tasks are queued separately, in the user's order:

2. RFID Entry/Exit preference briefly switches off/on after navigation.
3. RFID entry/exit alerts are inconsistent away from Home.
4. A completed visit appears beside an ongoing visit that may be a duplicate or stale current session. Compare event identity and current-state timing before deleting or merging anything.
5. Gas remains Awaiting readings for more than three minutes after internet recovery. A connected presence stream does not establish receipt of fresh telemetry.

No firmware, Settings preference, RFID session, sensor polling, SQL migration or live record is changed by task 1.

## Cause

- Bell/history gas rows used stored SQL text: live rows had no date in the body, while saved rows had the original detection date.
- Push delivery used a saved context body for history, but fell back to the SMS template for live gas events. That template added another LitterSense prefix, different advice and only a clock time.
- The service worker passed push text unchanged to system display and foreground toast, carrying the discrepancy to both surfaces.

## Patch

`gasNotificationText` in the existing `lib/presentation/ownerText.ts` now supplies both decoded website gas rows and gas push delivery. The legacy notification listener also uses the shared record decoder.

Both gases use the same format:

> Urine detected
>
> Odor detected at Oct 19, 2026, 3:35 PM. Check the litter box and ventilation.

Stool alerts use the title Stool detected. Dates use the application's existing UTC+08:00 / Asia/Manila convention, without seconds. Saved alerts use their occurrence time, never their later replay/upload receipt. Invalid or missing occurrence time is displayed as Detection time unavailable rather than inventing a date.

Formatting preserves stored input, exact notification IDs, event IDs, timestamps, read state, navigation targets, push tags, preferences, quiet hours and delivery decisions. Existing records are formatted on read; no historic record is rewritten and no old alert is resent. SMS templates are unchanged.

## Verification

- Four integration regressions failed against the previous formatting. An additional missing-history-time regression also failed before its correction.
- Fifteen focused tests pass: live and saved alerts for both gases, imported timestamp markers and nanoseconds, unknown time, legacy notifications, push delivery, the real service worker's system display/foreground forwarding, and existing delivery rules.
- Full `npm run check` passed with exit 0: ESLint, 627 application tests, 6 relay tests, TypeScript and production Next.js build. The existing non-failing `MODULE_TYPELESS_PACKAGE_JSON` notice remains.
- `git diff --check` passed. Git reported local LF/CRLF normalization notices for the existing test/decoder files.
- The patch is local, uncommitted and not deployed. No real push or hardware event was sent by these tests.

## Acceptance after deployment

1. Refresh the deployed website and inspect existing saved gas notifications: dates must remain present and wording must follow the shared format.
2. Trigger one new gas episode while on Settings. Compare the bell entry with phone/system push and foreground toast: title, text and event time must agree.
3. Keep recovery and duplicate-count checks from the established test procedure; this presentation patch must not create another notification or send an old alert.

Actual deployed browser and physical push appearance remain pending until the new website release is Ready and tested. Continue with task 2 only after task 1 acceptance.
