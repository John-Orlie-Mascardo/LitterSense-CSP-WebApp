<!--
  HANDOFF.md

  Project-wide index of unresolved phase-zero decisions and defense blockers.

  DONE: open TODO(phase0)/FIXME(defense) items and completed QA architecture are indexed
  PLACEHOLDER: none; intentional skeleton loading states are not product placeholders

  NEXT: the listed owner for each item updates both the source comment and this index.
-->

# LitterSense Handoff

This index covers the open decisions and demo blockers found in source code as of September 5, 2026. When an item is resolved, remove its source tag and its matching entry here in the same change.

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

- `storage.rules:10` — Firebase/project owners: review and deploy the owner-only Storage rules before testing owner or cat-photo uploads in the hosted app.
- `app/dashboard/page.tsx:338` — Device integration team: supply persisted sensor deltas for live-only session cards instead of temporary zero values before the Aug 26–28 defense.
- `app/dashboard/live/page.tsx:45` — Device/video team: connect real recording history before enabling the currently feature-flagged mock recording browser.
- `lib/contexts/AuthContext.tsx:23` — Backend/security team: replace the admin email allowlist with verified Firebase custom claims before the Aug 26–28 defense.
