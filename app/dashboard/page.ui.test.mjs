import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

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
