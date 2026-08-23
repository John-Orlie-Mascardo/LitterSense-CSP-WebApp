<!--
  2026-08-23-qol-ux-batch.md

  Test-first implementation plan for the approved LitterSense UX batch.

  DONE: file boundaries, interfaces, test cases, execution order, verification commands
  PLACEHOLDER: none

  NEXT: Codex executes inline; the project owner reviews and commits all changes.
-->

# LitterSense QoL and UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the eight approved UX improvements without fabricating data or changing detection and classification behavior.

**Architecture:** A pure presentation model will translate existing cat, baseline, and session data into six consistent display states. Small shared React components will render badges, legends, and skeletons, while report grouping remains a pure tested transform consumed by the Reports page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Recharts, Firebase Auth/Firestore, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-qol-ux-batch-design.md`

## Global Constraints

- Do not change sensor interpretation, detection rules, classification comparisons, or persisted session statuses.
- Do not fabricate cats, sessions, readings, baselines, or classifications.
- Preserve every existing threshold value and comparison; component literals may only be mechanically extracted to central configuration.
- Never label a cat healthy or unhealthy, diagnose illness, or claim disease prediction.
- Home, Reports, and printable output must consume one shared six-state definition.
- PDF filenames remain unchanged.
- Every created or substantially modified file gets the requested header block.
- Use only `TODO(phase0)`, `NOTE(manuscript)`, and `FIXME(defense)` for new handoff tags.
- Do not edit the user's existing `next.config.ts` change.
- Do not commit or push; the project owner owns Source Control operations.

---

### Task 1: Shared behavior-state presentation model

**Files:**
- Create: `lib/configs/behaviorThresholds.ts`
- Create: `lib/presentation/behaviorStates.ts`
- Create: `lib/presentation/behaviorStates.test.cjs`
- Create: `components/behavior/BehaviorStateBadge.tsx`
- Create: `components/behavior/BehaviorStateLegend.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `BehaviorStateId`, `BEHAVIOR_STATES`, `hasEstablishedBaseline(details)`, `hasRecordedCatData(input)`, `getCatDisplayState(input)`, `getSessionDisplayState(input)`, `getMostSevereState(states)`, and `formatMetricValue(value, hasData)`.
- Produces: `BehaviorStateBadge({ state, compact?, showDot? })` and `BehaviorStateLegend({ compact?, className? })`.

- [ ] **Step 1: Write failing pure behavior tests**

Test literal fixtures for zero sessions, sessions without baseline, established baseline with normal persisted status, established baseline with abnormal status, upstream `WATCH`, short sessions, unmatched cat IDs, severity, and missing-versus-real-zero formatting.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test lib/presentation/behaviorStates.test.cjs`

Expected: FAIL because `lib/presentation/behaviorStates.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure model and shared renderers**

Use these six IDs: `normal`, `watch`, `abnormal`, `insufficient`, `incomplete`, and `unattributed`. Define all labels/descriptions once in `BEHAVIOR_STATES`; components must not duplicate them. Add semantic CSS variables/utilities for yellow, blue, gray, and purple states in light, dark, and print contexts.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --test lib/presentation/behaviorStates.test.cjs`

Expected: all behavior-state tests pass.

### Task 2: Accurate Home and cat badges, values, legend, and chart axes

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/page.ui.test.mjs`
- Modify: `components/cats/CatChip.tsx`
- Modify: `components/dashboard/StatCard.tsx`
- Modify: `components/dashboard/CatBehaviorTrends.tsx`
- Modify: `app/dashboard/cats/page.tsx`
- Modify: `app/dashboard/cats/[catId]/CatDetailClient.tsx`
- Modify: `components/dashboard/SessionTimelineCard.tsx`

**Interfaces:**
- Consumes: Task 1 presentation helpers/components and threshold constants.
- Produces: consistent cat and metric display states across Home, My Cats, and cat detail summaries.

- [ ] **Step 1: Extend existing behavioral/source regression tests and confirm RED**

Add assertions that Home no longer accepts greeting/name props, uses the shared legend twice with desktop/mobile visibility, passes derived state into chips/badges/cards, renders `No data yet`, and gives the chart `Duration (minutes)` on the left and `Visit count` on the right.

Run: `node --test app/dashboard/page.ui.test.mjs components/dashboard/SessionTimelineCard.ui.test.mjs`

Expected: new assertions fail against current components.

- [ ] **Step 2: Mechanically extract component thresholds**

Replace component literals for the existing dashboard visit/duration checks, incomplete-session presentation floor, baseline period, and profile deviation displays with imports from `behaviorThresholds.ts`. Do not alter operators or numeric values.

- [ ] **Step 3: Implement derived badges and no-data values**

Build per-cat presentation inputs from existing `sessions`, stats, trend data, and `CatDetails`. Do not write derived states back to Firebase. Pass the display state explicitly to `CatChip`, `BehaviorStateBadge`, and `StatCard`.

- [ ] **Step 4: Replace Home greeting and correct chart units**

