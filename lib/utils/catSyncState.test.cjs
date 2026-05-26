const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync("lib/utils/catSyncState.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});

const moduleExports = {};
const testModule = { exports: moduleExports };
const fn = new Function("exports", "module", compiled.outputText);
fn(moduleExports, testModule);

const { shouldFinishInitialCatsLoad } = testModule.exports;

test("keeps loading for an empty cache-only cats snapshot", () => {
  assert.equal(
    shouldFinishInitialCatsLoad({ catCount: 0, fromCache: true }),
    false,
  );
});

test("finishes loading when cache snapshot already has cats", () => {
  assert.equal(
    shouldFinishInitialCatsLoad({ catCount: 2, fromCache: true }),
    true,
  );
});

test("finishes loading when server confirms there are no cats", () => {
  assert.equal(
    shouldFinishInitialCatsLoad({ catCount: 0, fromCache: false }),
    true,
  );
});
