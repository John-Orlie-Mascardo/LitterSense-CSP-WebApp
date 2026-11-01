/**
 * Offline contracts for the Phase 3 in-app tour.
 *
 * The step definitions are executed locally after TypeScript transpilation;
 * provider and dialog behavior are checked at source level so this suite never
 * mounts auth, reads live data, or contacts an external service.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const stepsSource = readFileSync(join(currentDir, "tourSteps.ts"), "utf8");
const providerSource = readFileSync(join(currentDir, "TourProvider.tsx"), "utf8");
const tourSource = readFileSync(join(currentDir, "AppTour.tsx"), "utf8");

const require = createRequire(import.meta.url);
const ts = require("typescript");
const stepExports = {};
const compiledSteps = ts.transpileModule(stepsSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
new Function("exports", "require", compiledSteps)(stepExports, require);

const withCatsExpected = [
  [null, "Welcome to LitterSense", "Here's a quick tour of the main parts of the app. It takes under a minute."],
  ["cat-chips", "Your cats", "Pick a cat here to see their day."],
  ["cat-stats", "Today at a glance", "Today's visits and average visit length for the selected cat."],
  ["environment", "Litter box environment", "Shows if urine or stool odor is detected in the box."],
  ["recent-activity", "Recent visits", "Each visit appears here. Tap VIEW ALL for the full history."],
  ["nav-cats", "My Cats", "Add cats, register their collar tags, and see each cat's history."],
  ["bell", "Notifications", "Alerts about your cats and the litter box show up here."],
  ["nav-settings", "Settings", "Turn on alerts for this device and choose which ones you get. You can replay this tour here anytime."],
];

const zeroCatsExpected = [
  withCatsExpected[0],
  ["add-first-cat", "Your cats", "Start by adding your cat and scanning their collar tag."],
  ...withCatsExpected.slice(5),
];

const summarize = (steps) =>
  steps.map(({ target, title, description }) => [target, title, description]);

test("the populated dashboard has the exact eight steps in guide order", () => {
  assert.equal(stepExports.TOUR_STEPS_WITH_CATS.length, 8);
  assert.deepEqual(summarize(stepExports.TOUR_STEPS_WITH_CATS), withCatsExpected);
  assert.deepEqual(
    summarize(stepExports.getTourSteps("with-cats")),
    withCatsExpected,
  );
});

test("the empty dashboard replaces all cat-data steps with the exact five-step version", () => {
  assert.equal(stepExports.TOUR_STEPS_ZERO_CATS.length, 5);
  assert.deepEqual(summarize(stepExports.TOUR_STEPS_ZERO_CATS), zeroCatsExpected);
  assert.deepEqual(
    summarize(stepExports.getTourSteps("zero-cats")),
    zeroCatsExpected,
  );
});

test("completion is UID-scoped and resilient when localStorage fails", () => {
  assert.match(providerSource, /const TOUR_STORAGE_KEY_PREFIX = "littersense_tour_done:"/);
  assert.match(
    providerSource,
    /localStorage\.getItem\(`\$\{TOUR_STORAGE_KEY_PREFIX\}\$\{uid\}`\)/,
  );
  assert.match(
    providerSource,
    /localStorage\.setItem\(`\$\{TOUR_STORAGE_KEY_PREFIX\}\$\{uid\}`, "true"\)/,
  );
  assert.match(providerSource, /try \{[\s\S]*?localStorage\.getItem[\s\S]*?\} catch \{/);
  assert.match(providerSource, /try \{[\s\S]*?localStorage\.setItem[\s\S]*?\} catch \{/);
  assert.match(providerSource, /sessionSuppressedUsers\.add\(uid\)/);
  assert.doesNotMatch(providerSource, /removeItem\(.*littersense_tour_done/);
});

test("Done and Skip complete the tour while Escape and route changes only close it", () => {
  const completionStart = providerSource.indexOf("const markCompleteAndClose");
  const completionEnd = providerSource.indexOf("const goBack", completionStart);
  const completion = providerSource.slice(completionStart, completionEnd);
  assert.match(completion, /localStorage\.setItem/);
  assert.match(completion, /setIsOpen\(false\)/);

  const closeStart = providerSource.indexOf("const closeWithoutCompletion");
  const closeEnd = providerSource.indexOf("const requestReplay", closeStart);
  const close = providerSource.slice(closeStart, closeEnd);
  assert.match(close, /setIsOpen\(false\)/);
  assert.doesNotMatch(close, /localStorage|markComplete/);

  const routeCloseStart = providerSource.indexOf('if (pathname === "/dashboard") return');
  const routeCloseEnd = providerSource.indexOf("}, [pathname]", routeCloseStart);
  const routeClose = providerSource.slice(routeCloseStart, routeCloseEnd);
  assert.match(routeClose, /setIsOpen\(false\)/);
  assert.doesNotMatch(routeClose, /localStorage|markComplete/);

  assert.match(providerSource, /activeStepIndex >= steps\.length - 1[\s\S]*?markCompleteAndClose\(\)/);
  assert.match(providerSource, /skipTour: markCompleteAndClose/);
  assert.match(tourSource, /event\.key === "Escape"[\s\S]*?closeWithoutCompletion\(\)/);
  assert.match(tourSource, /onClick=\{skipTour\}[\s\S]*?>\s*Skip tour\s*</);
  assert.match(tourSource, /activeStepIndex === steps\.length - 1 \? "Done" : "Next"/);
});

test("the dialog traps keyboard focus, restores it, and exposes its step accessibly", () => {
  assert.match(tourSource, /role="dialog"/);
  assert.match(tourSource, /aria-modal="true"/);
  assert.match(tourSource, /aria-labelledby="tour-step-title"/);
  assert.match(tourSource, /aria-describedby="tour-step-description"/);
  assert.match(tourSource, /tabIndex=\{-1\}/);
  assert.match(tourSource, /dialogRef\.current\?\.focus\(\)/);
  assert.match(tourSource, /event\.key !== "Tab"/);
  assert.match(tourSource, /event\.shiftKey/);
  assert.match(tourSource, /last\.focus\(\)/);
  assert.match(tourSource, /first\.focus\(\)/);
  assert.match(tourSource, /previousFocus\.current\?\.isConnected[\s\S]*?previousFocus\.current\.focus\(\)/);
  assert.match(tourSource, /aria-live="polite"/);
  assert.match(tourSource, /\{activeStepIndex \+ 1\} of \{steps\.length\}/);
});

test("the overlay blocks the page, fits a 375px viewport, and honors reduced motion", () => {
  assert.match(tourSource, /useReducedMotion\(\)/);
  assert.match(tourSource, /const duration = reducedMotion \? 0 :/);
  assert.match(tourSource, /w-\[calc\(100vw-2rem\)\]/);
  assert.match(tourSource, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(tourSource, /className="pointer-events-auto fixed bg-black\/55"/);
  assert.doesNotMatch(tourSource, /setTimeout|setInterval|MutationObserver/);
});
