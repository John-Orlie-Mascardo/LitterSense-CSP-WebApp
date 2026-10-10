import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness(permission = 'default') {
  const slots = []; const pending = []; const focus = {};
  let index = 0; let user = { uid: 'owner', getIdToken: async () => 'auth' };
  let fail = false; let tokenCalls = 0; let prompts = 0; let repairs = 0; let checks = 0; let clock = 10000; let disabled = false; let removals = 0;
  const notification = { permission, requestPermission: async () => { prompts++; notification.permission = 'granted'; return 'granted'; } };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: {
      useState(value) { const at = index++; slots[at] ??= { value }; return [slots[at].value, next => { slots[at].value = next; }]; },
      useEffect(effect, deps) { const at = index++; const previous = slots[at]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { previous?.cleanup?.(); pending.push(() => { slots[at].cleanup = effect(); }); slots[at] = { deps }; } },
    },
    '@/components/ui/Toggle': { Toggle: 'Toggle' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/utils/firebaseMessaging': { devicePushDisabled: () => disabled, setDevicePushDisabled: value => { disabled = value; }, unregisterFirebaseMessagingToken: async () => { removals++; if (fail) throw Error('Removal unavailable'); }, reconnectFirebaseMessagingToken: async () => { repairs++; if (fail) throw Error('Registration unavailable'); return 'new-device'; }, checkSystemNotification: async () => { checks++; clock += 2300; }, getFirebaseMessagingToken: async () => { tokenCalls++; if (fail) throw Error('Registration unavailable'); return 'registered-token'; } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./PushNotifications.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, Error, require: name => imports[name], Notification: notification, Date: { now: () => clock },
    navigator: { userAgent: 'Chrome Android' },
    window: { Notification: notification, matchMedia: () => ({ matches: false }), addEventListener: (name, fn) => { focus[name] = fn; }, removeEventListener: name => { delete focus[name]; } },
    fetch: async () => Response.json({ queued: true }), console,
  });
  const nodes = (tree) => [tree, ...[tree?.props?.children].flat(2).filter(value => value && typeof value === 'object').flatMap(nodes)];
  return {
    get disabled() { return disabled; }, get removals() { return removals; }, async focus() { await focus.focus?.(); }, get tokenCalls() { return tokenCalls; }, get repairs() { return repairs; }, get checks() { return checks; }, get prompts() { return prompts; },
    set fail(value) { fail = value; }, set user(value) { user = value; },
    notification,
    async render() { index = 0; exports.PushNotificationSettings(); pending.splice(0).forEach(effect => effect()); await setImmediate(); index = 0; return nodes(exports.PushNotificationSettings()); },
  };
}


const toggle = tree => tree.find(node => node.type === 'Toggle');
test('toggle enables on tap and removes reconnect and display controls', async () => {
  const h = harness(); let tree = await h.render();
  assert.equal(h.prompts, 0); assert.equal(toggle(tree).props.checked, false);
  toggle(tree).props.onChange(true); await setImmediate(); tree = await h.render();
  assert.equal(h.prompts, 1); assert.equal(toggle(tree).props.checked, true);
  assert.equal(tree.some(node => ['Reconnect notifications', 'Check system notification'].includes(node.props?.children)), false);
});
test('turning off unregisters only this device and remains off on focus', async () => {
  const h = harness('granted'); let tree = await h.render();
  assert.equal(toggle(tree).props.checked, true);
  toggle(tree).props.onChange(false); await setImmediate(); tree = await h.render();
  assert.equal(h.removals, 1); assert.equal(h.disabled, true); assert.equal(toggle(tree).props.checked, false);
  const calls = h.tokenCalls; await h.focus(); tree = await h.render();
  assert.equal(h.tokenCalls, calls); assert.equal(toggle(tree).props.checked, false);
});
test('failed removal keeps toggle on and reports failure', async () => {
  const h = harness('granted'); let tree = await h.render(); h.fail = true;
  toggle(tree).props.onChange(false); await setImmediate(); tree = await h.render();
  assert.equal(h.disabled, false); assert.equal(toggle(tree).props.checked, true);
  assert.ok(tree.some(node => node.props?.children === 'Removal unavailable'));
});
