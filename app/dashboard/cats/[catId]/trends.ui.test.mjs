/**
 * trends.ui.test.mjs
 *
 * Source contracts for the cat page: labeled trend charts, the baseline card,
 * and the History tab's short-visit toggle.
 *
 * DONE: two metric charts (gas is clear/detected only, so no percentage chart),
 * units, computed-baseline bands, baseline card copy, short-visit toggle
 * PLACEHOLDER: series fixtures remain owned by the existing mock-data pipeline
 *
 * NEXT: add browser-level axis positioning checks when visual regression is available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "CatDetailClient.tsx"), "utf8");

test("cat detail renders two fully labeled seven-day trend charts and no air-quality percentage chart", () => {
  assert.equal(source.match(/<MetricTrendChart/g)?.length, 2);
  assert.match(source, /Visit Frequency \(7 days\)/);
  assert.match(source, /Average Duration \(7 days\)/);
  assert.match(source, /metric="visits"/);
  assert.match(source, /metric="duration"/);
  assert.doesNotMatch(source, /Air quality change/);
  assert.doesNotMatch(source, /metric="airQuality"/);
  assert.doesNotMatch(source, /"airQuality"/);
});

test("existing points are passed through presentation helpers without replacement data", () => {
  assert.match(source, /getMetricTrendPoints\(trendData, "visits"\)/);
  assert.match(source, /getMetricTrendPoints\(trendData, "duration"\)/);
  assert.match(source, /baselineMessage=\{references \? undefined : "building"\}/);
});

test("chart bands come from the computed baseline, not the saved averages", () => {
  assert.match(source, /buildCatTrendReferences\(computedBaseline\)/);
  assert.doesNotMatch(source, /buildCatTrendReferences\(details\?\.baseline\)/);
});

test("the baseline card shows medians with upper limits, the shared update text, and X of 7 days", () => {
  assert.match(source, /\{BASELINE_UPDATE_TEXT\}/);
  assert.match(source, /Median visits\/day/);
  assert.match(source, /Median duration/);
  assert.match(source, /Upper limit: \{formatBandValue\(baseline\.visitBand\[1\]\)\}/);
  assert.match(source, /Upper limit: \{formatDuration\(Math\.round\(baseline\.durationBand\[1\]\)\)\}/);
  assert.match(source, /formatBaselineProgress\(baseline\?\.daysUsed\)/);
  assert.doesNotMatch(source, /recalculated every/);
  assert.doesNotMatch(source, /rolling average/);
});

test("the History tab hides short visits by default behind a toggle", () => {
  assert.match(source, /useState\(false\);\s*const \{ visible: lengthFilteredSessions/);
  assert.match(source, /filterShortVisits\(sessions, showShortVisits\)/);
  assert.match(source, /\{SHOW_SHORT_VISITS_LABEL\}/);
  assert.match(source, /type="checkbox"/);
});

test("History uses shared Abnormal-or-Watch results and does not show gas percentages", () => {
  assert.match(source, /getIndexedSessionBehavior\(session, behaviorIndex\)\.state/);
  assert.match(source, /state === "abnormal" \|\| state === "watch"/);
  assert.doesNotMatch(source, /session\.mq135Delta\}%/);
  assert.doesNotMatch(source, /getDeltaLabel\(session\.mq135Delta\)/);
});
