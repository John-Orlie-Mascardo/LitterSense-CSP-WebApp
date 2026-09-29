const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const ts = require("typescript");

test("closing unlocks the form and an old attempt cannot reset a retry", () => {
  const state = [];
  let cleanup;
  const react = {
    useRef: (value) => ({ current: value }),
    useState: (value) => {
      const index = state.push(value) - 1;
      return [value, (next) => { state[index] = next; }];
    },
    useEffect: (effect) => { cleanup = effect(); },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync("lib/hooks/usePhotoUpload.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function("exports", "require", code)(exports, () => react);
  const hook = exports.usePhotoUpload();
  const first = hook.begin();
  first.onProgress(25);
  assert.deepEqual(state, [true, 25]);
  hook.cancel();
  assert.equal(first.signal.aborted, true);
  assert.deepEqual(state, [false, null]);
  const retry = hook.begin();
  first.onProgress(100);
  first.finish();
  assert.deepEqual(state, [true, null]);
  retry.onProgress(50);
  retry.finish();
  assert.deepEqual(state, [false, null]);
  const last = hook.begin();
  cleanup();
  assert.equal(last.signal.aborted, true);
});
