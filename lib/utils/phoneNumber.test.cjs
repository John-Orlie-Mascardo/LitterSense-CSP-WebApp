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
