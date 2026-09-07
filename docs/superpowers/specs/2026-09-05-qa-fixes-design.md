<!--
  2026-09-05-qa-fixes-design.md

  Approved design for the LitterSense QA repair batch.

  DONE: scope, architecture, data flow, failure behavior, testing, and handoff rules
  PLACEHOLDER: none

  NEXT: implement test-first without changing detection thresholds or classifications.
-->

# LitterSense QA Fixes Design

## Goal and boundaries

Repair the owner-photo, cat-photo, trend-chart, Session History, and header defects from the September 5 QA brief. Preserve the dark theme and teal/green accent. Do not change detection thresholds, classification comparisons, or Behavior State Key descriptions. Components must obtain threshold values from `lib/configs/behaviorThresholds.ts`. User-facing copy describes litter-box behavior and never diagnoses a cat. No commit, push, deployment, or live-data migration is part of this work.

The current branch also contains committed conflict markers in `lib/contexts/CatContext.tsx`. Resolving that merge regression is in scope because it removed history-route isolation, shared session normalization, and Storage cleanup required by this batch. The resolution must preserve the newer cat-session-log functionality from the other side of the merge.

## Selected approach

Use a targeted reconciliation of the existing implementation:

1. Add a focused owner-photo Storage boundary and strengthen the existing cat-photo boundary.
2. Extend the existing shared trend chart contract so Home, Cat Details, and Reports use one renderer and one metric-axis strategy.
3. Repair the existing History hook, filter state, and presentation helpers rather than replacing the route.
4. Resolve the `CatContext` merge by retaining both the earlier history/photo behavior and the newer session-log behavior.

Restoring an older commit and replaying newer work was rejected because it could discard teammate changes. Rewriting the subsystems was rejected as unnecessarily broad.

## Photo storage

### Owner profile

The Settings form keeps the selected `File` separately from its local preview. On save, a newly selected image is uploaded to an owner-scoped Firebase Storage path. Only the resulting HTTPS download URL is passed to `updateProfile`; a data URI must never reach Firebase Auth. The same URL is merged into `users/{uid}` in Firestore with the other profile fields.

The flow remembers the prior Auth and Firestore URLs. A failed upload stops the save and leaves both records unchanged. If one profile write fails after the other succeeds, the successful write receives a best-effort rollback and the new object is cleaned up. Once both writes succeed, a previous LitterSense-owned object at a different path is deleted. Storage rules will permit only authenticated owners to access profile objects.

### Cat profile

`uploadCatPhoto` will attach its resumable `state_changed` observer before returning, report an initial zero followed by computed percentages, and enforce a finite timeout. Timing out cancels the upload task and rejects with plain owner-facing retry guidance. Timers are cleared for success, Firebase failure, and cancellation.

Cat creation and editing await crop conversion, upload completion, and download-URL resolution before Firestore writes. Edit updates omit `avatar` when the photo is unchanged or an upload fails. They include `avatar` only after a successful upload or when the user explicitly removes the existing image. Upload failure leaves the prior Firestore URL untouched, restores the save button in `finally`, and displays an error. Cat deletion retains owner-scoped Storage cleanup.

## Shared trend charts

`MetricTrendChart` becomes the sole chart renderer for Home, Cat Details, and Reports. It accepts typed metric data plus optional secondary-series data for Home's duration/visit dual-axis view. Metric identity selects shared titles, units, tick formatters, colors, domains, and reference presentation; pages cannot redefine axis behavior independently.

Pure helpers in `lib/presentation/trendCharts.ts` compute domains. The duration domain starts at zero, includes the entire absolute normal-duration band derived from the central incomplete-session and duration-warning configuration, includes the personal baseline line/range when present, and adds deterministic headroom above the highest relevant value. Duration ticks consistently render as `N min`. The same strategy is used for the duration axis in single- and dual-axis charts. Visits and air-quality metrics receive their corresponding shared tick and domain strategies.

The normal-range band and baseline line are distinct references. Home receives the selected cat's baseline reference data and renders the same duration band, baseline label, units, and ticks as the other two pages. Existing trend values and generation logic remain unchanged.

## Session History

Applied filters remain URL-serializable and mirrored to session storage. Stored cat IDs are not rejected while the cat collection is still loading. Applying date, cat, state, or sort changes the serialized filter key, resets pagination, and refetches the bounded Firestore range. Date bounds and sort are server-applied; cat and derived six-state filters continue to be applied while scanning bounded pages until a display batch fills or the range ends.

The summary reports the number of currently displayed matching sessions and the active inclusive date range. Reset restores Last 30 days, all cats, all six states, and newest first. Persistence restores the last applied filter view after navigation.

The route renders three separate states:

- a skeleton while the bounded query is loading;
- `Waiting for RFID visits` only after an account-wide existence check proves there are no sessions, with guidance that filters become available after data arrives;
- a range-specific no-results message and full reset action when sessions exist but the applied filter matches none.

Within each date section, attributed sessions render first. Unattributed sessions render afterward beneath a visible `Unattributed` subgroup label. Every card keeps the standard six-state badge in its top metadata row immediately after the `RFID Session` or `Detected Session` badge.

The state chips use equal-height grid rows, enough minimum height for two lines, fixed-size checkbox/dot controls, and aligned label text at desktop and narrow mobile widths.

## Header and accessibility

The complete LitterSense logo becomes a Next.js link to `/dashboard`. It has a pointer cursor, visible keyboard focus ring, and `aria-label="Go to Home dashboard"` while retaining the existing motion treatment.

## Merge reconciliation and handoff

`CatContext.tsx` will remove all conflict markers and duplicate declarations, use shared session normalization, suspend only the global full-session listener on `/dashboard/history`, restore cat-photo cleanup, and preserve cat-session-log reads/writes. Any existing threshold literals encountered in modified component logic will be replaced mechanically with central config imports without changing values or comparison operators.

Every modified source file receives or updates its header block to state purpose, finished work, placeholders, and next ownership. `HANDOFF.md` removes resolved defect entries, retains the Storage-rules deployment blocker, records any genuinely new open decision, and documents the shared chart and its three consumers. Constrained decisions use `TODO(phase0)`, manuscript alignment uses `NOTE(manuscript)`, and defense blockers use `FIXME(defense)`.

## Verification

Implementation proceeds with regression tests before fixes where the behavior can be isolated. Tests will cover owner URL/path handling and cleanup, upload progress/timeout/cancellation, omission of unchanged cat avatars, metric domains and tick labels, shared chart use at all three locations, every History filter independently and in combination, persistence/default reset, all empty states, chip layout contracts, Unattributed grouping, badge placement, logo accessibility, and the reconciled context behavior.

Final verification will run focused tests, all repository tests, TypeScript, ESLint, and the production build. Repository searches will confirm no conflict markers, no data URI passed to `updateProfile`, no modified component threshold literal, unchanged Behavior State Key text, unchanged threshold/classification comparisons, and no new commit or push.
