<!--
  2026-09-01-photo-charts-session-history-design.md

  Approved design for cat-photo storage, labeled trends, and paginated session history.

  DONE: scope, architecture, data flow, owner-facing behavior, failure handling,
  verification, and handoff requirements
  PLACEHOLDER: none

  NEXT: after group review, create and execute a test-first implementation plan
  without changing detection or classification behavior.
-->

# LitterSense Photo, Trend Chart, and Session History Design

## Goal

Fix cat profile photos so ordinary phone images do not exceed Firestore field limits, bring My Cats and Reports trend charts to the labeled Home-chart standard, and replace Home's expanding Recent Activity list with a focused, filterable, incrementally loaded Session History page.

## Non-negotiable boundaries

- Sensor interpretation, session computation, anomaly detection, classification rules, comparison operators, and persisted session states will not change.
- Components will import existing values from `lib/configs/behaviorThresholds.ts`; they will not introduce threshold literals.
- User-facing text will describe recorded litter-box behavior and will not diagnose a cat or label one healthy or unhealthy.
- Existing dark surfaces, teal/green accents, and the shared six-state presentation model remain authoritative.
- No Firebase rules or application build will be deployed from this work. No live Firebase records will be migrated or rewritten.
- No changes will be committed or pushed. The working tree will remain available for group review.
- Existing graph series are mock data and must remain byte-for-byte behaviorally unchanged. This batch may change chart presentation and add reference metadata, but it will not edit mock values, mock generation, `buildTrendData`, or `buildAggregateTrendData`.
- The four optional findings attached to the request are outside this batch unless one blocks an approved deliverable. The required `Air quality change` naming correction remains in scope.

## Selected approach

The implementation will use focused shared services and components rather than rewriting all session access across the app:

1. A photo-storage utility will own validation, upload progress, download-URL retrieval, and removal for cat avatars.
2. A reusable metric trend chart will own axes, units, tooltips, baseline and normal-range presentation, and no-data behavior.
3. A history-specific Firestore hook will own date-bounded pagination and filter persistence. The existing unbounded session listener in `CatContext` will be suspended while `/dashboard/history` is active so that route does not fetch the full session collection in parallel.

This keeps existing Home, Reports, cat detail, demo-data, and realtime behavior unchanged outside the new history route while meeting the new route's incremental-loading requirement.

## Cat photo storage

### Storage path and persisted value

Firebase Storage is the selected path because the project already initializes Storage and has a configured storage bucket. The cropped image will be uploaded as JPEG to:

`users/{uid}/cats/{catId}/photo.jpg`

The existing Firestore cat document will continue using its `avatar` field, but that field will contain only the resulting download URL. Uploading to the deterministic object path replaces the former object instead of creating versioned orphan files. Explicit photo removal and cat removal will delete the object when it exists. A missing object during cleanup is a successful no-op.

No automatic base64 fallback will run after a Storage failure. Silent fallback could recreate the original field-size defect and conceal a Firebase configuration problem. The form will instead retain the selected preview and show a plain-language retry message.

### Selection, crop, and upload flow

The add-cat and edit-cat flows retain their current square crop, pan, and zoom experience. File selection will accept and validate JPEG, PNG, WebP, and GIF MIME types up to 10 MB before `FileReader` creates a local preview. Invalid, oversized, or unreadable files will not enter form state.

On save:

1. The current crop is rendered as a JPEG blob.
2. The blob is uploaded with Firebase's resumable upload API.
3. Progress is reported in the existing save/loading area as a percentage when a photo is pending.
4. After upload succeeds, its download URL is written to the existing cat document with the other approved profile changes.
5. If the Firestore write fails after a new-cat upload, the newly uploaded object is cleaned up so it does not become orphaned.

For an edit with an unchanged existing URL, no image upload occurs. For photo removal, the Firestore avatar is cleared and the expected Storage object is deleted. Existing base64 or non-LitterSense avatar URLs can be replaced safely; cleanup will target only the owner-scoped path, never an arbitrary URL.

The placeholder initial remains visible whenever `avatar` is absent.

### Storage rules and local Firebase configuration

A new `storage.rules` file will allow authenticated users to read, create, update, and delete only objects below their own `users/{uid}` directory. Cat-photo creates and updates will additionally require an image content type and a 10 MB upload-size ceiling. `firebase.json` will reference the rules file.

These local rule changes are deployment inputs only. The group must deploy them separately after reviewing the project and Firebase environment.

## Shared trend chart treatment

### Reusable chart contract

A new `MetricTrendChart` component will replace `SparklineChart` at the My Cats and Reports call sites. The old component will be removed if no consumer remains. The new chart has explicit props for:

