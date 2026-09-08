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

function loadHasMatchingRecordedSession() {
  const source = readFileSync(sourcePath, "utf8")
    .replace(/^"use client";\s*/, "")
    .replace(/^import .*;\s*/gm, "")
    .replace("export function useRfidVisitTracker", "function useRfidVisitTracker");

  const { outputText } = ts.transpileModule(
    `${source}\nmodule.exports = { hasMatchingRecordedSession };\n`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  );

  const context = {
    console: {
      ...console,
      debug() {},
    },
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(outputText, context, { filename: sourcePath });

  return context.module.exports.hasMatchingRecordedSession;
}

const hasMatchingRecordedSession = loadHasMatchingRecordedSession();

test("an active visit does not emit an exit notification for the previous completion", () => {
  const notifications = [];
  const tracker = loadUseRfidVisitTracker({cats: [{id: "cat-1", name: "Milo"}],
    catDetails: {"cat-1": {rfidTag: "ABCD"}}, sessions: []});
  tracker({online: true, sessionActive: true, activeRfidHex: "ABCD",
    activeSessionStartMs: 1788832800000, completedSessionCount: 1,
    lastSessionStatus: "NORMAL", lastSessionDurationMs: 10000, lastSessionEndMs: 1788832700000},
    {addNotification: async (value) => {notifications.push(value);}});
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].title, /entered/);
});

function loadUseRfidVisitTracker(catContext) {
  const source = readFileSync(sourcePath, "utf8")
    .replace(/^"use client";\s*/, "")
    .replace(/^import .*;\s*/gm, "")
    .replace("export function useRfidVisitTracker", "function useRfidVisitTracker");

  const { outputText } = ts.transpileModule(
    `${source}\nmodule.exports = { useRfidVisitTracker };\n`,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  );

  const context = {
    console: {
      ...console,
      debug() {},
    },
    module: { exports: {} },
    exports: {},
    useEffect(effect) {
      effect();
    },
    useRef() {
      return { current: "" };
    },
    useCats() {
      return catContext;
    },
  };

  vm.runInNewContext(outputText, context, { filename: sourcePath });

  return context.module.exports.useRfidVisitTracker;
}

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

test("skips a session that already exists in Firestore", () => {
  const sessions = [
    {
      catId: "cat-1",
      durationSecs: 39,
      endedAt: "2026-05-26T14:59:39.000Z",
      sessionStatus: "NORMAL",
    },
  ];

  assert.equal(
    hasMatchingRecordedSession(
      sessions,
      "cat-1",
      39,
      "2026-05-26T14:59:39.000Z",
      "NORMAL",
    ),
    true,
  );
});

test("does not write Firestore visits for completed device-synced sessions", () => {
  const recordVisitCalls = [];
  const useRfidVisitTracker = loadUseRfidVisitTracker({
    cats: [{ id: "cat-1", name: "Milo" }],
    catDetails: {
      "cat-1": {
        rfidTag: "00967D97",
      },
    },
    sessions: [],
    recordVisit(...args) {
      recordVisitCalls.push(args);
    },
  });

  useRfidVisitTracker({
    online: true,
    completedSessionCount: 1,
    lastSessionDurationMs: 57000,
    lastSessionEndMs: Date.parse("2026-05-26T14:59:39.000Z"),
    lastSessionStatus: "NORMAL",
    activeRfidCard: "00967D97",
    activeRfidHex: "",
    rfidCard: "",
    rfidHex: "",
  });

  assert.deepEqual(recordVisitCalls, []);
});
