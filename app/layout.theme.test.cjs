const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("app/layout.tsx", "utf8");
const script = source.match(/const THEME_INIT_SCRIPT = `([^`]+)`;/)?.[1];

function runScript({ stored, systemDark = false, storageThrows = false }) {
  const classes = new Set();
  const documentElement = { classList: { add: (name) => classes.add(name) }, style: {} };
  vm.runInNewContext(script, {
    localStorage: {
      getItem: (key) => {
        if (storageThrows) throw new Error("blocked");
        return key === "theme" ? stored ?? null : null;
      },
    },
    matchMedia: () => ({ matches: systemDark }),
    document: { documentElement },
  });
  return { classes: [...classes], colorScheme: documentElement.style.colorScheme };
}

test("theme script runs in <head> before the body paints", () => {
  assert.ok(script);
  assert.ok(source.indexOf("<head>") < source.indexOf("THEME_INIT_SCRIPT }}"));
  assert.ok(source.indexOf("THEME_INIT_SCRIPT }}") < source.indexOf("<body"));
});

test("saved dark or light theme is applied before React starts", () => {
  assert.deepEqual(runScript({ stored: "dark" }), { classes: ["dark"], colorScheme: "dark" });
  assert.deepEqual(runScript({ stored: "light", systemDark: true }), { classes: ["light"], colorScheme: "light" });
});

test("system or missing theme follows the device setting", () => {
  assert.deepEqual(runScript({ stored: "system", systemDark: true }).classes, ["dark"]);
  assert.deepEqual(runScript({ stored: undefined, systemDark: true }).classes, ["dark"]);
  assert.deepEqual(runScript({ stored: undefined, systemDark: false }).classes, ["light"]);
});

test("unknown values fall back to light and blocked storage never throws", () => {
  assert.deepEqual(runScript({ stored: "sepia", systemDark: true }).classes, ["light"]);
  assert.deepEqual(runScript({ storageThrows: true }).classes, []);
});
