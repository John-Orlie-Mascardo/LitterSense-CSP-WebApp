/**
 * TopBar.ui.test.mjs
 *
 * Source contracts for global header navigation and logo accessibility.
 *
 * DONE: dashboard logo destination, keyboard focus, and accessible name
 * PLACEHOLDER: none
 *
 * NEXT: extend when the global navigation contract changes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "TopBar.tsx"), "utf8");

const require = createRequire(import.meta.url);
const ts = require("typescript");
const exports = {};
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("exports", "require", compiled)(exports, () => ({}));

test("dismissal preserves history, hides read and unread items, and admits new arrivals", () => {
  const history = Object.freeze([
    Object.freeze({ id: "unread", isRead: false }),
    Object.freeze({ id: "read", isRead: true }),
  ]);
  const dismissed = JSON.stringify(history.map((item) => item.id));
  assert.deepEqual(exports.getPanelNotifications(history, dismissed), []);
  const arrival = { id: "new", isRead: false };
  const panel = exports.getPanelNotifications([...history, arrival], dismissed);
  assert.deepEqual(panel, [arrival]);
  assert.equal(panel.filter((item) => !item.isRead).length, 1);
  assert.deepEqual(history, [{ id: "unread", isRead: false }, { id: "read", isRead: true }]);
  for (const invalid of ["", "{", "null", "{}", "42"]) {
    assert.deepEqual(exports.getPanelNotifications(history, invalid), history);
  }
  assert.deepEqual(exports.getPanelNotifications(history, '[null,4,"read"]'), [history[0]]);
});

test("clearing is confirmed and account-scoped while the empty panel keeps its history link", () => {
  const clear = source.slice(source.indexOf("const clearPanel"), source.indexOf("  useEffect", source.indexOf("const clearPanel")));
  assert.ok(clear.indexOf("window.confirm") < clear.indexOf("localStorage.setItem"));
  assert.doesNotMatch(clear, /deleteNotification|clearAll|markAsRead/);
  assert.match(source, /littersense-dismissed-notifications:\$\{user.uid\}/);
  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /panelNotifications.filter\(\(notification\) => !notification.isRead\)/);
  const footer = source.slice(source.indexOf("{/* Footer */}"));
  assert.match(footer, /href="\/dashboard\/notifications"/);
  assert.doesNotMatch(footer, /notifications.length/);
  assert.match(source, /Mark all as read/);
  assert.match(source, /aria-label=\{`Mark as read:/);
});

test("the LitterSense logo is a keyboard-accessible dashboard link", () => {
  assert.match(source, /<Link[\s\S]*?href="\/dashboard"[\s\S]*?aria-label="Go to dashboard"/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /cursor-pointer/);
  assert.match(source, /<motion\.div[\s\S]*?>[\s\S]*?LitterSense[\s\S]*?<\/motion\.div>[\s\S]*?<\/Link>/);
});
