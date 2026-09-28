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

const {
  buildPredictiveHealthEvidence,
  buildPredictiveHealthPrompt,
  createPredictiveHealthRateLimiter,
  createPredictiveHealthAnalysis,
  isPredictiveHealthAnalysis,
  parseDurationLabelToSeconds,
  parseGeminiSummary,
  parsePredictiveHealthRequest,
  summarizePredictiveSessions,
} = testModule.exports;

const completeRequest = {
  idToken: "firebase-token",
  catName: "Teddy",
  displayState: "abnormal",
  todayVisits: 6,
  todayAvgDurationSecs: 300,
  baseline: {
    avgVisitsPerDay: 4,
    avgDurationSecs: 120,
    lastUpdated: "2026-08-20",
  },
  sessionCounts: {
    completed: 12,
    incomplete: 2,
    abnormal: 1,
  },
  trendData: [
    { day: "Mon", visits: 4, avgDuration: 120 },
    { day: "Tue", visits: 6, avgDuration: 300 },
  ],
};

test("accepts a complete authenticated analysis request", () => {
  const result = parsePredictiveHealthRequest(completeRequest);

  assert.equal(result.catName, "Teddy");
  assert.equal(result.todayAvgDurationSecs, 300);
  assert.equal(result.baseline.avgVisitsPerDay, 4);
  assert.equal(result.sessionCounts.completed, 12);
  assert.equal(result.trendData.length, 2);
});

test("rejects malformed or unauthenticated analysis requests", () => {
  assert.equal(parsePredictiveHealthRequest({ catName: "Teddy" }), null);
  assert.equal(
    parsePredictiveHealthRequest({
      idToken: "token",
      catName: "Teddy",
      displayState: "diagnosed",
      todayVisits: 2,
      todayAvgDurationSecs: 60,
      baseline: null,
      sessionCounts: { completed: 1, incomplete: 0, abnormal: 0 },
      trendData: [],
    }),
    null,
  );
});

test("summarizes only usable sessions for analysis quality", () => {
  assert.equal(typeof summarizePredictiveSessions, "function");
  if (typeof summarizePredictiveSessions !== "function") return;

  assert.deepEqual(
    summarizePredictiveSessions([
      { sessionStatus: "NORMAL", anomaly: false, anomalyType: null },
      { sessionStatus: "DAILY_SUMMARY", summaryVisits: 3, anomaly: false, anomalyType: null },
      { sessionStatus: "SHORT_SESSION", anomaly: true, anomalyType: "Short session" },
      { sessionStatus: "ABNORMAL", anomaly: true, anomalyType: "Extended duration" },
      { sessionStatus: "IN_PROGRESS", anomaly: false, anomalyType: null },
    ]),
    { completed: 5, incomplete: 1, abnormal: 1 },
  );
});

test("converts displayed durations back to numeric evidence without guessing", () => {
  assert.equal(typeof parseDurationLabelToSeconds, "function");
  if (typeof parseDurationLabelToSeconds !== "function") return;

  assert.equal(parseDurationLabelToSeconds("5m"), 300);
  assert.equal(parseDurationLabelToSeconds("1m 15s"), 75);
  assert.equal(parseDurationLabelToSeconds("27s"), 27);
  assert.equal(parseDurationLabelToSeconds("No data yet"), null);
  assert.equal(parseDurationLabelToSeconds("unknown"), null);
});

test("builds exact evidence without asking Gemini to do the arithmetic", () => {
  assert.equal(typeof buildPredictiveHealthEvidence, "function");
  if (typeof buildPredictiveHealthEvidence !== "function") return;

  const request = parsePredictiveHealthRequest(completeRequest);
  const evidence = buildPredictiveHealthEvidence(request);

  assert.equal(
    evidence.baselineComparison,
    "Today's 6 visits are 50% above the 4-visit baseline. Today's 5 min average duration is 150% above the 2 min baseline.",
  );
  assert.deepEqual(evidence.observedChanges, [
    "From Mon to Tue, visits increased from 4 to 6 and average duration increased from 2 min to 5 min.",
    "1 abnormal session was recorded.",
    "2 incomplete sessions were excluded from baseline evidence.",
  ]);
  assert.equal(
    evidence.dataQuality,
    "Baseline established. Analysis uses 12 completed RFID sessions; 2 incomplete sessions were excluded.",
  );
  assert.match(evidence.safeNextStep, /contact a veterinarian/);
});

