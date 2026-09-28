/**
 * useSessionHistory.ui.test.mjs
 *
 * Source contracts for bounded, cursor-based Firestore Session History reads.
 *
 * DONE: stable filter keys, inclusive query, deterministic cursor paging, safe errors
 * PLACEHOLDER: none
 *
 * NEXT: add Firebase emulator pagination tests when the project provisions CI emulators.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "useSessionHistory.ts"), "utf8");
const contextSource = readFileSync(
  join(currentDir, "..", "contexts", "CatContext.tsx"),
  "utf8",
);

test("history uses inclusive date bounds, deterministic ordering, cursors, and limits", () => {
  assert.match(source, /serializeHistoryFilters/);
  assert.match(source, /where\("date", ">=", stableFilters\.startDate\)/);
  assert.match(source, /where\("date", "<=", stableFilters\.endDate\)/);
  assert.match(source, /orderBy\("date", stableFilters\.sort\)/);
  assert.match(source, /orderBy\(documentId\(\), stableFilters\.sort\)/);
  assert.match(source, /startAfter\(nextCursor\)/);
  assert.match(source, /limit\(HISTORY_BATCH_SIZE\)/);
  assert.match(source, /filterAndSortHistorySessions/);
});

test("history keeps raw errors in logs and exposes retry-safe owner copy", () => {
  assert.match(source, /console\.error\("Failed to load session history:"/);
  assert.match(source, /We couldn't load session history\. Please try again\./);
  assert.match(source, /requestGenerationRef/);
  assert.match(source, /new Map/);
});

test("the global full-session listener is suspended only on the History route", () => {
  assert.match(contextSource, /usePathname/);
  assert.match(contextSource, /pathname === "\/dashboard\/history"/);
  assert.match(contextSource, /if \(isHistoryRoute\)/);
  assert.match(contextSource, /queueMicrotask\(\(\) => setSessions\(\[\]\)\)/);
  assert.match(contextSource, /else \{\s*unsubSessions = onSnapshot/);
});
