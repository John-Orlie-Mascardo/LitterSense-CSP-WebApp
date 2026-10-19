# Hardware test follow-up — October 19, 2026

## Scope

Website fixes for the six reported acceptance failures. Firmware, camera code, device wiring, production data and SQL migrations are unchanged. These source changes have not been committed, pushed or deployed during this investigation.

## Reproduced defects and fixes

1. **Gas presence could make an old Clear reading look current.** A relay heartbeat overwrote the gas telemetry receipt/state without supplying gas values. A 121-second-old Clear snapshot became Normal again. The hook now keeps connectivity separate from reading freshness. Connected boards with stale readings show Syncing / Awaiting readings until a fresh snapshot arrives. Reconnection requests one immediate read; repeated heartbeats and hidden tabs do not add reads. The existing five-second fallback and 120-second gas freshness limit are unchanged.
2. **A retained RFID completion skipped current state on duplicate retry.** Once a completed visit was already saved, a retry returned its exact acknowledgement without reconciling the separately captured current entry. Duplicate retries now refresh current state without recounting visits. Out-of-order requests cannot overwrite a newer snapshot, and a snapshot failure cannot withhold acknowledgement of durable visit history.
3. **Saved gas timestamps were removed during presentation.** The stored history/outbox retained occurrence time, but `ownerText` replaced the dated message with undated wording. Formatting now preserves the recorded date/time in both website and push messages. No historic rows are rewritten and no old push is re-sent.
4. **Push Settings showed a false Off while checking registration on every mount.** Only successfully verified registration is retained for the same browser/account session. An unverified device shows Checking rather than Off. Pending checks, permission changes, account changes and failed removals after navigation cannot overwrite newer intent. Failed removal restores its own prior preference even when Settings has unmounted.
5. **Settings had an extra inner divider.** Removed the inner top border from the independently rounded push card; the label can shrink/wrap and the switch retains its width.

All new behavioral regressions were observed failing before their fixes. Independent review found two races (late RFID snapshots and failed push removal after unmount); both received failing regressions and corrections.

## Production evidence (read-only)

All times below are UTC+08:00 on October 19. Evidence was read in the existing Supabase project and Vercel request logs. No device credentials, tokens or owner identifiers were exported.

- At 3:06 PM, the last live gas snapshot was received at **2:41:16.485 PM**, with both raw readings clear (`1`).
- The last saved gas history upload was at **2:43:19.487 PM**, recorded at **2:42:51 PM**. No later gas history or alert was found around the user's approximate 2:50 PM failed test.
- The last saved gas alert described detection at **2:42:29 PM**. It was queued at **2:43:12.195 PM** and accepted by the push provider at **2:43:15.167 PM**. Provider acceptance alone does not prove phone display.
- The filtered Vercel POST `/api/sensors` timeline showed the last gas heartbeat at **2:41:16 PM**; later visible ingestion requests were RFID. The 13 requests visible in that 30-minute window returned 200. Browser GETs continued returning 200 while showing the stored snapshot.
- A normal 15-second RFID visit retained start **2:42:36.775 PM** and end **2:42:51.775 PM**, but its POST arrived at **2:52:51.514 PM** and its row was stored at **2:52:52.775 PM**. That Vercel request finished in **2.9 seconds**. This establishes a recorded-time/receipt-time gap, not a ten-minute API execution. Device clock accuracy and the earlier transport/queue stages need a physical trace.
- The canonical current RFID snapshot was last received at **2:57:30.102 PM**. The separate legacy RFID mirror is not the primary current-state source and must not be used to infer current RFID delivery.
- The user confirmed the boards remained powered and no Serial Monitor was available.

The gas navigation failure is therefore **not proven fixed** by the UI corrections. Missing accepted uploads require a fresh request/board trace. An independent presence Online badge does not prove that live gas telemetry or retained RFID events reached ingestion.

## Verification

- Final `npm run check`: exit 0; ESLint, **622 app tests**, **6 relay tests**, TypeScript and production Next.js build passed.
- The first aggregate attempt passed its tests but the build hit Windows EPERM creating a `.next` directory. Re-running with repository filesystem access completed successfully.
- Existing non-failing `MODULE_TYPELESS_PACKAGE_JSON` diagnostic remains. Expected negative-path fixture logs are not production failures.
- `git diff --check` passed. Git reported local LF/CRLF normalization notices for test files.
- A static preview rendered the actual Settings/Toggle components with compiled application CSS and controlled registration state. Its local server was unreachable from the browser, so this is not a visual phone-width pass. The temporary server was stopped; visual acceptance remains pending after deployment.
- New website code and physical phone/device acceptance remain separate from the successful build.

## Focused acceptance after website deployment

1. Navigate Home → Settings → Notifications → Settings. A verified push switch must stay On; an initially unverified registration may show Checking. Confirm the extra line is gone at phone width.
2. With boards powered, verify that a new gas POST actually arrives, then run one Clear → Detected → Clear episode away from Home. Check current reading, one bell entry, one phone push and the event's recorded time. A stale connection must show Awaiting readings rather than false Clear.
3. Retry an offline completed RFID visit while a new entry is active. Check one saved completion, exact acknowledgement, unchanged visit total on retry and current active state preserved.
4. Repeat the closed-app gas push and short powered internet-outage replay tests. These are not established by local simulations or provider receipts.

If uploads are still absent, collect the gas upload errors and RFID queue/acknowledgement logs before changing firmware. Do not clear retained queues or erase device storage to make a test appear clean.