test("insufficient data never produces a reliable baseline comparison", () => {
  assert.equal(typeof buildPredictiveHealthEvidence, "function");
  if (typeof buildPredictiveHealthEvidence !== "function") return;

  const request = parsePredictiveHealthRequest({
    ...completeRequest,
    displayState: "insufficient",
    todayVisits: null,
    todayAvgDurationSecs: null,
    baseline: null,
    sessionCounts: { completed: 2, incomplete: 1, abnormal: 0 },
    trendData: [],
  });
  const evidence = buildPredictiveHealthEvidence(request);

  assert.equal(
    evidence.baselineComparison,
    "No established baseline is available, so a reliable comparison cannot be made yet.",
  );
  assert.match(evidence.dataQuality, /More completed RFID sessions are needed/);
  assert.match(evidence.safeNextStep, /Collect more completed RFID sessions/);
});

test("describes metrics that exactly match the baseline", () => {
  const request = parsePredictiveHealthRequest({
    ...completeRequest,
    displayState: "normal",
    todayVisits: 4,
    todayAvgDurationSecs: 120,
  });

  assert.equal(
    buildPredictiveHealthEvidence(request).baselineComparison,
    "Today's 4 visits match the 4-visit baseline. Today's 2 min average duration matches the 2 min baseline.",
  );
});

test("grounds Gemini's prompt in the official state and computed evidence", () => {
  assert.equal(typeof buildPredictiveHealthPrompt, "function");
  if (typeof buildPredictiveHealthPrompt !== "function") return;

  const request = parsePredictiveHealthRequest(completeRequest);
  const prompt = buildPredictiveHealthPrompt(request);

  assert.match(prompt, /official behavior state/i);
  assert.match(prompt, /50% above the 4-visit baseline/);
  assert.match(prompt, /do not diagnose/i);
});

test("combines Gemini's summary with deterministic report sections", () => {
  assert.equal(typeof createPredictiveHealthAnalysis, "function");
  if (typeof createPredictiveHealthAnalysis !== "function") return;

  const request = parsePredictiveHealthRequest(completeRequest);
  const analysis = createPredictiveHealthAnalysis(
    request,
    "Teddy's recorded activity is outside the configured limits and usual pattern.",
  );

  assert.equal(analysis.summary, "Teddy's recorded activity is outside the configured limits and usual pattern.");
  assert.equal(analysis.observedChanges.length, 3);
  assert.match(analysis.safeNextStep, /contact a veterinarian/);
});

test("accepts only complete structured reports at the client boundary", () => {
  assert.equal(typeof isPredictiveHealthAnalysis, "function");
  if (typeof isPredictiveHealthAnalysis !== "function") return;

  assert.equal(
    isPredictiveHealthAnalysis({
      summary: "Recorded behavior crossed a configured limit.",
      baselineComparison: "Duration is above baseline.",
      observedChanges: ["One abnormal session was recorded."],
      dataQuality: "Baseline established.",
      safeNextStep: "Continue monitoring.",
    }),
    true,
  );
  assert.equal(
    isPredictiveHealthAnalysis({
      summary: "Incomplete response",
      observedChanges: [],
    }),
    false,
  );
});

test("failed analysis releases the request lock without consuming cooldown", () => {
  assert.equal(typeof createPredictiveHealthRateLimiter, "function");
  if (typeof createPredictiveHealthRateLimiter !== "function") return;

  const limiter = createPredictiveHealthRateLimiter(15_000);
  assert.deepEqual(limiter.begin("user-1", 0), { allowed: true });
  assert.deepEqual(limiter.begin("user-1", 0), {
    allowed: false,
    reason: "in_progress",
    retryAfterSeconds: 1,
  });

  limiter.finish("user-1", false, 100);
  assert.deepEqual(limiter.begin("user-1", 100), { allowed: true });

  limiter.finish("user-1", true, 100);
  assert.deepEqual(limiter.begin("user-1", 5_100), {
    allowed: false,
    reason: "cooldown",
    retryAfterSeconds: 10,
  });
  assert.deepEqual(limiter.begin("user-1", 15_100), { allowed: true });
});

test("extracts a short structured Gemini summary", () => {
  const summary = parseGeminiSummary({
    candidates: [{ content: { parts: [{ text: '{"summary":"Teddy needs more sessions."}' }] } }],
  });

  assert.equal(summary, "Teddy needs more sessions.");
  assert.throws(() => parseGeminiSummary({ candidates: [] }));
});