- metric name;
- series data and day/date labels;
- series color;
- Y-axis title and unit formatter;
- X-axis title;
- optional baseline value and label;
- optional normal-range lower and upper bounds; and
- empty and baseline-building state.

Every rendered chart will show visible X and Y tick values, `Day` or `Date` on the X axis, and one of these owner-facing Y-axis titles:

- `Visits per day`;
- `Duration (minutes)`; or
- `Change from baseline (%)`.

Duration data remains stored in seconds and is converted to minutes only for display. The line colors remain aligned with the existing teal visit/air-quality series and orange duration series.

### Baselines and normal ranges

An established single-cat baseline produces a dashed horizontal line labeled `Baseline`. The normal band is calculated around that same baseline from the existing centralized deviation constants:

- visits: baseline plus or minus `BASELINE_VISIT_DEVIATION_COUNT`, clamped at zero;
- duration: baseline plus or minus `BASELINE_DURATION_DEVIATION_SECS`, converted to minutes and clamped at zero; and
- air-quality change: zero through baseline plus `BASELINE_AIR_QUALITY_DEVIATION_PERCENT`, matching the existing profile's upper-bound presentation.

The band is labeled `Normal range`. These calculations are display-only and do not classify sessions.

For an `All cats` report, only cats with established baselines contribute. The aggregate visit baseline is the sum of their daily visit baselines. Duration and air-quality baselines use visit-weighted averages so cats with greater expected daily activity contribute proportionally. Aggregate range endpoints are built by applying the existing centralized tolerance to each contributing cat and then combining those per-cat endpoints with the same sum or visit-weighted method. The report stores the derived baseline-and-range snapshot with its generated data so an archived report remains stable if cat profiles later change.

The snapshot fields are optional for backward compatibility. A saved report created before this feature keeps its trend data but shows `Baseline unavailable for this saved report` rather than inventing a reference from current profile values.

### Data and empty states

- With zero sessions, the chart area shows an owner-facing empty message and renders no axes.
- With sessions but no established baseline, the series and axes remain visible, the reference line and baseline-derived range are omitted, and `Baseline still building` appears near the chart title.
- Chart titles in both locations include `(7 days)`. Reports will use `Visit Frequency (7 days)`, `Average Duration (7 days)`, and `Air quality change (7 days)`. Report charts continue using their existing trailing-seven-day trend preparation even when the surrounding report covers a longer period.
- The tooltip will be a custom horizontal layout containing the metric, formatted value with unit, and date/day on one readable line. It will not inherit a narrow stacked-character layout.

Reports, My Cats, Home labels, and exported column headings will consistently use `Air quality change`. Raw `mq135Delta` and `mq136Delta` property names remain internal data-contract identifiers only; owner-facing CSV headings will use `Air quality change (%)` and `Odor level change (%)`.

## Session History route

### Route and navigation

The new page will live at `/dashboard/history`, with matching route metadata and a route loading skeleton. Home's `View All` becomes a link to this route; Recent Activity remains a short preview and no longer expands in place.

The initial filter is `Last 30 days`, `All cats`, all six states, and newest first. The header reports the number of currently displayed matching sessions and the applied inclusive date range. As additional batches load, the displayed count updates without claiming an unknown server-side total.

### Date range and filters

Desktop uses a sticky filter panel near the top of the page. Mobile uses a compact `Filters` button that opens the existing responsive bottom-sheet pattern.

The filter contents include:

- quick presets for Last 7 days, Last 30 days, This month, and Custom;
- a month calendar with previous/next navigation;
- a two-tap inclusive start/end selection with endpoints emphasized and the days between highlighted;
- a plain-language selected-range summary and explicit Apply button;
- cat choices for All cats, each registered cat, and Unattributed;
- multi-select controls backed by the shared six-state definitions; and
- newest-first and oldest-first sort choices.

The calendar fills the mobile sheet width and uses touch-sized day controls. Selecting an end date earlier than the start begins a new range instead of creating an inverted range.

Applied filter state is serialized to URL query parameters and mirrored in session storage. URL state wins when present, enabling shareable/reload-safe views; session storage restores the last applied history view when the route is reopened without parameters. Invalid or stale values fall back to the documented defaults.

### Firestore pagination and presentation filtering

The history hook queries the existing `users/{uid}/sessions` collection by the persisted local `date` field, bounded inclusively by the selected start and end date. Results load in server batches and use document cursors for pagination. The initial target is 20 displayed records.

Date and sort direction are applied by Firestore. Cat and state filters are applied to each normalized batch because state is a presentation derivation that depends on existing status, anomaly fields, attribution, and per-cat baseline availability. When a batch contains too few matches, the hook continues scanning one batch at a time until it fills the target page or reaches the end. It never issues an unbounded range read.

