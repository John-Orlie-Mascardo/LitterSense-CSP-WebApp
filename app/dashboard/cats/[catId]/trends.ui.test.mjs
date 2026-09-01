/**
 * trends.ui.test.mjs
 *
 * Source contracts for fully labeled cat-detail trend charts.
 *
 * DONE: three metric charts, units, baseline-building copy, owner-facing naming
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

test("cat detail renders three fully labeled seven-day trend charts", () => {
  assert.equal(source.match(/<MetricTrendChart/g)?.length, 3);
  assert.match(source, /Visit Frequency \(7 days\)/);
  assert.match(source, /Average Duration \(7 days\)/);
  assert.match(source, /Air quality change \(7 days\)/);
  assert.match(source, /Visits per day/);
  assert.match(source, /Duration \(minutes\)/);
  assert.match(source, /Change from baseline \(%\)/);
});

test("existing points are passed through presentation helpers without replacement data", () => {
  assert.match(source, /getMetricTrendPoints\(trendData, "visits"\)/);
  assert.match(source, /getMetricTrendPoints\(trendData, "duration"\)/);
  assert.match(source, /getMetricTrendPoints\(trendData, "airQuality"\)/);
  assert.match(source, /baselineMessage=\{references \? undefined : "building"\}/);
});
