/**
 * SessionTimelineCard.ui.test.mjs
 *
 * UI contracts for recorded-session timeline presentation.
 *
 * DONE: recorded date, central threshold, optional state badge, Unattributed display
 * PLACEHOLDER: none
 *
 * NEXT: extend only when the visible timeline contract changes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "SessionTimelineCard.tsx"), "utf8");

test("recent activity session cards show the recorded date", () => {
  assert.match(source, /formatActivityDate/);
  assert.match(source, /const activityDate = formatActivityDate/);
  assert.match(source, /Recorded/);
});

test("incomplete-session presentation imports the central reviewed threshold", () => {
  assert.match(source, /INCOMPLETE_SESSION_FLOOR_SECS/);
  assert.doesNotMatch(source, /durationSecs\s*<\s*30/);
});

test("history can add a shared six-state badge and Unattributed presentation", () => {
  assert.match(source, /readonly displayState\?: BehaviorStateId/);
  assert.match(source, /<BehaviorStateBadge state=\{displayState\} compact/);
  assert.match(source, /Unattributed/);
  assert.match(source, /Detected Session/);
  assert.match(source, /readonly cat: Cat \| null/);
});
