import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./chartTooltip.ts", import.meta.url), "utf8");
const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: loaded, exports: loaded.exports });
const { tooltipAwayFromCenter } = loaded.exports;

// A 400 x 200 chart box whose donut is centered at (200, 100).
const box = { left: 0, top: 0, width: 400, height: 200 };

test("hovering the left side of the donut opens the tooltip to the left", () => {
  const side = tooltipAwayFromCenter({ x: 120, y: 100 }, box);
  assert.equal(side.x, true);
});

test("hovering the right side opens it to the right", () => {
  assert.equal(tooltipAwayFromCenter({ x: 280, y: 100 }, box).x, false);
});

test("hovering the top opens it upward and the bottom opens it downward", () => {
  assert.equal(tooltipAwayFromCenter({ x: 200, y: 20 }, box).y, true);
  assert.equal(tooltipAwayFromCenter({ x: 200, y: 180 }, box).y, false);
});

test("works when the chart box is not at the page origin", () => {
  const offset = { left: 500, top: 300, width: 400, height: 200 };
  assert.equal(JSON.stringify(tooltipAwayFromCenter({ x: 560, y: 320 }, offset)), JSON.stringify({ x: true, y: true }));
});

test("the admin gender chart uses it and draws tooltip text in the theme color", () => {
  const page = readFileSync(new URL("../../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /tooltipAwayFromCenter\(/);
  assert.match(page, /reverseDirection=\{genderTooltipSide\}/);
  assert.match(page, /itemStyle=\{\{ color: "var\(--color-text\)" \}\}/);
});
