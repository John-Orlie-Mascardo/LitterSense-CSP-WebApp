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

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "TopBar.tsx"), "utf8");

test("the LitterSense logo is a keyboard-accessible dashboard link", () => {
  assert.match(source, /<Link[\s\S]*?href="\/dashboard"[\s\S]*?aria-label="Go to dashboard"/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /cursor-pointer/);
  assert.match(source, /<motion\.div[\s\S]*?>[\s\S]*?LitterSense[\s\S]*?<\/motion\.div>[\s\S]*?<\/Link>/);
});
