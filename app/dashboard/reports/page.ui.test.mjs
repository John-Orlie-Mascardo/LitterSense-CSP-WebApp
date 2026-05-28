import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("previous report download opens the printable report instead of showing a fake download toast", () => {
  assert.match(source, /const handleDownloadPastReport = \(id: string\) => \{/);
  assert.match(source, /viewReport\(id\)/);
  assert.match(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /Downloading \$\{report\.filename\}/);
});

test("session log only highlights report-level concerns", () => {
  assert.match(source, /isReportSessionConcern/);
  assert.match(source, /const isConcern = isReportSessionConcern\(session\)/);
  assert.match(source, /className=\{isConcern \? "bg-status-abnormal" : ""\}/);
});
