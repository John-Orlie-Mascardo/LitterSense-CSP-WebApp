import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

const origin = 'https://littersense.test';
function controlledTimers() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.due <= now) { timers.delete(id); timer.callback(); }
      }
    },
    get pending() { return timers.size; },
  };
}

function fixture({ existingWorker = 'missing', stalledRegister = false, controlledClock = false, invalidReadyWorker = false } = {}) {
  const calls = [];
  const shown = [];
  const timers = controlledTimers();
  let activate;
  let token = 'old-device';
  let failRemove = false;
  const worker = { state: 'activating', scriptURL: `${origin}/sw.js` };
  const registration = {
    scope: `${origin}/`, active: worker,
    showNotification: async (title, options) => { calls.push(`show:${title}`); shown.push({ title, options }); },
  };
  let existingRegistration = null;
  if (existingWorker === 'active') {
    worker.state = 'activated';
    existingRegistration = registration;
  } else if (existingWorker === 'inactive') {
    existingRegistration = registration;
  } else if (existingWorker === 'wrong-script') {
    existingRegistration = {
      scope: `${origin}/`,
      active: { state: 'activated', scriptURL: `${origin}/unrelated-worker.js` },
      showNotification: async () => { throw new Error('Used an unrelated worker'); },
    };
  } else if (existingWorker === 'wrong-scope') {
    existingRegistration = {
      scope: `${origin}/another-app/`,
      active: { state: 'activated', scriptURL: `${origin}/sw.js` },
      showNotification: async () => { throw new Error('Used another app scope'); },
    };
  }
  const ready = new Promise(resolve => {
    activate = () => {
      worker.state = 'activated';
      if (invalidReadyWorker) worker.scriptURL = `${origin}/unrelated-worker.js`;
      resolve(registration);
    };
  });
  const auth = { currentUser: { uid: 'owner', getIdToken: async () => 'auth' } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./firebaseMessaging.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    require: name => name === 'firebase/messaging' ? {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async (_messaging, options) => {
        calls.push('token');
        assert.equal(options.serviceWorkerRegistration, registration);
        assert.equal(registration.active.state, 'activated');
        return token;
      },
      deleteToken: async () => { calls.push('delete'); token = 'new-device'; return true; },
    } : { auth, app: {} },
    navigator: { serviceWorker: {
      register: async () => {
        calls.push('register');
        return stalledRegister ? new Promise(() => {}) : registration;
      },
      ready,
      getRegistration: async () => { calls.push('lookup'); return existingRegistration; },
    } },
    location: { origin, href: `${origin}/dashboard/settings` }, URL,
    Notification: { permission: 'granted' },
    process: { env: { NEXT_PUBLIC_FIREBASE_VAPID_KEY: 'public-key' } },
    fetch: async (_url, init) => {
      const data = JSON.parse(init.body);
      calls.push(`${data.remove ? 'remove' : 'save'}:${data.token}`);
      return Response.json({}, { status: failRemove && data.remove ? 503 : 200 });
    },
    Response, AbortSignal,
    setTimeout: controlledClock ? timers.setTimeout : setTimeout,
    clearTimeout: controlledClock ? timers.clearTimeout : clearTimeout,
    console,
  });
  return { api: exports, calls, shown, activate, auth, timers, set failRemove(value) { failRemove = value; } };
}

test('push enrollment waits for activation when no existing worker is installed', async () => {
  const f = fixture();
  const pending = f.api.getFirebaseMessagingToken();
  await setImmediate();
  assert.ok(f.calls.includes('register'));
  assert.ok(!f.calls.includes('token'));
  f.activate();
  assert.equal(await pending, 'old-device');
  assert.ok(f.calls.indexOf('register') < f.calls.indexOf('token'));
  assert.ok(f.calls.includes('save:old-device'));
});

test('reconnect replaces only the current device token after removing its previous registration', async () => {
  const f = fixture();
  f.activate();
  assert.equal(await f.api.reconnectFirebaseMessagingToken(), 'new-device');
  assert.ok(f.calls.indexOf('remove:old-device') < f.calls.indexOf('delete'));
  assert.ok(f.calls.includes('save:new-device'));
});

