/**
 * SessionTimelineCard.ui.test.mjs
 *
 * UI contracts for recorded-session timeline presentation.
 *
 * DONE: recorded date, central threshold, badge placement, Unattributed display
 * PLACEHOLDER: none
 *
 * NEXT: extend only when the visible timeline contract changes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "SessionTimelineCard.tsx"), "utf8");

test("recent activity session cards show the recorded date", () => {
  assert.match(source, /formatActivityDate/);
  assert.match(source, /const activityDate = formatActivityDate/);
  assert.match(source, /Recorded/);
});

test("session presentation uses the shared resolver", () => {
  assert.match(source, /getSessionDisplayState/);
  assert.doesNotMatch(source, /durationSecs\s*<\s*30/);
});

test("session cards preserve health-state badges and Unattributed presentation", () => {
  assert.match(source, /readonly displayState\?: BehaviorStateId/);
  assert.match(source, /<BehaviorStateBadge state=\{state\} compact/);
  assert.match(source, /Unattributed/);
  assert.match(source, /Detected Session/);
  assert.match(source, /readonly cat: Cat \| null/);
  const sessionTypeIndex = source.indexOf('{cat ? "Litter Box Session" : "Detected Session"}');
  const behaviorBadgeIndex = source.indexOf("<BehaviorStateBadge", sessionTypeIndex);
  assert.doesNotMatch(source, /Short Session|shortSession/);
  assert.ok(sessionTypeIndex >= 0);
  assert.ok(behaviorBadgeIndex > sessionTypeIndex);
  assert.equal(source.match(/<BehaviorStateBadge/g)?.length, 1);
});

test('session cards hide data-quality badges and retain health badges, times and duration', () => {
  const loaded = { exports: {} }, jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': { default: 'img' },
    'lucide-react': { Cat: 'cat', Clock3: 'clock', LogIn: 'in', LogOut: 'out' },
    '@/lib/utils/formatters': { formatDuration: n => `${n}s` },
    '@/components/behavior/BehaviorStateBadge': { BehaviorStateBadge: 'badge' },
    '@/lib/presentation/behaviorStates': { getSessionDisplayState: () => 'incomplete', hasEstablishedBaseline: () => false },
    '@/lib/contexts/CatContext': { useCats: () => ({ getDetailsByCatId: () => ({}) }) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: loaded.exports, require: name => imports[name], Date });
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
  for (const state of ['insufficient', 'incomplete', 'unattributed', 'normal', 'watch', 'abnormal']) {
    const tree = loaded.exports.SessionTimelineCard({ cat: { id: 'cat', name: 'Mochi' }, displayState: state, session: { durationSecs: 44, startedAt: '2026-10-12T13:28:00Z', endedAt: '2026-10-12T13:28:44Z' } });
    const all = nodes(tree);
    assert.equal(all.some(n => n.type === 'badge'), ['normal', 'watch', 'abnormal'].includes(state));
    assert.ok(all.some(n => n.props?.children === 'Litter Box Session'));
    assert.ok(all.some(n => n.props?.children === '44s'));
    assert.ok(all.some(n => typeof n.props?.children === 'string' && /\d+:\d+\s[AP]M/.test(n.props.children)));
  }
});


test("timeouts and reboots never display an invented physical exit", () => {
  const loaded = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/image': {default:'img'},
    'lucide-react': {Cat:'cat',Clock3:'clock',LogIn:'in',LogOut:'out'},
    '@/lib/utils/formatters': {formatDuration:n=>`${n}s`},
    '@/components/behavior/BehaviorStateBadge': {BehaviorStateBadge:'badge'},
    '@/lib/presentation/behaviorStates': {getSessionDisplayState:()=> 'incomplete',hasEstablishedBaseline:()=> false},
    '@/lib/contexts/CatContext': {useCats:()=>({getDetailsByCatId:()=>({})})},
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:loaded.exports,require:name=>imports[name],Date});
  const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree?.props?.children ?? '');
  for (const status of ['NO_EXIT_TIMEOUT','SESSION_INTERRUPTED']) {
    const result = text(loaded.exports.SessionTimelineCard({cat:{id:'cat',name:'Zeno'},session:{sessionStatus:status,durationSecs:900,startedAt:'2026-10-06T01:00:00Z',endedAt:'2026-10-06T01:15:00Z'}}));
    assert.match(result, /Not confirmed/);
    if (status === 'SESSION_INTERRUPTED') { assert.match(result,/Duration unknown/); assert.match(result,/Time uncertain/); }
  }
});

test('last known entry stays visible while waiting for a fresh RFID update', () => {
  const loaded = { exports: {} };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': { default: 'img' },
    'lucide-react': { Cat: 'cat', Clock3: 'clock', LogIn: 'in', LogOut: 'out' },
    '@/lib/utils/formatters': { formatDuration: n => `${n}s` },
    '@/components/behavior/BehaviorStateBadge': { BehaviorStateBadge: 'badge' },
    '@/lib/presentation/behaviorStates': { getSessionDisplayState: () => 'incomplete', hasEstablishedBaseline: () => false },
    '@/lib/contexts/CatContext': { useCats: () => ({ getDetailsByCatId: () => ({}) }) },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: loaded.exports, require: name => imports[name], Date });
  const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree?.props?.children ?? '');
  const props = { cat: { id: 'cat', name: 'Zeno' }, session: { sessionStatus: 'IN_PROGRESS', durationSecs: 30, startedAt: '2026-10-09T08:00:00Z' } };
  assert.match(text(loaded.exports.SessionTimelineCard(props)), /In litter box/);
  const pending = text(loaded.exports.SessionTimelineCard({ ...props, liveUpdatePending: true }));
  assert.match(pending, /Enter/);
  assert.match(pending, /Awaiting RFID update/);
  assert.doesNotMatch(pending, /In litter box/);
});
