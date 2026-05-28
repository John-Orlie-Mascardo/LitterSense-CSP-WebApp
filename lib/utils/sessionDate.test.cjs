const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getSessionActivityDateKey,
  getSessionLocalDateKey,
  parseDateLike,
  toIsoStringFromDateLike,
} = require("./sessionDate.ts");

test("uses the session end timestamp before the stored date field", () => {
  assert.equal(
    getSessionLocalDateKey({
      date: "2026-05-27",
      endedAt: "2026-05-28T01:15:00.000Z",
    }),
    "2026-05-28",
  );
});

test("activity date follows the actual end timestamp when the stored date is stale", () => {
  assert.equal(
    getSessionActivityDateKey({
      date: "2026-05-27",
      startedAt: "2026-05-28T00:55:00.000Z",
      endedAt: "2026-05-28T01:15:00.000Z",
    }),
    "2026-05-28",
  );
});

test("falls back to a plain stored date when timestamps are missing", () => {
  assert.equal(
    getSessionLocalDateKey({
      date: "2026-05-28",
    }),
    "2026-05-28",
  );
});

test("normalizes Firestore timestamp-like values", () => {
  const timestamp = {
    seconds: 1779926400,
    nanoseconds: 123000000,
  };

  assert.equal(parseDateLike(timestamp).toISOString(), "2026-05-28T00:00:00.123Z");
  assert.equal(toIsoStringFromDateLike(timestamp), "2026-05-28T00:00:00.123Z");
});
