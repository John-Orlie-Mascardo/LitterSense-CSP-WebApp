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

const {
  isOwnerCatCatalogReady,
  isOwnerCatDataLoading,
  shouldFinishInitialCatsLoad,
} = testModule.exports;

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

test("keeps a new owner's cat data loading until that owner's catalog is ready", () => {
  assert.equal(
    isOwnerCatDataLoading({
      hasOwner: true,
      ownerReady: false,
      hasFallbackCatalog: false,
      isLoading: false,
    }),
    true,
  );
  assert.equal(
    isOwnerCatDataLoading({
      hasOwner: true,
      ownerReady: true,
      hasFallbackCatalog: false,
      isLoading: false,
    }),
    false,
  );
});

test("preserves the existing loading state while authentication is unresolved", () => {
  assert.equal(
    isOwnerCatDataLoading({
      hasOwner: false,
      ownerReady: false,
      hasFallbackCatalog: false,
      isLoading: true,
    }),
    true,
  );
});

test("does not treat an incomplete empty fallback catalog as zero cats", () => {
  const fallbackState = {
    hasOwner: true,
    hasFallbackCatalog: true,
    primaryCatalogReady: false,
  };

  assert.equal(
    isOwnerCatCatalogReady({
      ...fallbackState,
      catCount: 0,
      fallbackCatalogComplete: false,
    }),
    false,
  );
  assert.equal(
    isOwnerCatCatalogReady({
      ...fallbackState,
      catCount: 1,
      fallbackCatalogComplete: false,
    }),
    true,
  );
  assert.equal(
    isOwnerCatCatalogReady({
      ...fallbackState,
      catCount: 0,
      fallbackCatalogComplete: true,
    }),
    true,
  );
});

test("requires a confirmed primary catalog before choosing a tour", () => {
  const primaryState = {
    hasOwner: true,
    hasFallbackCatalog: false,
    fallbackCatalogComplete: false,
    catCount: 0,
  };

  assert.equal(
    isOwnerCatCatalogReady({
      ...primaryState,
      primaryCatalogReady: false,
    }),
    false,
  );
  assert.equal(
    isOwnerCatCatalogReady({
      ...primaryState,
      primaryCatalogReady: true,
    }),
    true,
  );
});
