/**
 * behaviorThresholds.ts
 *
 * Central source for threshold values already used by presentation components.
 *
 * DONE: existing component literals collected without changing values or comparisons
 * PLACEHOLDER: none; the copied values remain subject to the listed group decisions
 *
 * NEXT: the phase-zero research owners should update these values only after the
 * group approves matching firmware, manuscript, and presentation changes.
 */

// NOTE(manuscript): Any approved change to a value below requires the matching
// visible label or explanation in the capstone paper to change in the same work.

// TODO(phase0): The incomplete-session floor is under group review, including
// whether gas-sensor change should help determine completion.
export const INCOMPLETE_SESSION_FLOOR_SECS = 30;

// TODO(phase0): The normal duration range is under group review. These values
// preserve the dashboard's existing comparisons and are not new rules.
export const DASHBOARD_DURATION_WARNING_MINS = 3;
export const DASHBOARD_DURATION_UPPER_MINS = 5;

// TODO(phase0): The visit-count presentation thresholds are under group review.
// These values preserve the dashboard's existing comparisons and are not new rules.
export const DASHBOARD_VISIT_WARNING_COUNT = 6;
export const DASHBOARD_VISIT_UPPER_COUNT = 8;

// TODO(phase0): The baseline period is under group review and must match the
// firmware/data pipeline before the UI text changes.
export const BASELINE_PERIOD_DAYS = 7;

// TODO(phase0): Baseline deviation tolerances are under group review. These
// values are mechanically extracted from the existing profile presentation.
export const BASELINE_VISIT_DEVIATION_COUNT = 1;
export const BASELINE_DURATION_DEVIATION_SECS = 30;
export const BASELINE_AIR_QUALITY_DEVIATION_PERCENT = 7;
export const BASELINE_ODOR_DEVIATION_PERCENT = 5;
