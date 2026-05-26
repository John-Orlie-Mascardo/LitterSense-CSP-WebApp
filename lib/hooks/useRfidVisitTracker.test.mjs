import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, "useRfidVisitTracker.ts");

function loadFindCatByRfid() {
  const source = readFileSync(sourcePath, "utf8")
    .replace(/^"use client";\s*/, "")
    .replace(/^import .*;\s*/gm, "")
    .replace("export function useRfidVisitTracker", "function useRfidVisitTracker");

  const { outputText } = ts.transpileModule(
    `${source}\nmodule.exports = { findCatByRfid };\n`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  );

  const context = {
    console,
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(outputText, context, { filename: sourcePath });

  return context.module.exports.findCatByRfid;
}

const findCatByRfid = loadFindCatByRfid();

test("matches a completed session to a cat with the registered RFID tag", () => {
  const cats = [{ id: "cat-1", name: "Milo" }];
  const catDetails = {
    "cat-1": {
      rfidTag: "00967D97",
    },
  };

  assert.equal(findCatByRfid(cats, catDetails, "00967D97", ""), cats[0]);
});

test("does not assign an unknown RFID tag to the only registered cat", () => {
  const cats = [{ id: "cat-1", name: "Milo" }];
  const catDetails = {
    "cat-1": {
      rfidTag: "00967D97",
    },
  };

  assert.equal(findCatByRfid(cats, catDetails, "9862551", "00968457"), undefined);
});
