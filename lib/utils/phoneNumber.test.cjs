const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getNationalPhoneNumber,
  normalizePhoneNumber,
} = require("./phoneNumber.ts");

test("normalizes a Philippine local number to E.164", () => {
  assert.equal(normalizePhoneNumber("+63", "0917 123 4567"), "+639171234567");
});

test("keeps an optional phone number empty", () => {
  assert.equal(normalizePhoneNumber("+63", ""), "");
});

test("rejects a phone number outside the E.164 digit limit", () => {
  assert.throws(() => normalizePhoneNumber("+63", "123"), /valid phone number/i);
});

test("extracts the editable local number from a saved number", () => {
  assert.equal(getNationalPhoneNumber("+639171234567", "+63"), "9171234567");
});

test("profile combines +63 with ten digits without doubling an international number", () => {
  for (const input of ["9455892468", "09455892468", "+639455892468"]) {
    assert.equal(normalizePhoneNumber("+63", input), "+639455892468");
  }
  for (const input of ["8123456789", "912345678", "91234567890"]) {
    assert.throws(() => normalizePhoneNumber("+63", input), /Philippine mobile/);
  }
});
