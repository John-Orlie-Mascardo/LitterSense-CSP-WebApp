const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const authContext = readFileSync("lib/contexts/AuthContext.tsx", "utf8");
const adminRoute = readFileSync("components/AdminRoute.tsx", "utf8");
const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
const topBar = readFileSync("components/layout/TopBar.tsx", "utf8");
const bottomNav = readFileSync("components/layout/BottomNav.tsx", "utf8");

test("admin access resolves only from a custom claim and ignores stale auth callbacks", () => {
  assert.match(authContext, /resolveAdminClaim\(currentUser\)/);
  assert.doesNotMatch(authContext, /ADMIN_EMAILS|DEV_ADMIN_OVERRIDE|["']admins["']/);
  assert.match(authContext, /authResolutionRef\.current/);
  assert.match(authContext, /if \(resolution !== authResolutionRef\.current\) return/);
});

test("the admin data provider stays behind the neutral route guard", () => {
  assert.ok(adminLayout.indexOf("<AdminRoute>") < adminLayout.indexOf("<AdminProvider>"));
  assert.ok(adminRoute.indexOf("if (loading)") < adminRoute.indexOf("return <>{children}</>"));
  assert.match(adminRoute, /if \(!user \|\| !isAdmin\) \{\s*return null;/);
});

test("owner navigation exposes no admin destination", () => {
  assert.doesNotMatch(topBar, /href:\s*["']\/admin/);
  assert.doesNotMatch(bottomNav, /href:\s*["']\/admin/);
});
