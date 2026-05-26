const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/onboardingState.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", compiled.outputText);
fn(testModule.exports, testModule);

const {
  defaultOnboardingNotificationPreferences,
  resolveOnboardingComplete,
  shouldShowDashboardOnboarding,
} = testModule.exports;

test("treats missing onboardingComplete as complete for existing users", () => {
  assert.equal(resolveOnboardingComplete(undefined), true);
});

test("keeps explicit false onboardingComplete for new users", () => {
  assert.equal(resolveOnboardingComplete(false), false);
});

test("shows inline dashboard onboarding for incomplete non-admin users", () => {
  assert.equal(
    shouldShowDashboardOnboarding({
      onboardingComplete: false,
      isAdmin: false,
    }),
    true,
  );
});

test("does not show inline dashboard onboarding for complete or admin users", () => {
  assert.equal(
    shouldShowDashboardOnboarding({
      onboardingComplete: true,
      isAdmin: false,
    }),
    false,
  );
  assert.equal(
    shouldShowDashboardOnboarding({
      onboardingComplete: false,
      isAdmin: true,
    }),
    false,
  );
});

test("uses requested onboarding notification defaults", () => {
  assert.deepEqual(defaultOnboardingNotificationPreferences, {
    ammoniaAlerts: true,
    h2sAlerts: true,
    rfidVisitAlerts: false,
  });
});
