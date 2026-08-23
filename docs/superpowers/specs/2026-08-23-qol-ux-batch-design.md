<!--
  2026-08-23-qol-ux-batch-design.md

  Validated presentation-layer design for the LitterSense QoL and UX batch.

  DONE: scope, data-flow boundaries, UX behavior, testing strategy, and handoff rules
  PLACEHOLDER: none

  NEXT: the frontend implementer should create the test-first implementation plan,
  then deliver each approved task without changing classification behavior.
-->

# LitterSense QoL and UX Batch Design

## Goal

Improve state accuracy, navigation feedback, authentication feedback, password-reset styling, Home reference material, and Reports usability while preserving the existing LitterSense detection and classification behavior.

## Non-negotiable boundaries

- This is a presentation-layer change. Existing sensor interpretation, detection rules, classification comparisons, persisted session statuses, and threshold values must retain their current behavior.
- Existing component-level threshold literals may be moved to a central configuration file only as a mechanical extraction: values and comparisons must remain unchanged.
- No dummy cats, sessions, sensor readings, baselines, or classifications will be created.
- Reports will use registered cats and sessions already supplied by the existing context and Firebase data flow.
- User-facing copy will describe recorded litter-box behavior. It will not diagnose an animal or label one healthy or unhealthy.
- The existing dark theme and teal/green accent remain the visual foundation.
- The unrelated working-tree modification to `next.config.ts` will not be changed.

## Architecture

### Shared behavior-state presentation model

A presentation-only module will define the six display states, their exact labels, owner-facing descriptions, color roles, and severity order. It will also expose pure helpers for:

- determining whether a cat has recorded evidence;
- determining whether its stored baseline values indicate an established baseline;
- deriving a cat badge state without changing its stored classification;
- mapping existing session-status values to one of the six display states;
- selecting the most severe existing state for a report group; and
- formatting absent metric values as `No data yet` while preserving meaningful zeroes.

`Normal` is available only when recorded evidence and an established baseline both exist and no existing anomaly classification is present. Existing absolute abnormal classifications remain visible. A cat with no evidence, or ordinary sessions without an established baseline, displays `Insufficient data`.

Shared badge and legend components will consume this model. Home, cat selectors, selected-cat summaries, cat cards, Reports, and printable output will therefore use the same names, descriptions, and colors.

### Threshold configuration

Component-level threshold values will be moved to a central configuration module and imported by the affected components. This extraction will preserve each existing number, operator, and comparison direction. Detection utilities and persisted classifications will not be redesigned.

The configuration and affected behavior sites will carry `TODO(phase0)` comments for the incomplete-session floor, normal-duration range, baseline period, and deviation tolerance because those decisions remain under group review.

## Home and cat presentation

The Home greeting and subtitle will be removed. The existing date styling stays in place. On desktop, the state legend sits below the date in the left reference column. On mobile, it appears below the primary cat/status content so it does not displace the selector and main metrics.

The behavior chart will keep both measures in one chart but use independent axes: duration in minutes on the left and visit count on the right. Each axis will show an explicit title and unit.

Cat chips, the selected-cat badge, Home stat cards, cat listing cards, and relevant summary badges will receive derived presentation states. When there is no measurement, visit count, duration, and last-visit values will display `No data yet`. A genuine zero after prior data exists remains zero.

## Navigation loading

Reusable skeleton primitives will provide stable-height placeholders for the app shell and common content shapes. Route-specific loading files will compose them for:

- Home: date/reference area, chart block, stat-card grid, and recent-activity rows;
- My Cats: cat-card grid;
- Reports: report controls, accordion/table rows, and chart blocks;
- Live: video/content blocks;
- Settings: grouped settings rows; and
- Notifications: notification rows.

Existing predictable in-page loading states on Home and My Cats will use the same skeletons. Spinners remain limited to actions whose final shape is not predictable, such as authentication and report generation.

## Authentication and password reset

Login submission will return immediately when a request is already in flight. Both email and Google actions will be disabled during authentication. The email submit button will retain its inline progress indicator.

Authentication failures will appear beside the form with privacy-safe messages such as `Incorrect email or password.` Raw Firebase messages will not be shown. After success, a brief toast will appear, then the existing role-appropriate Home route will open once authentication and profile state have resolved.

Forgot Password will reuse the login page's dark surfaces, teal branding, input treatment, button treatment, and responsive split-panel structure. Its reset-email behavior remains unchanged.

## Reports session accordions

The generated report will show the shared six-state legend above a single-open accordion list.

For every registered cat in the report scope, the collapsed group displays its avatar, name, session count for the selected period, most severe existing display state, and a chevron. A zero-session cat is a factual empty group and displays `Insufficient data`; it is not mock data.

The expanded group contains only that cat's existing session records and the columns Date, Time, Duration, Air quality change, Odor level change, and State. The Cat and Visits columns are removed from the visible table. Raw `MQ-135` and `MQ-136` identifiers remain in CSV headers only.

Existing sessions whose `catId` has no matching registered cat are grouped last under `Unattributed sessions`, with the explanation `Litter box use was detected but no collar tag was read.` If there are no such records, no fabricated unattributed records are created.

Accordion state is local React state, so it survives ordinary re-renders during the mounted page session. Print styles reveal all real group rows regardless of the screen expansion state, ensuring the PDF contains the complete existing log.

## Report naming and copy

The generated preview, printable/PDF header, page heading, and route metadata will use `Litter Box Activity Report` or the plural `Litter Box Activity Reports` where grammatically required. Existing PDF filenames remain unchanged.

Existing visible `Health Report` and `Healthier cats` wording in directly affected authentication, metadata, and report surfaces will be replaced with behavior/activity wording so the app does not imply a diagnosis or label an animal healthy.

## Handoff documentation

Every created or substantially modified source file will begin with a structured header describing its purpose, completed work, remaining placeholders, and next owner. The exact tags `TODO(phase0)`, `NOTE(manuscript)`, and `FIXME(defense)` will be used for their requested purposes.

`HANDOFF.md` will index every open `TODO(phase0)` and `FIXME(defense)` with its source path and unresolved decision. It will not claim intentional skeleton states are product placeholders.

## Testing and verification

Implementation will proceed test-first. Pure helper tests will cover:

- no sessions produces `Insufficient data`;
- sessions without a baseline do not produce `Normal`;
- established baseline plus no anomaly produces `Normal`;
- meaningful zeroes are preserved while missing values show `No data yet`;
- existing session statuses map to the correct six display states;
- unattributed records remain separate and last; and
- group severity uses only existing states.

Source/UI regression tests will cover the shared legend, explicit chart axes, route skeleton shapes, login request guards and feedback, Forgot Password theme parity, report accordions, owner-facing sensor labels, raw CSV identifiers, print expansion, and report title.

Final verification will run focused tests, the complete test set, lint, production build, and repository searches for forbidden copy, divergent state descriptions, unindexed handoff tags, component-level threshold literals, and modified files lacking header blocks.
