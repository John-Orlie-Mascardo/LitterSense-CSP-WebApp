const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isCompleteDobValue,
  parseDobValue,
  resolveDobDraft,
} = require("./dobPicker.ts");

test("keeps a month draft visible before a year is selected", () => {
  const result = resolveDobDraft(parseDobValue(""), { month: "05" });

  assert.deepEqual(result.draft, { year: "", month: "05", day: "" });
  assert.equal(result.value, "");
  assert.equal(isCompleteDobValue(result.value), false);
});

test("keeps a year draft visible before a month is selected", () => {
  const result = resolveDobDraft(parseDobValue(""), { year: "2024" });

  assert.deepEqual(result.draft, { year: "2024", month: "", day: "" });
  assert.equal(result.value, "");
  assert.equal(isCompleteDobValue(result.value), false);
});

test("emits a complete DOB after month and year are selected in either order", () => {
  const monthFirst = resolveDobDraft(
    resolveDobDraft(parseDobValue(""), { month: "05" }).draft,
    { year: "2024" },
  );
  const yearFirst = resolveDobDraft(
    resolveDobDraft(parseDobValue(""), { year: "2024" }).draft,
    { month: "05" },
  );

  assert.equal(monthFirst.value, "2024-05");
  assert.equal(yearFirst.value, "2024-05");
  assert.equal(isCompleteDobValue(monthFirst.value), true);
  assert.equal(isCompleteDobValue(yearFirst.value), true);
});

test("clears an invalid day when the selected month has fewer days", () => {
  const result = resolveDobDraft(parseDobValue("2024-03-31"), {
    month: "04",
  });

  assert.deepEqual(result.draft, { year: "2024", month: "04", day: "" });
  assert.equal(result.value, "2024-04");
});
