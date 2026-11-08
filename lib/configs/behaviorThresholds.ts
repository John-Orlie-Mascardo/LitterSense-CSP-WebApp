/**
 * behaviorThresholds.ts
 *
 * Central source for the behavior-state and personal-baseline thresholds.
 */

// NOTE(manuscript): Any approved change to a value below requires the matching
// visible label or explanation in the capstone paper to change in the same work.

export const INCOMPLETE_SESSION_FLOOR_SECS = 15;
export const ABNORMAL_DURATION_SECS = 300;
export const DASHBOARD_VISIT_WARNING_COUNT = 6;
export const BASELINE_WINDOW_DAYS = 14;
export const BASELINE_MIN_DAYS = 7;
export const MAD_K = 2.5;
export const MAD_SCALE = 1.4826;
export const MIN_VISIT_BAND = 1;
export const MIN_DURATION_BAND_S = 30;
export const SHORT_VISIT_HIDE_S = 60;
