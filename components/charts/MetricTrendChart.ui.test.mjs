/**
 * MetricTrendChart.ui.test.mjs
 *
 * Source contracts for the shared fully labeled trend chart.
 *
 * DONE: axes, units, baseline/range labels, readable tooltip, empty states
 * PLACEHOLDER: none
 *
 * NEXT: add screenshot assertions when browser visual regression is available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "MetricTrendChart.tsx"), "utf8");

test("the chart renders titled axes, ticks, baseline, and normal range", () => {
  assert.match(source, /CartesianGrid/);
  assert.match(source, /XAxis/);
  assert.match(source, /YAxis/);
  assert.match(source, /value: "Day"/);
  assert.match(source, /yAxisTitle/);
  assert.match(source, /ReferenceArea/);
  assert.match(source, /ReferenceLine/);
  assert.match(source, /Normal range/);
  assert.match(source, /Baseline/);
});

test("the tooltip keeps metric, value, unit, and day on one readable line", () => {
  assert.match(source, /formatTrendTooltipLine/);
  assert.match(source, /whitespace-nowrap/);
});

test("zero data renders an empty message without chart axes", () => {
  const emptyIndex = source.indexOf("if (!hasData)");
  const chartIndex = source.indexOf("<ResponsiveContainer");
  assert.ok(emptyIndex >= 0);
  assert.ok(chartIndex > emptyIndex);
  assert.match(source, /Baseline still building/);
  assert.match(source, /Baseline unavailable for this saved report/);
});

test("metric identity owns domains and tick formatting for single and dual axes", () => {
  assert.match(source, /getTrendMetricConfig/);
  assert.match(source, /getTrendYAxisDomain/);
  assert.match(source, /formatTrendTick/);
  assert.match(source, /secondary/);
  assert.match(source, /orientation="right"/);
});
