/**
 * Offline source contracts for the Phase 3 tour integration.
 *
 * These checks intentionally read source only. They must never authenticate,
 * contact Firebase/Supabase, or exercise notification delivery.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFileSync(join(currentDir, relativePath), "utf8");

const layoutSource = read("layout.tsx");
const homeSource = read("page.tsx");
const settingsSource = read("settings/page.tsx");
const topBarSource = read("../../components/layout/TopBar.tsx");
const bottomNavSource = read("../../components/layout/BottomNav.tsx");
const toastSource = read("../../components/ui/Toast.tsx");
const pushNoticeSource = read("../../components/dashboard/PushNotifications.tsx");
const tourSource = read("../../components/tour/AppTour.tsx");

test("the tour mounts inside onboarding in the dashboard layout only", () => {
  assert.match(layoutSource, /import \{ AppTour \} from "@\/components\/tour\/AppTour"/);
  assert.match(layoutSource, /import \{ TourProvider \} from "@\/components\/tour\/TourProvider"/);

  const onboardingStart = layoutSource.indexOf("<OnboardingGate>");
  const providerStart = layoutSource.indexOf("<TourProvider>");
  const appTour = layoutSource.indexOf("<AppTour />");
  const providerEnd = layoutSource.indexOf("</TourProvider>");
  const onboardingEnd = layoutSource.indexOf("</OnboardingGate>");

  assert.ok(onboardingStart < providerStart, "onboarding must finish before the tour provider mounts");
  assert.ok(providerStart < appTour && appTour < providerEnd, "AppTour must be owned by TourProvider");
  assert.ok(providerEnd < onboardingEnd, "the tour must stay inside OnboardingGate");
});

test("Home and both responsive navigation surfaces expose every required tour target", () => {
  for (const target of [
    "add-first-cat",
    "cat-chips",
    "cat-stats",
    "environment",
    "recent-activity",
  ]) {
    assert.match(homeSource, new RegExp(`data-tour=["']${target}["']`));
  }

  for (const navigationSource of [topBarSource, bottomNavSource]) {
    assert.match(navigationSource, /"nav-cats"/);
    assert.match(navigationSource, /"nav-settings"/);
  }
  assert.match(topBarSource, /data-tour="bell"/);
  assert.match(topBarSource, /data-tour="predictive-health"/);
});

test("Home reports no tour variant until the cat catalog is ready", () => {
  assert.match(
    homeSource,
    /reportDashboardState\(getDashboardTourState\(catCatalogReady, cats\.length\)\)/,
  );
});

test("Settings requests replay before navigating Home", () => {
  assert.match(settingsSource, /label="App tour"/);
  assert.match(settingsSource, /description="Show the guided tour again"/);
  assert.match(settingsSource, />\s*Start\s*</);

  const handlerStart = settingsSource.indexOf("const handleStartTour");
  const handlerEnd = settingsSource.indexOf("};", handlerStart);
  const handler = settingsSource.slice(handlerStart, handlerEnd);

  assert.notEqual(handlerStart, -1, "missing Settings tour replay handler");
  assert.ok(
    handler.indexOf("requestReplay()") < handler.indexOf('router.push("/dashboard")'),
    "replay intent must be stored before the route changes",
  );
});

test("opening the notification bell closes the tour first", () => {
  const bellStart = topBarSource.indexOf("{/* Notification bell + dropdown */}");
  const bellEnd = topBarSource.indexOf("<Bell", bellStart);
  const bellButton = topBarSource.slice(bellStart, bellEnd);

  assert.notEqual(bellStart, -1, "missing notification bell section");
  assert.ok(
    bellButton.indexOf("closeWithoutCompletion()") < bellButton.indexOf("setDropdownOpen"),
    "the tour must close before the bell panel opens",
  );
});

test("the tour is above app chrome and below foreground notices and toasts", () => {
  assert.match(topBarSource, /\bz-40\b/);
  assert.match(bottomNavSource, /\bz-50\b/);
  assert.match(tourSource, /z-\[60\]/);
  assert.match(toastSource, /z-\[70\]/);
  assert.match(pushNoticeSource, /z-\[70\]/);
});
