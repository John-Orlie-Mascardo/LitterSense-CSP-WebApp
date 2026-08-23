<!--
  HANDOFF.md

  Project-wide index of unresolved phase-zero decisions and defense blockers.

  DONE: every open TODO(phase0) and FIXME(defense) is indexed by source path
  PLACEHOLDER: none; intentional skeleton loading states are not product placeholders

  NEXT: the listed owner for each item updates both the source comment and this index.
-->

# LitterSense Handoff

This index covers the open decisions and demo blockers found in source code as of August 23, 2026. When an item is resolved, remove its source tag and its matching entry here in the same change.

## TODO(phase0)

- `lib/configs/behaviorThresholds.ts:16` — Research/device team: decide whether the incomplete-session floor remains duration-only or also uses gas-sensor change as a completion signal.
- `lib/configs/behaviorThresholds.ts:20` — Research team: approve the normal duration range and keep the application, firmware, and manuscript values aligned.
- `lib/configs/behaviorThresholds.ts:25` — Research team: approve the visit-count presentation thresholds and keep their existing comparison operators aligned.
- `lib/configs/behaviorThresholds.ts:30` — Research team: approve the baseline-building period and update the manuscript at the same time.
- `lib/configs/behaviorThresholds.ts:34` — Research team: approve the visit, duration, air-quality, and odor deviation tolerances used in baseline explanations.

## FIXME(defense)

- `app/dashboard/page.tsx:337` — Device integration team: supply persisted sensor deltas for live-only session cards instead of temporary zero values before the Aug 26–28 defense.
- `app/dashboard/live/page.tsx:45` — Device/video team: connect real recording history before enabling the currently feature-flagged mock recording browser.
- `lib/contexts/AuthContext.tsx:23` — Backend/security team: replace the admin email allowlist with verified Firebase custom claims before the Aug 26–28 defense.
