/**
 * page.ui.test.mjs
 *
 * Source contracts for the responsive, paginated Session History experience.
 *
 * DONE: persistence, calendar, non-overlapping chips, grouping, loading and empty states
 * PLACEHOLDER: none
 *
 * NEXT: add browser interaction coverage when Firebase emulator data is available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(currentDir, "page.tsx"), "utf8");
const filterSource = readFileSync(
  join(currentDir, "..", "..", "..", "components", "history", "HistoryFilters.tsx"),
  "utf8",
);
const calendarSource = readFileSync(
  join(currentDir, "..", "..", "..", "components", "history", "HistoryDateRangeCalendar.tsx"),
  "utf8",
);

test("history persists filters and incrementally loads grouped session cards", () => {
  assert.match(pageSource, /useSessionHistory/);
  assert.match(pageSource, /sessionStorage\.setItem\(HISTORY_STORAGE_KEY/);
  assert.match(pageSource, /IntersectionObserver/);
  assert.match(pageSource, /Load more/);
  assert.match(pageSource, /sticky top-16/);
  assert.match(pageSource, /displayState=\{getHistorySessionState/);
});

test("history renders required first-run, filtered-empty, skeleton, and retry states", () => {
  assert.match(pageSource, /Waiting for RFID visits/);
  assert.match(pageSource, /No sessions recorded between/);
  assert.match(pageSource, /Reset filters/);
  assert.match(pageSource, /SessionHistorySkeleton/);
  assert.match(pageSource, />Retry</);
});

test("history preserves loading cat filters and renders Unattributed after named sessions", () => {
  assert.match(pageSource, /isLoading: catsLoading/);
  assert.match(pageSource, /partitionHistorySessions/);
  assert.match(pageSource, /Unattributed sessions/);
  assert.match(pageSource, /getDefaultHistoryFilters/);
});

test("desktop filters stay visible and mobile filters use a bottom sheet", () => {
  assert.match(filterSource, /sticky top-20/);
  assert.match(filterSource, /<BottomSheet/);
  assert.match(filterSource, /Last 7 days/);
  assert.match(filterSource, /Last 30 days/);
  assert.match(filterSource, /This month/);
  assert.match(filterSource, /Custom/);
  assert.match(filterSource, /BEHAVIOR_STATES\.map/);
  assert.match(filterSource, /Unattributed/);
  assert.match(filterSource, /Newest first/);
  assert.match(filterSource, /Oldest first/);
  assert.match(filterSource, /auto-rows-fr/);
  assert.match(filterSource, /min-h-14/);
  assert.match(filterSource, /> Reset/);
});

test("the calendar is full width with touch buttons and highlighted ranges", () => {
  assert.match(calendarSource, /w-full/);
  assert.match(calendarSource, /min-h-11/);
  assert.match(calendarSource, /range-endpoint/);
  assert.match(calendarSource, /range-middle/);
  assert.match(calendarSource, /aria-pressed/);
});
