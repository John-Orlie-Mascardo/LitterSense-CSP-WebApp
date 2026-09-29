/**
 * MetricTrendChart.ui.test.mjs
 *
 * Source contracts for the shared fully labeled trend chart.
 *
 * DONE: axes, units, baseline/range labels, readable tooltip, empty states
 * PLACEHOLDER: none
 *
 * NEXT: add screenshot assertions when browser visual regression is available.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { renderToStaticMarkup } = require("react-dom/server");
const { createElement } = require("react");

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "MetricTrendChart.tsx"), "utf8");

test("tooltip sorts by its own axis maximum and preserves tied order", () => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function("require", "exports", compiled.outputText)((id) => {
    if (id === "@/lib/presentation/trendCharts") return {
      getTrendMetricConfig: (metric) => ({ metricName: metric, unit: "units" }),
      formatTrendTooltipLine: (name) => name,
    };
    return require(id);
  }, exports);
  const render = (duration, visits) => renderToStaticMarkup(createElement(exports.MetricTooltip, {
    active: true, primaryMetric: "duration", secondaryMetric: "visits",
    primaryMaximum: 4, secondaryMaximum: 9,
    payload: [{ dataKey: "primaryValue", value: duration }, { dataKey: "secondaryValue", value: visits }],
  }));
  const higherVisits = render(0.2, 8);
  assert.ok(higherVisits.indexOf("visits") < higherVisits.indexOf("duration"));
  for (const html of [render(4, 1), render(2, 4.5)]) {
    assert.ok(html.indexOf("duration") < html.indexOf("visits"));
  }
});

test("axis text meets 4.5:1 contrast on light and dark cards", () => {
  const luminance = (hex) => {
    const values = hex.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  for (const [text, background] of [["1B7A6E", "FFFFFF"], ["99501A", "FFFFFF"], ["48B6A8", "1A1A1A"], ["E8924A", "1A1A1A"]]) {
    assert.ok(source.includes(`#${text}`));
    const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5);
  }
});

test("the chart renders titled axes, ticks, baseline, and normal range", () => {
  assert.match(source, /CartesianGrid/);
  assert.match(source, /XAxis/);
  assert.match(source, /YAxis/);
  assert.match(source, /value: "Day"/);
  assert.match(source, /yAxisTitle/);
  assert.match(source, /ReferenceArea/);
  assert.match(source, /ReferenceLine/);
  assert.match(source, /Normal range/);
  assert.match(source, /Baseline/);
});

test("the tooltip keeps metric, value, unit, and day on one readable line", () => {
  assert.match(source, /formatTrendTooltipLine/);
  assert.match(source, /whitespace-nowrap/);
});

test("zero data renders an empty message without chart axes", () => {
  const emptyIndex = source.indexOf("if (!hasData)");
  const chartIndex = source.indexOf("<ResponsiveContainer");
  assert.ok(emptyIndex >= 0);
  assert.ok(chartIndex > emptyIndex);
  assert.match(source, /Baseline still building/);
  assert.match(source, /Baseline unavailable for this saved report/);
});

test("metric identity owns domains and tick formatting for single and dual axes", () => {
  assert.match(source, /getTrendMetricConfig/);
  assert.match(source, /getTrendYAxisDomain/);
  assert.match(source, /formatTrendTick/);
  assert.match(source, /secondary/);
  assert.match(source, /orientation="right"/);
});
