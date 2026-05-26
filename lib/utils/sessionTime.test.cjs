const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatSessionTimeLabel,
  getSessionSortValue,
} = require("./sessionTime.ts");

test("formats session time from endedAt instead of stored time", () => {
  const original = Date.prototype.toLocaleTimeString;
  const calls = [];

  Date.prototype.toLocaleTimeString = function toLocaleTimeString(locale, options) {
    calls.push({ locale, options, iso: this.toISOString() });
    return "12:19 PM";
  };

  try {
    const result = formatSessionTimeLabel({
      endedAt: "2026-05-26T12:19:00.000Z",
      time: "4:19 AM",
    });

    assert.equal(result, "12:19 PM");
    assert.equal(calls[0].iso, "2026-05-26T12:19:00.000Z");
  } finally {
    Date.prototype.toLocaleTimeString = original;
  }
});

test("falls back to stored time when no endedAt exists", () => {
  assert.equal(
    formatSessionTimeLabel({
      time: "4:19 AM",
    }),
    "4:19 AM",
  );
});

test("sorts sessions by endedAt when available", () => {
  assert.equal(
    getSessionSortValue({
      date: "2026-05-26",
      time: "4:19 AM",
      endedAt: "2026-05-26T12:19:00.000Z",
    }),
    Date.parse("2026-05-26T12:19:00.000Z"),
  );
});