The existing session normalization will be extracted into a pure shared utility so `CatContext` and the paginated hook interpret Firestore records identically. This is a mechanical data-plumbing move; the normalized field meanings and classification helpers remain unchanged.

While the history pathname is active, `CatContext` skips its current full `sessions` collection subscription and clears that subscription's raw session state. All other context listeners remain active so registered cats, avatars, and baseline availability are present. Leaving History restores the existing session subscription behavior for current pages.

### Session list

Sessions are grouped beneath full date labels such as `August 28, 2026`. Date headers use sticky positioning within the scrolling document so the active day remains visible. Groups and cards sort according to the selected direction.

The existing `SessionTimelineCard` remains the visual base. It will accept an explicit display state and unattributed presentation data so each card includes:

- cat avatar or existing placeholder;
- cat name, or `Unattributed` when no registered cat matches;
- session type badge;
- six-state badge using the shared color definitions;
- recorded date;
- enter and out times; and
- formatted duration.

Existing `DAILY_SUMMARY` and in-progress records retain their current owner-facing presentation. The new page will not recalculate their duration or classification.

An intersection observer requests the next batch near the end of the list. A visible `Load more` control remains as an accessible fallback. Skeleton cards appear during every batch request and are replaced without clearing already loaded results.

### Empty and error states

- If the user has no sessions at all, reuse Home's first-run RFID guidance.
- If sessions exist but none match the applied date range and filters, show `No sessions recorded between [start] and [end].` and offer `Reset date range`.
- If an incremental query fails, keep already loaded cards visible and show a retry action with plain-language copy. Raw Firebase messages stay in developer logging only.

Distinguishing “no sessions at all” from “none in this range” uses a bounded existence query for one session, not a full collection read.

## File and responsibility boundaries

Expected new or substantially modified areas are:

- Firebase photo utility and its pure validation helpers;
- `storage.rules` and `firebase.json`;
- add-cat and edit-cat flows;
- the shared metric trend chart and chart-data presentation helpers;
- Reports data snapshot and trend rendering;
- cat-detail trend rendering;
- session normalization and history query/filter helpers;
- History page, calendar/filter UI, loading skeleton, and route metadata;
- Home Recent Activity navigation;
- shared session card state presentation; and
- `HANDOFF.md`.

Each new or substantially modified file will begin with a structured header stating purpose, finished work, placeholders, and next ownership. Open decisions use only the established `TODO(phase0)`, `NOTE(manuscript)`, and `FIXME(defense)` forms. `HANDOFF.md` will index every new open TODO or defense blocker and the group decision needed to resolve it.

## Testing strategy

Implementation will proceed test-first where behavior can be isolated.

Pure unit tests will cover:

- accepted and rejected image MIME types;
- conversion of cropped image output to an uploadable blob;
- owner-scoped photo path construction and safe cleanup decisions;
- baseline and normal-range chart calculations, including aggregate weighting;
- duration unit conversion and tooltip formatting;
- URL/session-storage filter parsing and invalid-value defaults;
- inclusive date filtering;
- cat, unattributed, and multi-state filtering;
- newest/oldest ordering and date grouping; and
- pagination accumulation when early server batches contain few matches.

Source/UI regression tests will cover:

- Storage URLs replacing Firestore base64 avatar writes;
- upload loading/progress and owner-facing error copy;
- all six charts having axis titles, units, ticks, reference/range support, and baseline-building states;
- Reports' `Air quality change (7 days)` naming and readable tooltip;
- Home `View All` linking to `/dashboard/history`;
- desktop sticky filters and mobile bottom sheet;
- range calendar selection and highlighted endpoints;
- sticky date headings, state badges, sort control, skeletons, and load-more fallback;
- zero-session and filtered-empty copy; and
- required header and handoff comments.

Final verification will run focused tests, the full test suite, ESLint, and the production build. Repository searches will confirm that no modified component hardcodes threshold values, no owner-facing chart/export label still says `Gas Quality`, all requested chart axes expose a title and unit, every substantially modified file has its header, every open handoff tag is indexed, and git contains no new commit.

## Handoff and deployment notes

The implementation response will state that Firebase Storage was selected because the project already configures a storage bucket. It will identify the local Storage rules as requiring separate group deployment before uploads work in the deployed app.

If the deployed Firebase project rejects Storage because the project plan or bucket is unavailable, that is a deployment decision rather than an automatic runtime fallback. The group can then approve the requested 256-by-256, approximately 0.7-quality base64 fallback as a separate configuration-specific change.
