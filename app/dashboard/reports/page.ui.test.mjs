/**
 * page.ui.test.mjs
 *
 * Source-level contracts for report naming, exports, state reference, grouped logs, and trends.
 *
 * DONE: printable grouping, owner-facing CSV headers, activity naming, shared legend, labeled trends
 * PLACEHOLDER: none
 *
 * NEXT: add browser-level print assertions when automated browser coverage is available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const accordionSource = readFileSync(
  join(__dirname, "..", "..", "..", "components", "reports", "SessionAccordion.tsx"),
  "utf8",
);
const layoutSource = readFileSync(join(__dirname, "layout.tsx"), "utf8");

test('report generation waits for background history while the rest of the page remains usable', () => {
  assert.match(source, /disabled=\{isGenerating \|\| catsLoading \|\| historyLoading \|\| !hasCats\}/);
  assert.match(source, /historyLoading \? "Loading visit history\.\.\." : "Generate Report"/);
  assert.match(source, /if \(historyLoading\) \{/);
});

test("previous report download opens the printable report instead of showing a fake download toast", () => {
  assert.match(source, /const handleDownloadPastReport = \(id: string\) => \{/);
  assert.match(source, /viewReport\(id\)/);
  assert.match(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /Downloading \$\{report\.filename\}/);
});

test("report surfaces retain activity naming and the existing CSV filename", () => {
  assert.match(source, /Litter Box Activity Reports/);
  assert.match(source, /Litter Box Activity Report/);
  assert.match(layoutSource, /Litter Box Activity Reports/);
  assert.doesNotMatch(source, /Health Report/);
  assert.match(source, /LitterSense_\$\{currentReport\.catName/);
});

test("the shared six-state key appears immediately above the grouped session log", () => {
  const legendIndex = source.indexOf("<BehaviorStateLegend");
  const accordionIndex = source.indexOf("<SessionAccordion");
  assert.ok(legendIndex >= 0);
  assert.ok(accordionIndex > legendIndex);
});

test("session groups are single-open on screen and all expanded for print", () => {
  assert.match(accordionSource, /openGroupId/);
  assert.match(accordionSource, /setOpenGroupId\(isOpen \? null : group\.id\)/);
  assert.match(accordionSource, /reports-accordion-content/);
  assert.match(accordionSource, /Unattributed/);
});

test("owner-facing tables and CSV exports use the same plain metric names", () => {
  assert.doesNotMatch(accordionSource, /Air quality change/);
  assert.match(accordionSource, /Odor level change/);
  assert.match(accordionSource, />State</);
  assert.doesNotMatch(accordionSource, /MQ-135|MQ-136/);
  assert.doesNotMatch(source, /Air quality change/);
  assert.match(source, /Odor level change \(%\)/);
  assert.doesNotMatch(source, /MQ-135 Delta|MQ-136 Delta/);
});

test("report trends use labeled seven-day owner-facing charts", () => {
  assert.equal(source.match(/<MetricTrendChart/g)?.length, 2);
  assert.match(source, /Visit Frequency \(7 days\)/);
  assert.match(source, /Average Duration \(7 days\)/);
  assert.doesNotMatch(source, /Air quality change \(7 days\)/);
  assert.doesNotMatch(source, /Gas Quality/);
  assert.match(source, /metric="visits"/);
  assert.match(source, /metric="duration"/);
  assert.doesNotMatch(source, /metric="airQuality"/);
  assert.match(source, /trendReferences/);
});

test("PDF exports set and restore the requested filename and disable chart animation", () => {
  assert.match(source, /_cat health reports/);
  assert.match(source, /document.title = previousTitle/);
  const chart = readFileSync(join(__dirname, "../../../components/charts/MetricTrendChart.tsx"), "utf8");
  assert.equal(chart.match(/isAnimationActive=\{width === undefined\}/g)?.length, 2);
});
