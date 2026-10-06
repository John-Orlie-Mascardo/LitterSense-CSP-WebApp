import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness(permission = 'default') {
  const slots = []; const pending = []; const focus = {};
  let index = 0; let user = { uid: 'owner', getIdToken: async () => 'auth' };
  let fail = false; let tokenCalls = 0; let prompts = 0;
  const notification = { permission, requestPermission: async () => { prompts++; notification.permission = 'granted'; return 'granted'; } };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react: {
      useState(value) { const at = index++; slots[at] ??= { value }; return [slots[at].value, next => { slots[at].value = next; }]; },
      useEffect(effect, deps) { const at = index++; const previous = slots[at]; if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) { previous?.cleanup?.(); pending.push(() => { slots[at].cleanup = effect(); }); slots[at] = { deps }; } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/utils/firebaseMessaging': { getFirebaseMessagingToken: async () => { tokenCalls++; if (fail) throw Error('Registration unavailable'); return 'registered-token'; } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./PushNotifications.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => imports[name], Notification: notification,
    navigator: { userAgent: 'Chrome Android' },
    window: { Notification: notification, matchMedia: () => ({ matches: false }), addEventListener: (name, fn) => { focus[name] = fn; }, removeEventListener: name => { delete focus[name]; } },
    fetch: async () => Response.json({ queued: true }), console,
  });
  const nodes = (tree) => [tree, ...[tree?.props?.children].flat(2).filter(value => value && typeof value === 'object').flatMap(nodes)];
  return {
    get tokenCalls() { return tokenCalls; }, get prompts() { return prompts; },
    set fail(value) { fail = value; }, set user(value) { user = value; },
    notification,
    async render() { index = 0; exports.PushNotificationSettings(); pending.splice(0).forEach(effect => effect()); await setImmediate(); index = 0; return nodes(exports.PushNotificationSettings()); },
  };
}

test('push setup waits for a tap and contains no test controls', async () => {
  const h = harness();
  let tree = await h.render();
  assert.equal(h.prompts, 0); assert.equal(h.tokenCalls, 0);
  const find = (nodes, label) => nodes.find(node => node.type === 'button' && node.props.children === label);
  assert.equal(find(tree, 'Send test push'), undefined);
  await find(tree, 'Enable push notifications').props.onClick();
  tree = await h.render();
  assert.equal(h.prompts, 1);
  assert.equal(find(tree, 'Enable push notifications'), undefined);
  assert.ok(tree.some(node => node.props?.children === 'Notifications enabled on this device'));
  assert.equal(tree.find(node => node.type === 'details'), undefined);
  assert.equal(find(tree, 'Send test push'), undefined);
});

test('already permitted devices verify registration; failed registration and another account never show enabled', async () => {
  const h = harness('granted');
  h.fail = true;
  let tree = await h.render();
  assert.equal(h.prompts, 0);
  assert.ok(!tree.some(node => node.props?.children === 'Notifications enabled on this device'));
  assert.ok(tree.some(node => node.type === 'button' && node.props.children === 'Enable push notifications'));
  h.fail = false;
  await tree.find(node => node.type === 'button' && node.props.children === 'Enable push notifications').props.onClick();
  tree = await h.render();
  assert.ok(tree.some(node => node.props?.children === 'Notifications enabled on this device'));
  h.user = { uid: 'another-owner', getIdToken: async () => 'auth' }; h.fail = true;
  tree = await h.render();
  assert.ok(!tree.some(node => node.props?.children === 'Notifications enabled on this device'));
  const permitted = harness('granted');
  tree = await permitted.render();
  assert.equal(permitted.prompts, 0); assert.equal(permitted.tokenCalls, 1);
  assert.ok(tree.some(node => node.props?.children === 'Notifications enabled on this device'));
});
