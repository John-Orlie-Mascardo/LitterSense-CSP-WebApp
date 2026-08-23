/**
 * page.ui.test.mjs
 *
 * Source-level contracts for report naming, exports, state reference, and grouped logs.
 *
 * DONE: printable grouping, raw CSV headers, activity naming, shared legend
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

test("previous report download opens the printable report instead of showing a fake download toast", () => {
  assert.match(source, /const handleDownloadPastReport = \(id: string\) => \{/);
  assert.match(source, /viewReport\(id\)/);
  assert.match(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /Downloading \$\{report\.filename\}/);
});

test("report surfaces use activity naming while filenames remain unchanged", () => {
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

test("owner-facing columns use plain names while CSV retains raw sensor identifiers", () => {
  assert.match(accordionSource, /Air quality change/);
  assert.match(accordionSource, /Odor level change/);
  assert.match(accordionSource, />State</);
  assert.doesNotMatch(accordionSource, /MQ-135|MQ-136/);
  assert.match(source, /MQ-135 Delta,MQ-136 Delta/);
});
