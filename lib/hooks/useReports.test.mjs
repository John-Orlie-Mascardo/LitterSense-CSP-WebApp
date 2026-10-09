import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { setImmediate } from 'node:timers/promises';

function harness() {
  const slots = []; const effects = []; const listeners = [];
  let cursor = 0; let user = { uid: 'owner-a' }; let finishDelete;
  const imports = {
    react: {
      useState(value) {
        const at = cursor++;
        slots[at] ??= { value: typeof value === 'function' ? value() : value };
        return [slots[at].value, next => { slots[at].value = typeof next === 'function' ? next(slots[at].value) : next; }];
      },
      useRef(value) { const at = cursor++; slots[at] ??= { current: value }; return slots[at]; },
      useCallback(fn, deps) {
        const at = cursor++;
        if (!slots[at] || deps.some((value, index) => !Object.is(value, slots[at].deps[index]))) slots[at] = { value: fn, deps };
        return slots[at].value;
      },
      useEffect(effect, deps) {
        const at = cursor++;
        if (!slots[at] || deps.some((value, index) => !Object.is(value, slots[at].deps[index]))) {
          slots[at]?.cleanup?.(); slots[at] = { deps };
          effects.push(() => { slots[at].cleanup = effect(); });
        }
      },
    },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/contexts/CatContext': { useCats: () => ({ cats: [], sessions: [], historyLoading: false }) },
    '@/lib/utils/operationalClient': {
      collection: (_db, ...path) => path.join('/'), doc: (_db, ...path) => path.join('/'),
      onSnapshot(path, callback) { const listener = { path, callback, stopped: false }; listeners.push(listener); return () => { listener.stopped = true; }; },
      deleteDoc: () => new Promise(resolve => { finishDelete = resolve; }),
    },
    '@/lib/configs/firebase': { db: {} },
    '@/lib/utils/reportHistory': { normalizePastReport: (id, data) => ({ ...data, id }), sortPastReports: rows => rows },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./useReports.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: name => imports[name] ?? {}, queueMicrotask, console });
  const render = () => { cursor = 0; const value = exports.useReports(); effects.splice(0).forEach(effect => effect()); return value; };
  render();
  return {
    render, listeners,
    set user(value) { user = value; },
    finishDelete() { finishDelete(); },
    publish(index, id, name) {
      const report = { id, catName: name, sessions: [] };
      listeners[index].callback({ docs: [{ id, data: () => ({ catName: name, report }) }] });
      return report;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('a report cannot be generated or archived from history that is still loading', async () => {
  const loaded = { exports: {} };
  let stateWrites = 0, archiveWrites = 0;
  const require = name => {
    if (name === 'react') return { useEffect: () => {}, useCallback: fn => fn, useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => { stateWrites++; }] };
    if (name.includes('AuthContext')) return { useAuth: () => ({ user: { uid: 'owner' } }) };
    if (name.includes('CatContext')) return { useCats: () => ({ cats: [{ id: 'cat-a' }], sessions: [], historyLoading: true }) };
    if (name.includes('operationalClient')) return { setDoc: () => { archiveWrites++; } };
    return {};
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./useReports.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: loaded, exports: loaded.exports, require });
  await assert.rejects(loaded.exports.useReports().generateReport({ catId: 'all', dateRange: '7' }), /Visit history is still loading/);
  assert.equal(stateWrites, 0, 'no incomplete report or generation progress should be published');
  assert.equal(archiveWrites, 0, 'no incomplete report should be saved');
});

test('direct account change immediately hides prior report previews and archives', async () => {
  const h = harness(); h.publish(0, 'old-report', 'Owner A');
  let result = h.render(); assert.equal(result.viewReport('old-report'), true); result = h.render();
  assert.equal(result.currentReport.catName, 'Owner A'); assert.equal(result.pastReports.length, 1);
  h.user = { uid: 'owner-b' }; result = h.render();
  assert.equal(result.currentReport, null, 'old previews must disappear in the account-change render');
  assert.equal(result.pastReports.length, 0, 'old archive rows must disappear before the next account read');
  assert.equal(result.viewReport('old-report'), false);
  await setImmediate(); h.publish(1, 'new-report', 'Owner B'); result = h.render();
  assert.equal(result.pastReports[0].catName, 'Owner B'); assert.equal(result.viewReport('old-report'), false);
});

