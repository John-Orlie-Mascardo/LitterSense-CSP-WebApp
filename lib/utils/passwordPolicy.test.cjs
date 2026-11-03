const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadPolicy() {
  const source = readFileSync(path.join(__dirname, "passwordPolicy.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const sandboxModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require,
  });
  return sandboxModule.exports;
}

const {
  PASSWORD_POLICY_MESSAGE,
  getMissingPasswordRules,
  getPasswordRuleStatuses,
  isPasswordPolicySatisfied,
} = loadPolicy();

test("reports every missing rule for an empty password", () => {
  assert.deepEqual(
    Array.from(getMissingPasswordRules("")),
    ["minimumLength", "uppercase", "lowercase", "number", "special"],
  );
});

test("accepts a password only when all six requirements are met", () => {
  assert.equal(isPasswordPolicySatisfied("Strong1!"), true);
  assert.equal(getMissingPasswordRules("Strong1!").length, 0);
  assert.equal(getPasswordRuleStatuses("Strong1!").every((rule) => rule.met), true);
});

test("reports each character-class requirement independently", () => {
  assert.deepEqual(Array.from(getMissingPasswordRules("strong1!")), ["uppercase"]);
  assert.deepEqual(Array.from(getMissingPasswordRules("STRONG1!")), ["lowercase"]);
  assert.deepEqual(Array.from(getMissingPasswordRules("Strong!!")), ["number"]);
  assert.deepEqual(Array.from(getMissingPasswordRules("Strong12")), ["special"]);
  assert.deepEqual(Array.from(getMissingPasswordRules("Strong1 ")), ["special"]);
});

test("enforces the inclusive 8 to 128 character length range", () => {
  assert.equal(isPasswordPolicySatisfied("Aa1!aaaa"), true);
  assert.equal(isPasswordPolicySatisfied(`Aa1!${"a".repeat(124)}`), true);
  assert.deepEqual(Array.from(getMissingPasswordRules("Aa1!aaa")), ["minimumLength"]);
  assert.deepEqual(
    Array.from(getMissingPasswordRules(`Aa1!${"a".repeat(125)}`)),
    ["maximumLength"],
  );
});

test("exports the shared plain-language validation message", () => {
  assert.equal(
    PASSWORD_POLICY_MESSAGE,
    "Password must have at least 8 characters, an uppercase letter, a lowercase letter, a number and a special character.",
  );
});
