import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('hold circle interpolates smoothly, resets on removal and only confirms backend success', () => {
  const path = new URL('./RfidHoldProgress.tsx', import.meta.url);
  let source = '';
  try { source = readFileSync(path, 'utf8'); } catch { /* Missing component must fail this assertion. */ }
  assert.ok(source, 'The registration circle must render reader hold progress');
  const slots = []; let index = 0; const effects = []; let frame; let clock = 0;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => name === 'react' ? {
      useState(value) { const at = index++; slots[at] ??= { value }; return [slots[at].value, value => { slots[at].value = value; }]; },
      useEffect(effect, deps) { const at = index++; const previous = slots[at]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { previous?.cleanup?.(); slots[at] = { deps }; effects.push(() => { slots[at].cleanup = effect(); }); } },
    } : { jsx, jsxs: jsx },
    performance: { now: () => clock }, requestAnimationFrame: callback => { frame = callback; return 1; }, cancelAnimationFrame: () => { frame = undefined; },
  });
  const render = props => { index = 0; exports.RfidHoldProgress(props); effects.splice(0).forEach(fn => fn()); index = 0; return exports.RfidHoldProgress(props); };
  let props = { status: 'holding', holdMs: 1000, tag: 'AABB', sample: 1 };
  let tree = render(props); assert.equal(tree.props['aria-valuenow'], 20);
  clock = 500; frame(); tree = render(props); assert.equal(tree.props['aria-valuenow'], 30);
  clock = 10000; frame(); tree = render(props); assert.ok(tree.props['aria-valuenow'] < 100);
  props = { status: 'ready', holdMs: 0, tag: '', sample: 2 }; tree = render(props); assert.equal(tree.props['aria-valuenow'], 0);
  props = { status: 'verified', holdMs: 5000, tag: 'AABB', sample: 3 }; tree = render(props); assert.equal(tree.props['aria-valuenow'], 100);
});
