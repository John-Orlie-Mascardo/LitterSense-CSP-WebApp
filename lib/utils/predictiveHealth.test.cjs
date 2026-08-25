/**
 * predictiveHealth.test.cjs
 *
 * Public request/response contracts for Gemini-backed behavior explanations.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/predictiveHealth.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const testModule = { exports: {} };
new Function("exports", "module", compiled.outputText)(testModule.exports, testModule);

const { parseGeminiSummary, parsePredictiveHealthRequest } = testModule.exports;

test("accepts a complete authenticated analysis request", () => {
  const result = parsePredictiveHealthRequest({
    idToken: "firebase-token",
    catName: "Teddy",
    displayState: "insufficient",
    todayVisits: 2,
    todayAvgDuration: "1m 15s",
    trendData: [{ day: "Mon", visits: 2, avgDuration: 75 }],
  });

  assert.equal(result.catName, "Teddy");
  assert.equal(result.trendData.length, 1);
});

test("rejects malformed or unauthenticated analysis requests", () => {
  assert.equal(parsePredictiveHealthRequest({ catName: "Teddy" }), null);
  assert.equal(
    parsePredictiveHealthRequest({
      idToken: "token",
      catName: "Teddy",
      displayState: "diagnosed",
      todayVisits: 2,
      todayAvgDuration: "1m",
      trendData: [],
    }),
    null,
  );
});

test("extracts a short structured Gemini summary", () => {
  const summary = parseGeminiSummary({
    candidates: [{ content: { parts: [{ text: '{"summary":"Teddy needs more sessions."}' }] } }],
  });

  assert.equal(summary, "Teddy needs more sessions.");
  assert.throws(() => parseGeminiSummary({ candidates: [] }));
});
