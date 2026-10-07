const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadHelper() {
  const source = readFileSync(path.join(__dirname, "adminOverview.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, { module: sandboxModule, exports: sandboxModule.exports });
  return sandboxModule.exports;
}

test("dashboard totals and gender split derive from users while pending KPI uses live queue", () => {
  const { summarizeAdminOverview } = loadHelper();
  const users = [
    {
      id: "owner-1",
      status: "active",
      cats: [{ name: "A", gender: "female" }, { name: "B", gender: "male" }],
    },
    {
      id: "owner-2",
      status: "inactive",
      cats: [{ name: "C", gender: "female" }],
    },
  ];
  const requests = [
    { status: "pending" },
    { status: "failed" },
    { status: "processing" },
  ];

  assert.deepEqual(JSON.parse(JSON.stringify(summarizeAdminOverview(users, requests))), {
    totalUsers: 2,
    activeUsers: 1,
    totalCats: 3,
    maleCats: 1,
    femaleCats: 2,
    pendingDeletes: 1,
  });
});
