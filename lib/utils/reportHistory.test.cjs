const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/reportHistory.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const testModule = { exports: {} };
const fn = new Function("exports", "module", compiled.outputText);
fn(testModule.exports, testModule);

const { normalizePastReport, sortPastReports } = testModule.exports;

test("normalizes Firestore report metadata into a previous report row", () => {
  assert.deepEqual(
    normalizePastReport("report-1", {
      catId: "cat-1",
      catName: "Mochi",
      range: "May 1 - May 7, 2026",
      generatedOn: "2026-05-26",
      filename: "LitterSense_Mochi_2026-05-26.pdf",
    }),
    {
      id: "report-1",
      catId: "cat-1",
      catName: "Mochi",
      range: "May 1 - May 7, 2026",
      generatedOn: "2026-05-26",
      filename: "LitterSense_Mochi_2026-05-26.pdf",
    },
  );
});

test("sorts newest generated reports first", () => {
  const reports = sortPastReports([
    {
      id: "old",
      catId: "cat-1",
      catName: "Mochi",
      range: "Old",
      generatedOn: "2026-05-01",
      filename: "old.pdf",
    },
    {
      id: "new",
      catId: "cat-1",
      catName: "Mochi",
      range: "New",
      generatedOn: "2026-05-26",
      filename: "new.pdf",
    },
  ]);

  assert.deepEqual(reports.map((report) => report.id), ["new", "old"]);
});
