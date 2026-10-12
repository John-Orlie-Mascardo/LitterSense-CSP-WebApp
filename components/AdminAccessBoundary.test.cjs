const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const adminRoute = readFileSync("components/AdminRoute.tsx", "utf8");
const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
const topBar = readFileSync("components/layout/TopBar.tsx", "utf8");
const bottomNav = readFileSync("components/layout/BottomNav.tsx", "utf8");

// AuthContext.test.mjs exercises claim resolution and stale callbacks behaviorally.

test("the admin data provider stays behind the neutral route guard", () => {
  assert.ok(adminLayout.indexOf("<AdminRoute>") < adminLayout.indexOf("<AdminProvider>"));
  assert.ok(adminRoute.indexOf("if (loading)") < adminRoute.indexOf("return <>{children}</>"));
  assert.match(adminRoute, /if \(!user \|\| !isAdmin\) \{\s*return null;/);
});

test("owner navigation exposes no admin destination", () => {
  assert.doesNotMatch(topBar, /href:\s*["']\/admin/);
  assert.doesNotMatch(bottomNav, /href:\s*["']\/admin/);
});