Keep the current date styling. Put the desktop legend below it and the mobile legend after primary cat metrics. Convert chart duration seconds to minutes for rendering only, place duration on the left axis and visit count on the right, and label both axes.

- [ ] **Step 5: Run focused tests and type-check through build later**

Run: `node --test app/dashboard/page.ui.test.mjs components/dashboard/SessionTimelineCard.ui.test.mjs lib/presentation/behaviorStates.test.cjs`

Expected: all focused tests pass.

### Task 3: Route and in-page skeleton loading states

**Files:**
- Create: `components/ui/AppLoadingSkeletons.tsx`
- Create: `app/dashboard/loading.tsx`
- Create: `app/dashboard/cats/loading.tsx`
- Create: `app/dashboard/reports/loading.tsx`
- Create: `app/dashboard/live/loading.tsx`
- Create: `app/dashboard/settings/loading.tsx`
- Create: `app/dashboard/notifications/loading.tsx`
- Create: `components/ui/AppLoadingSkeletons.ui.test.mjs`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/cats/page.tsx`

**Interfaces:**
- Produces: `DashboardContentSkeleton`, `CatGridSkeleton`, `ReportsContentSkeleton`, `LiveContentSkeleton`, `SettingsContentSkeleton`, `NotificationsContentSkeleton`, and `AppLoadingFrame`.

- [ ] **Step 1: Write a failing skeleton composition test**

Assert that each exported skeleton contains stable card, row, and chart/video block markers and that each route loading file renders its matching skeleton.

Run: `node --test components/ui/AppLoadingSkeletons.ui.test.mjs`

Expected: FAIL because the skeleton module and route files do not exist.

- [ ] **Step 2: Implement stable skeleton primitives and route loading files**

Use `animate-pulse`, semantic theme surfaces, fixed minimum heights, and `aria-label="Loading content"`. Use no spinner where the content shape is known.

- [ ] **Step 3: Replace Home and My Cats in-page spinners**

Render the matching content skeleton when `catsLoading` is true while keeping the existing TopBar and BottomNav.

- [ ] **Step 4: Run the focused skeleton test**

Run: `node --test components/ui/AppLoadingSkeletons.ui.test.mjs`

Expected: all skeleton tests pass.

### Task 4: Login feedback and diagnosis-safe authentication copy

**Files:**
- Create: `lib/presentation/loginFeedback.ts`
- Create: `lib/presentation/loginFeedback.test.cjs`
- Create: `app/(auth)/login/page.ui.test.mjs`
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/(auth)/signup/page.tsx`

**Interfaces:**
- Produces: `getEmailLoginErrorMessage(errorCode)` and `getGoogleLoginErrorMessage(errorCode)`.
- Consumes: existing `ToastContainer` and AuthContext readiness flags.

- [ ] **Step 1: Write failing privacy-safe error mapping tests**

Verify invalid credentials, unknown account, wrong password, invalid email, throttling, network failure, popup cancellation, and unknown failures return specific plain-language messages without exposing account existence or raw Firebase text.

Run: `node --test lib/presentation/loginFeedback.test.cjs`

Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement the mapping and confirm GREEN**

Run: `node --test lib/presentation/loginFeedback.test.cjs`

Expected: all mapping tests pass.

- [ ] **Step 3: Add request guards, success toast, and deferred redirect**

Guard both handlers with `if (isLoading) return`, disable both buttons during a request, leave loading active after a successful request, show one success toast, and redirect only after AuthContext and profile state resolve. On failure, set the mapped inline message and re-enable controls.

- [ ] **Step 4: Replace directly affected diagnosis-implying copy**

Use activity/routine wording in login features, signup branding, and root metadata. Do not change authentication behavior.

- [ ] **Step 5: Run login tests**

Run: `node --test lib/presentation/loginFeedback.test.cjs app/(auth)/login/page.ui.test.mjs`

Expected: helper and UI contract tests pass.

### Task 5: Forgot Password theme parity

**Files:**
- Create: `app/(auth)/forgot-password/page.ui.test.mjs`
- Modify: `app/(auth)/forgot-password/page.tsx`

**Interfaces:**
- Consumes: existing design tokens and login input/button class treatment.
- Produces: responsive dark/teal reset-password layout with unchanged Firebase reset behavior.

- [ ] **Step 1: Write a failing parity test**

Check for the branded teal panel, `bg-litter-card` form surface, `bg-litter-input` field, `bg-litter-primary` submit button, and privacy-safe inline error surface.

Run: `node --test app/(auth)/forgot-password/page.ui.test.mjs`

Expected: branded-panel assertion fails.

- [ ] **Step 2: Restyle the page without changing submit behavior**

Reuse the login page's split proportions and token classes. Keep `sendPasswordResetEmail` and check-email navigation unchanged.

- [ ] **Step 3: Run the focused parity test**

Run: `node --test app/(auth)/forgot-password/page.ui.test.mjs`

Expected: all assertions pass.

### Task 6: Pure per-cat report grouping

