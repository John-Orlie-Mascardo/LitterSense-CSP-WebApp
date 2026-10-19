import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness(permission = 'default') {
  let slots = []; const pending = []; const focus = {};
  let index = 0; let user = { uid: 'owner', getIdToken: async () => 'auth' };
  let fail = false; let tokenCalls = 0; let prompts = 0; let repairs = 0; let checks = 0; let clock = 10000; let disabled = false; let removals = 0;
  let registeredOwner = null; let nextToken; let nextPermission; let nextRemoval; let preferenceWrites = 0; let preferenceRevision = 0;
  const notification = { permission, requestPermission: async () => { prompts++; const result = nextPermission ? await nextPermission : 'granted'; nextPermission = undefined; notification.permission = result; return result; } };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: {
      useState(value) { const at = index++; slots[at] ??= { value: typeof value === 'function' ? value() : value }; return [slots[at].value, next => { slots[at].value = typeof next === 'function' ? next(slots[at].value) : next; }]; },
      useRef(value) { const at = index++; slots[at] ??= { current: value }; return slots[at]; },
      useEffect(effect, deps) { const at = index++; const previous = slots[at]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { previous?.cleanup?.(); pending.push(() => { slots[at].cleanup = effect(); }); slots[at] = { deps }; } },
    },
    '@/components/ui/Toggle': { Toggle: 'Toggle' },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/utils/firebaseMessaging': { getFirebaseMessagingRegistrationOwner: () => !disabled && notification.permission === 'granted' && registeredOwner === user?.uid ? registeredOwner : null, devicePushDisabled: () => disabled, setDevicePushDisabled: value => { const previous = disabled; const owner = user?.uid; const revision = ++preferenceRevision; disabled = value; preferenceWrites++; return () => { if (revision === preferenceRevision && owner === user?.uid) { disabled = previous; preferenceWrites++; preferenceRevision++; } }; }, unregisterFirebaseMessagingToken: async () => { removals++; if (nextRemoval) await nextRemoval; if (fail) throw Error('Removal unavailable'); registeredOwner = null; }, reconnectFirebaseMessagingToken: async () => { repairs++; if (fail) throw Error('Registration unavailable'); return 'new-device'; }, checkSystemNotification: async () => { checks++; clock += 2300; }, getFirebaseMessagingToken: async () => { tokenCalls++; const owner = user?.uid; const wait = nextToken; nextToken = undefined; if (wait) await wait; if (fail) throw Error('Registration unavailable'); registeredOwner = owner; return 'registered-token'; } },
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
    get disabled() { return disabled; }, get removals() { return removals; }, async focus() { await focus.focus?.(); }, get tokenCalls() { return tokenCalls; }, get repairs() { return repairs; }, get checks() { return checks; }, get prompts() { return prompts; }, get preferenceWrites() { return preferenceWrites; },
    set fail(value) { fail = value; }, set user(value) { user = value; },
    notification,
    deferToken() { let resolve; nextToken = new Promise(done => { resolve = done; }); return resolve; },
    deferPermission() { let resolve; nextPermission = new Promise(done => { resolve = done; }); return resolve; },
    deferRemoval() { let resolve; nextRemoval = new Promise(done => { resolve = done; }); return resolve; },
    tree() { index = 0; return nodes(exports.PushNotificationSettings()); },
    remount() { slots.forEach(slot => slot.cleanup?.()); slots = []; pending.length = 0; },
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

test('unknown registration shows checking until verification finishes', async () => {
  const h = harness('granted'); const resolve = h.deferToken();
  let tree = await h.render();
  assert.equal(toggle(tree), undefined, 'An unverified device must not display an off switch');
  assert.ok(tree.some(node => /Checking notification/.test(node.props?.children)));
  resolve(); await setImmediate(); tree = await h.render();
  assert.equal(toggle(tree).props.checked, true);
  assert.equal(h.prompts, 0);
});

test('verified device stays enabled across route remount and a failed refresh', async () => {
  const h = harness('granted'); await h.render(); h.remount();
  const resolve = h.deferToken();
  assert.equal(toggle(h.tree()).props.checked, true, 'A route remount must retain the verified owner');
  let tree = await h.render();
  assert.equal(toggle(tree).props.checked, true);
  h.fail = true; resolve(); await setImmediate(); tree = await h.render();
  assert.equal(toggle(tree).props.checked, true, 'A failed refresh does not unregister the device');
  assert.equal(h.removals, 0);
  assert.ok(tree.some(node => node.props?.children === 'Registration unavailable'));
});

test('cached registration never enables a different account or revoked permission', async () => {
  const h = harness('granted'); await h.render(); h.remount();
  h.user = { uid: 'other' }; const resolve = h.deferToken();
  let tree = await h.render();
  assert.equal(toggle(tree), undefined, 'The next owner must verify their own registration');
  resolve(); await setImmediate(); await h.render(); h.remount();
  h.notification.permission = 'denied'; tree = await h.render();
  assert.equal(toggle(tree).props.checked, false);
});

test('a late verification result cannot turn a device back on after disabling', async () => {
  const h = harness('granted'); let tree = await h.render();
  const resolve = h.deferToken(); const refresh = h.focus();
  toggle(tree).props.onChange(false); await setImmediate(); tree = await h.render();
  assert.equal(toggle(tree).props.checked, false);
  resolve(); await refresh; tree = await h.render();
  assert.equal(toggle(tree).props.checked, false);
  assert.equal(h.disabled, true);
  assert.equal(h.removals, 1);
});

test('an account change while the permission prompt is open cancels the old enable', async () => {
  const h = harness(); const tree = await h.render(); const resolve = h.deferPermission();
  toggle(tree).props.onChange(true); h.user = { uid: 'other' }; await h.render();
  resolve('granted'); await setImmediate(); await h.render();
  assert.equal(h.tokenCalls, 0, 'The previous owner cannot start registration for the new account');
  assert.equal(h.preferenceWrites, 0);
});

test('disabling a cached device during route verification settles on the off control', async () => {
  const h = harness('granted'); await h.render(); h.remount();
  const resolve = h.deferToken(); let tree = await h.render();
  toggle(tree).props.onChange(false); await setImmediate(); tree = await h.render();
  assert.ok(toggle(tree), 'A completed disable must leave an available switch');
  assert.equal(toggle(tree).props.checked, false);
  resolve(); await setImmediate();
});

test('permission revoked during verification cannot finish with an enabled switch', async () => {
  const h = harness('granted'); const resolve = h.deferToken(); await h.render();
  h.notification.permission = 'denied'; resolve(); await setImmediate();
  assert.equal(toggle(await h.render()).props.checked, false);
});

test('failed disable after route unmount restores the saved device preference', async () => {
  const h = harness('granted'); const tree = await h.render(); const resolve = h.deferRemoval();
  toggle(tree).props.onChange(false); await setImmediate(); h.remount();
  h.fail = true; resolve(); await setImmediate();
  assert.equal(h.disabled, false, 'A rejected removal must restore the persistent device state after navigation');
  assert.equal(toggle(await h.render()).props.checked, true);
});
