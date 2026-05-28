const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("app/globals.css", "utf8");

test("report print mode forces light readable abnormal row colors", () => {
  assert.match(source, /--color-abnormal-bg:\s*#FEE2E2/);
  assert.match(source, /--color-abnormal-text:\s*#991B1B/);
  assert.match(
    source,
    /\.reports-print-page\[data-print-ready="true"\] \.reports-print-document tr\.bg-status-abnormal/,
  );
});