**Files:**
- Create: `lib/presentation/reportSessionGroups.ts`
- Create: `lib/presentation/reportSessionGroups.test.cjs`
- Modify: `lib/hooks/useReports.ts`

**Interfaces:**
- Produces: `ReportSessionGroup` and `buildReportSessionGroups({ sessions, cats, scopeCatId, getDetailsByCatId })`.
- Consumes: Task 1 session mapping and severity selection.

- [ ] **Step 1: Write failing group behavior tests**

Cover registered-cat order, zero-session groups, selected-cat scope, session counts including summary visits, group severity, and unmatched/empty `catId` records in one last unattributed group.

Run: `node --test lib/presentation/reportSessionGroups.test.cjs`

Expected: FAIL because the grouping helper does not exist.

- [ ] **Step 2: Implement the pure grouping transform**

Use only supplied cats and sessions. Never synthesize a session. A zero-session registered cat group contains an empty `sessions` array and `insufficient` display state.

- [ ] **Step 3: Include existing unmatched sessions in all-cats reports**

Destructure the existing context-level `sessions` array in `useReports`; for all-cats scope, filter it by the selected period instead of rebuilding solely through registered cat IDs. Preserve selected-cat behavior and every report calculation.

- [ ] **Step 4: Run the grouping and existing report-assessment tests**

Run: `node --test lib/presentation/reportSessionGroups.test.cjs lib/utils/reportAssessment.test.cjs`

Expected: all tests pass.

### Task 7: Reports accordions, legend, owner-facing labels, print behavior, and title

**Files:**
- Create: `components/reports/SessionAccordion.tsx`
- Modify: `app/dashboard/reports/page.tsx`
- Modify: `app/dashboard/reports/page.ui.test.mjs`
- Modify: `app/dashboard/reports/layout.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `buildReportSessionGroups`, `BehaviorStateLegend`, `BehaviorStateBadge`, current report sessions, and registered cats.
- Produces: single-open accessible accordions with complete print rendering.

- [ ] **Step 1: Write failing Reports UI contract tests**

Verify shared legend use, `SessionAccordion`, visible column labels, absence of visible raw MQ headers, continued raw MQ CSV headers, unattributed explanation, print reveal class, unchanged filename template, and the new report title.

Run: `node --test app/dashboard/reports/page.ui.test.mjs`

Expected: new assertions fail against the flat table.

- [ ] **Step 2: Implement the single-open accordion component**

Use a top-level `expandedGroupId: string | null`. Each header is a button with `aria-expanded` and `aria-controls`. Render real rows in a screen-collapsible container that receives a print-force-visible class. Show an owner-friendly empty message for zero-session named groups.

- [ ] **Step 3: Replace the flat report table and add the shared legend**

Build groups from current report data and registered cats. Put the legend above the accordion. Remove the Cat and Visits visible columns. Render Date, Time, Duration, Air quality change, Odor level change, and State.

- [ ] **Step 4: Rename report surfaces and metadata**

Use `Litter Box Activity Reports` for the page heading and route title, and `Litter Box Activity Report` for the preview/PDF header. Do not alter filename templates.

- [ ] **Step 5: Add print rules and run Reports tests**

Make every real accordion body visible in print and keep grouped tables readable across pages.

Run: `node --test app/dashboard/reports/page.ui.test.mjs lib/presentation/reportSessionGroups.test.cjs`

Expected: all report tests pass.

### Task 8: Handoff comments and full verification

**Files:**
- Create: `HANDOFF.md`
- Modify: every substantially changed file missing the approved header
- Modify: existing threshold/mock-data sites only to add required handoff comments; do not change behavior

**Interfaces:**
- Produces: one complete index of all `TODO(phase0)` and `FIXME(defense)` occurrences.

- [ ] **Step 1: Add exact structured tags**

Add threshold-decision notes at the component configuration and unchanged detection sites. Add manuscript notes beside shared state copy and other affected numeric/state strings. Add defense fixes only for real visible mock/placeholder behavior, including existing simulated report-generation delay or fabricated live-session deltas if still visible.

- [ ] **Step 2: Generate `HANDOFF.md` from the final tagged source locations**

List path, tag, and unresolved decision for every open phase-zero and defense item. Do not list loading skeletons as placeholders.

- [ ] **Step 3: Run focused and complete tests**

Run: `node --test lib/presentation/*.test.cjs app/dashboard/*.test.mjs app/dashboard/reports/*.test.mjs app/dashboard/cats/*.test.mjs components/**/*.test.mjs`

Then run: `node --test`

Expected: all discovered tests pass.

- [ ] **Step 4: Run static and production checks**

Run: `npm run lint`

Run: `npm run build`

Expected: both exit successfully with no new warnings caused by this batch.

- [ ] **Step 5: Run final invariant audits**

Search for forbidden `healthy`/`unhealthy` copy, old report titles, duplicated state descriptions, component threshold literals, missing file headers, unindexed handoff tags, and unintended changes to `next.config.ts`. Inspect `git diff` and `git status`; leave every implementation change uncommitted for the owner.