test('logout hides all report data and discarded listeners cannot restore it', async () => {
  const h = harness(); h.publish(0, 'old-report', 'Owner A'); h.render().viewReport('old-report');
  h.user = null; let result = h.render();
  assert.equal(result.currentReport, null); assert.equal(result.pastReports.length, 0);
  assert.equal(result.viewReport('old-report'), false);
  h.publish(0, 'stale-report', 'Stale A'); await setImmediate(); result = h.render();
  assert.equal(result.currentReport, null); assert.equal(result.pastReports.length, 0);
  assert.equal(result.viewReport('stale-report'), false);
});

test('stale account and unmounted listener callbacks cannot replace the current archive', async () => {
  const h = harness(); h.publish(0, 'old-report', 'Owner A');
  h.user = { uid: 'owner-b' }; h.render(); await setImmediate(); h.publish(1, 'new-report', 'Owner B');
  h.publish(0, 'late-old-report', 'Late A');
  let result = h.render(); assert.equal(result.pastReports[0].catName, 'Owner B');
  assert.equal(result.viewReport('late-old-report'), false);
  h.unmount(); h.publish(1, 'unmounted-report', 'Unmounted B'); result = h.render();
  assert.equal(result.pastReports[0].catName, 'Owner B'); assert.equal(result.viewReport('unmounted-report'), false);
});

test('same-owner profile refresh preserves report previews and the active archive', async () => {
  const h = harness(); h.publish(0, 'saved-report', 'Owner A'); h.render().viewReport('saved-report');
  h.user = { uid: 'owner-a', displayName: 'Updated profile' }; const result = h.render(); await setImmediate();
  assert.equal(result.currentReport.catName, 'Owner A'); assert.equal(result.pastReports.length, 1);
  assert.equal(h.listeners.length, 1, 'a profile object refresh must not reset the owner archive listener');
});

test('old-account deletion completion cannot remove a current account report with the same id', async () => {
  const h = harness(); h.publish(0, 'shared-id', 'Owner A'); const pending = h.render().deleteReport('shared-id');
  h.user = { uid: 'owner-b' }; h.render(); await setImmediate(); h.publish(1, 'shared-id', 'Owner B');
  h.finishDelete(); await pending; const result = h.render();
  assert.equal(result.viewReport('shared-id'), true, 'old delete completion must leave the new owner archive intact');
  assert.equal(h.render().currentReport.catName, 'Owner B');
});

test('previous account preview callbacks cannot restore or report success for an old report', async () => {
  const h = harness(); const oldReport = h.publish(0, 'old-report', 'Owner A'); const old = h.render();
  h.user = { uid: 'owner-b' }; h.render(); await setImmediate(); h.publish(1, 'new-report', 'Owner B');
  assert.equal(old.viewReport('old-report'), false);
  old.setCurrentReport(oldReport);
  const result = h.render(); assert.equal(result.currentReport, null); assert.equal(result.pastReports[0].catName, 'Owner B');
});

test('logout and relogin invalidate a pending delete even for the same owner id', async () => {
  const h = harness(); h.publish(0, 'saved-report', 'First login'); const pending = h.render().deleteReport('saved-report');
  h.user = null; h.render(); await setImmediate(); h.user = { uid: 'owner-a' }; h.render(); await setImmediate();
  h.publish(1, 'saved-report', 'New login'); h.finishDelete(); await pending;
  assert.equal(h.render().viewReport('saved-report'), true);
  assert.equal(h.render().currentReport.catName, 'New login');
});
