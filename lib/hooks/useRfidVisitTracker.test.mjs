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

test("an already active visit does not replay entry or the previous exit on load", () => {
  const notifications = [];
  const tracker = loadUseRfidVisitTracker({cats: [{id: "cat-1", name: "Milo"}],
    catDetails: {"cat-1": {rfidTag: "ABCD"}}, sessions: []});
  tracker({online: true, sessionActive: true, activeRfidHex: "ABCD",
    activeSessionStartMs: 1788832800000, completedSessionCount: 1,
    lastSessionStatus: "NORMAL", lastSessionDurationMs: 10000, lastSessionEndMs: 1788832700000},
    {addNotification: async (value) => {notifications.push(value);}});
  assert.equal(notifications.length, 0);
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

  const refs = [];
  let refIndex = 0;
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
    useRef(initial) {
      return (refs[refIndex++] ??= { current: initial });
    },
    useCats() {
      return catContext;
    },
  };

  vm.runInNewContext(outputText, context, { filename: sourcePath });

  return (sensor, options) => {
    refIndex = 0;
    context.module.exports.useRfidVisitTracker(sensor, options);
  };
}

test("does not replay old alerts and announces an exit only after its session is saved", () => {
  const notifications = [];
  const catContext = {
    cats: [{ id: "cat-1", name: "Milo" }],
    catDetails: { "cat-1": { rfidTag: "ABCD" } },
    sessions: [],
  };
  const tracker = loadUseRfidVisitTracker(catContext);
  const options = { addNotification: async (value) => { notifications.push(value); } };
  const old = { online: true, sessionActive: false, rfidHex: "ABCD",
    completedSessionCount: 1, lastSessionStatus: "NORMAL",
    lastSessionDurationMs: 32000, lastSessionEndMs: Date.parse("2026-09-28T14:11:42.808Z") };
  tracker(old, options);
  assert.equal(notifications.length, 0, "an old completion must not alert on page load");

  const active = { ...old, sessionActive: true, activeRfidHex: "ABCD",
    activeSessionStartMs: Date.parse("2026-10-01T10:00:00.000Z") };
  tracker(active, options);
  tracker(active, options);
  assert.equal(notifications.length, 1, "a new entry alerts once");

  const complete = { ...old, completedSessionCount: 2,
    lastSessionEndMs: Date.parse("2026-10-01T10:00:32.000Z") };
  tracker(complete, options);
  assert.equal(notifications.length, 1, "a missing session must not produce an exit alert");
  catContext.sessions = [{ catId: "cat-1", durationSecs: 32,
    endedAt: "2026-10-01T10:00:32.000Z", sessionStatus: "NORMAL" }];
  tracker(complete, options);
  tracker(complete, options);
  assert.equal(notifications.length, 2);
  assert.match(notifications[1].title, /left/);
});

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
