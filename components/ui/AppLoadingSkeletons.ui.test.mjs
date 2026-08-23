/**
 * AppLoadingSkeletons.ui.test.mjs
 *
 * Composition contracts for predictable route loading placeholders.
 *
 * DONE: stable card, chart/video, table, settings, and notification shapes
 * PLACEHOLDER: none
 *
 * NEXT: add a route fixture when a new primary navigation destination is created.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "AppLoadingSkeletons.tsx"), "utf8");
const root = join(__dirname, "../..");

const routeExpectations = [
  ["app/dashboard/loading.tsx", "DashboardContentSkeleton"],
  ["app/dashboard/cats/loading.tsx", "CatGridSkeleton"],
  ["app/dashboard/reports/loading.tsx", "ReportsContentSkeleton"],
  ["app/dashboard/live/loading.tsx", "LiveContentSkeleton"],
  ["app/dashboard/settings/loading.tsx", "SettingsContentSkeleton"],
  ["app/dashboard/notifications/loading.tsx", "NotificationsContentSkeleton"],
];

test("skeleton library preserves predictable content shapes", () => {
  assert.match(source, /data-skeleton="stat-card"/);
  assert.match(source, /marker="chart-block"/);
  assert.match(source, /marker = "table-row"/);
  assert.match(source, /data-skeleton="cat-card"/);
  assert.match(source, /marker="video-block"/);
  assert.match(source, /marker="settings-row"/);
  assert.match(source, /marker="notification-row"/);
  assert.match(source, /aria-label="Loading content"/);
});

test("each primary route renders its matching skeleton", () => {
  for (const [relativePath, componentName] of routeExpectations) {
    const routeSource = readFileSync(join(root, relativePath), "utf8");
    assert.match(routeSource, new RegExp(componentName));
    assert.match(routeSource, /AppLoadingFrame/);
  }
});
