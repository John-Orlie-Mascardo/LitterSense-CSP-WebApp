import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const predictivePagePath = join(__dirname, "predictive-health/page.tsx");
const predictivePageSource = existsSync(predictivePagePath)
  ? readFileSync(predictivePagePath, "utf8")
  : "";
const homeChartSource = readFileSync(
  join(__dirname, "../../components/dashboard/CatBehaviorTrends.tsx"),
  "utf8",
);
const topBarSource = readFileSync(
  join(__dirname, "../../components/layout/TopBar.tsx"),
  "utf8",
);

test("predictive analysis lives on its own per-cat page linked before notifications", () => {
  assert.doesNotMatch(homeChartSource, /Predictive Health Analysis/);
  assert.doesNotMatch(homeChartSource, /\/api\/predictive-health/);

  assert.match(predictivePageSource, /Predictive Health Analysis/);
  assert.match(predictivePageSource, /<CatChip/);
  assert.match(predictivePageSource, /Behavioral Baseline/);
  assert.match(predictivePageSource, /<CatBehaviorTrends/);
  assert.match(predictivePageSource, /\/api\/predictive-health/);

  const analysisLinkIndex = topBarSource.indexOf('href="/dashboard/predictive-health"');
  const notificationIndex = topBarSource.indexOf('aria-label="Notifications"');

  assert.notEqual(analysisLinkIndex, -1);
  assert.ok(analysisLinkIndex < notificationIndex);
});