test('failed registration removal leaves the device subscription intact for a retry', async () => {
  const f = fixture();
  f.activate();
  f.failRemove = true;
  await assert.rejects(f.api.reconnectFirebaseMessagingToken(), /Unable to/);
  assert.ok(!f.calls.includes('delete'));
});

test('a local system notification check uses an activated worker without sending a server push', async () => {
  const f = fixture();
  f.activate();
  await f.api.checkSystemNotification();
  assert.ok(f.calls.includes('show:LitterSense notification check'));
  assert.ok(!f.calls.includes('token'));
  assert.ok(!f.calls.some(value => value.startsWith('save:')));
  assert.equal(f.shown[0].options.tag, 'littersense-local-check');
  assert.equal(f.shown[0].options.renotify, true, 'Repeating the explicit local display check must re-alert');
});

test('an installed activated LitterSense worker displays immediately while registration updates and ready are stalled', async () => {
  const f = fixture({ existingWorker: 'active', stalledRegister: true, controlledClock: true });
  let settled = false;
  const pending = f.api.checkSystemNotification().then(() => { settled = true; });
  await setImmediate();
  assert.ok(f.calls.includes('show:LitterSense notification check'), 'An existing active worker must display without a registration network wait');
  assert.equal(settled, true);
  assert.ok(!f.calls.includes('register'));
  assert.ok(!f.calls.includes('token'));
  assert.ok(!f.calls.some(value => value.startsWith('save:')));
  await pending;
  assert.equal(f.timers.pending, 0);
});

test('token enrollment reuses the installed activated LitterSense worker without waiting on ready', async () => {
  const f = fixture({ existingWorker: 'active', stalledRegister: true, controlledClock: true });
  let settled = false;
  const pending = f.api.getFirebaseMessagingToken().then(token => { settled = true; return token; });
  await setImmediate();
  assert.equal(settled, true);
  assert.ok(!f.calls.includes('register'));
  assert.equal(await pending, 'old-device');
  assert.ok(f.calls.includes('save:old-device'));
  assert.equal(f.timers.pending, 0);
});

for (const existingWorker of ['missing', 'inactive', 'wrong-script', 'wrong-scope']) {
  test(`a ${existingWorker} worker requires LitterSense registration and activation before local display`, async () => {
    const f = fixture({ existingWorker, controlledClock: true });
    const pending = f.api.checkSystemNotification();
    await setImmediate();
    assert.ok(f.calls.includes('register'));
    assert.ok(!f.calls.some(value => value.startsWith('show:')));
    f.activate();
    await pending;
    assert.ok(f.calls.includes('show:LitterSense notification check'));
    assert.equal(f.timers.pending, 0);
  });
}

test('a ready registration for an unrelated script cannot display the local check', async () => {
  const f = fixture({ invalidReadyWorker: true, controlledClock: true });
  const pending = assert.rejects(f.api.checkSystemNotification(), /setup.*incomplete/i);
  await setImmediate();
  assert.ok(f.calls.includes('register'));
  f.activate();
  await pending;
  assert.ok(!f.calls.some(value => value.startsWith('show:')));
  assert.equal(f.timers.pending, 0);
});

test('the total setup deadline covers a stalled service worker registration request', async () => {
  const f = fixture({ stalledRegister: true, controlledClock: true });
  let error;
  const pending = f.api.checkSystemNotification().catch(value => { error = value; });
  await setImmediate();
  assert.ok(f.calls.includes('register'));
  f.timers.advance(14999);
  await setImmediate();
  assert.equal(error, undefined);
  f.timers.advance(1);
  await setImmediate();
  assert.match(error?.message ?? '', /setup took too long/i);
  assert.ok(!f.calls.some(value => value.startsWith('show:')));
  await pending;
  assert.equal(f.timers.pending, 0);
});

test('device off preference survives reload and prevents automatic token enrollment', async () => {
  const storage = new Map(); const exports = {};
  const context = { exports, require: () => ({}), localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  const source = ts.transpileModule(readFileSync(new URL('./firebaseMessaging.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, context);
  exports.setDevicePushDisabled(true);
  assert.equal(await exports.getFirebaseMessagingToken(), null);
  const reloaded = {}; vm.runInNewContext(source, { ...context, exports: reloaded });
  assert.equal(reloaded.devicePushDisabled(), true);
  reloaded.setDevicePushDisabled(false); assert.equal(reloaded.devicePushDisabled(), false);
});
