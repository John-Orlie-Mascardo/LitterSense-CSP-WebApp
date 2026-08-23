/**
 * page.ui.test.mjs
 *
 * Source-level UI contracts for the Home dashboard composition.
 *
 * DONE: activity grouping, no-data state wiring, responsive collapsible legend order, chart-axis contracts
 * PLACEHOLDER: none
 *
 * NEXT: frontend owners should keep behavior derivation in tested pure helpers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");
const chartSource = readFileSync(
  join(__dirname, "../../components/dashboard/CatBehaviorTrends.tsx"),
  "utf8",
);
const legendSource = readFileSync(
  join(__dirname, "../../components/behavior/BehaviorStateLegend.tsx"),
  "utf8",
);

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, `Missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing marker: ${endMarker}`);

  return source.slice(start, end);
}

test("recent activity keeps all sorted visits and shows three until expanded", () => {
  const getRecentVisits = sourceBetween(
    "const getRecentVisits = (",
    "const getReadingStatus = (",
  );
  const populatedDashboardState = sourceBetween(
    "function PopulatedDashboardState({",
    "export default function DashboardPage()",
  );

  assert.match(getRecentVisits, /getSessionTimelineSortValue\(b\.session\) -/);
  assert.doesNotMatch(getRecentVisits, /\.slice\(0,\s*5\)/);
  assert.match(populatedDashboardState, /showAllRecentActivity/);
  assert.match(populatedDashboardState, /recentVisits\.slice\(0,\s*3\)/);
  assert.match(populatedDashboardState, /VIEW ALL/);
  assert.match(populatedDashboardState, /SHOW LESS/);
});

test("recent activity is grouped under friendly date labels", () => {
  const dateLabelHelper = sourceBetween(
    "const getRecentActivityDateLabel = (",
    "const groupRecentVisitsByDate = (",
  );
  const groupingHelper = sourceBetween(
    "const groupRecentVisitsByDate = (",
    "const getReadingStatus = (",
  );
  const populatedDashboardState = sourceBetween(
    "function PopulatedDashboardState({",
    "export default function DashboardPage()",
  );

  assert.match(dateLabelHelper, /return "Today"/);
  assert.match(dateLabelHelper, /return "Yesterday"/);
  assert.match(dateLabelHelper, /month: "long"/);
  assert.match(groupingHelper, /dateLabel: getRecentActivityDateLabel/);
  assert.match(groupingHelper, /visits: \[visit\]/);
  assert.match(populatedDashboardState, /recentActivityGroups\.map/);
  assert.match(populatedDashboardState, /group\.dateLabel/);
  assert.match(populatedDashboardState, /group\.visits\.map/);
});

test("home replaces the greeting with one shared state key in each responsive position", () => {
  assert.doesNotMatch(source, /getGreeting/);
  assert.doesNotMatch(source, /userFirstName/);
  assert.doesNotMatch(source, /Here\u2019s how your cats are doing today/);
  assert.equal(source.match(/<BehaviorStateLegend/g)?.length, 2);
  assert.match(source, /hidden lg:block/);
  assert.match(source, /lg:hidden/);
});

test("selected cat summary precedes both responsive state keys and stays visible", () => {
  const populatedDashboardState = sourceBetween(
    "function PopulatedDashboardState({",
    "export default function DashboardPage()",
  );
  const selectedSummaryIndex = populatedDashboardState.indexOf("Currently selected");
  const stateKeyIndices = Array.from(
    populatedDashboardState.matchAll(/<BehaviorStateLegend/g),
    (match) => match.index,
  );
  const selectedSummarySource = populatedDashboardState.slice(
    Math.max(0, selectedSummaryIndex - 500),
    selectedSummaryIndex + 500,
  );

  assert.notEqual(selectedSummaryIndex, -1);
  assert.equal(stateKeyIndices.length, 2);
  assert.ok(stateKeyIndices.every((index) => selectedSummaryIndex < index));
  assert.doesNotMatch(selectedSummarySource, /hidden lg:flex/);
  assert.doesNotMatch(
    populatedDashboardState,
    /<BehaviorStateBadge state=\{selectedDisplayState\} compact className="lg:hidden" \/>/,
  );
});

test("mobile state key precedes the chart and primary metric sections", () => {
  const populatedDashboardState = sourceBetween(
    "function PopulatedDashboardState({",
    "export default function DashboardPage()",
  );
  const mobileStateKeyIndex = populatedDashboardState.indexOf(
    '<BehaviorStateLegend compact collapsible className="mb-6 lg:hidden" />',
  );
  const chartIndex = populatedDashboardState.indexOf("<CatBehaviorTrends");
  const catStatsIndex = populatedDashboardState.indexOf("Cat Stats");
  const environmentIndex = populatedDashboardState.indexOf("Litter Box Environment");

  assert.notEqual(mobileStateKeyIndex, -1);
  assert.ok(mobileStateKeyIndex < chartIndex);
  assert.ok(mobileStateKeyIndex < catStatsIndex);
  assert.ok(mobileStateKeyIndex < environmentIndex);
});

test("mobile state key uses a native disclosure that starts collapsed", () => {
  assert.match(legendSource, /readonly collapsible\?: boolean/);
  assert.match(legendSource, /<details/);
  assert.match(legendSource, /<summary/);
  assert.doesNotMatch(legendSource, /<details[^>]*\sopen(?:=|\s|>)/);
});

test("home derives presentation states and distinguishes missing metrics from real zeroes", () => {
  assert.match(source, /getCatDisplayState/);
  assert.match(source, /hasEstablishedBaseline/);
  assert.match(source, /hasRecordedCatData/);
  assert.match(source, /formatMetricValue/);
  assert.match(source, /No data yet/);
  assert.match(source, /displayState=/);
});

test("behavior chart labels duration in minutes on the left and visits on the right", () => {
  assert.match(chartSource, /Duration \(minutes\)/);
  assert.match(chartSource, /Visit count/);
  assert.match(chartSource, /avgDurationMinutes/);
  assert.match(chartSource, /yAxisId="duration"/);
  assert.match(chartSource, /yAxisId="visits"/);
  assert.match(chartSource, /orientation="right"/);
});
