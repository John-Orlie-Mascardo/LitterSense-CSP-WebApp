import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(cache = {}) {
  const instances = new Map(), children = new Map(), effects = [], microtasks = [];
  const listeners = [], writes = [], storage = new Map(Object.entries(cache)), consumers = new Set();
  let current, user = { uid: 'owner' }, context;
  const dispose = id => {
    for (const [key, instance] of instances) if (key === id || key.startsWith(`${id}/`)) {
      instance.cleanups.forEach(cleanup => cleanup?.());
      instances.delete(key);
    }
  };
  const run = (id, work) => {
    const previous = current;
    if (!instances.has(id)) instances.set(id, { slots: [], cleanups: [] });
    current = { id, instance: instances.get(id), index: 0 };
    try { return work(); } finally { current = previous; }
  };
  const react = {
    createContext: initial => ({ value: initial, Provider: 'settings-provider' }),
    createElement(type, props, ...nested) {
      if (type === 'settings-provider') { context.value = props.value; return nested[0] ?? props.children; }
      if (typeof type !== 'function') return null;
      const parent = current.id, id = `${parent}/${type.name}:${props.key ?? ''}`;
      if (children.has(parent) && children.get(parent) !== id) dispose(children.get(parent));
      children.set(parent, id);
      return run(id, () => type({ ...props, children: nested[0] ?? props.children }));
    },
    useContext: value => value.value,
    useState(initial) {
      const { instance, index } = current; current.index++;
      if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [instance.slots[index], next => { instance.slots[index] = typeof next === 'function' ? next(instance.slots[index]) : next; }];
    },
    useEffect(work, deps) {
      const { instance, index } = current; current.index++;
      if (!instance.slots[index] || deps.some((value, i) => !Object.is(value, instance.slots[index][i]))) {
        instance.slots[index] = deps;
        effects.push(() => { instance.cleanups[index]?.(); instance.cleanups[index] = work(); });
      }
    },
    useCallback: work => work,
    useRef(initial) {
      const { instance, index } = current; current.index++;
      return instance.slots[index] ??= { current: initial };
    },
  };
  const createContext = react.createContext;
  react.createContext = initial => (context = createContext(initial));
  const api = {}, client = {
    doc: (_db, ...parts) => ({ path: parts.join('/') }),
    serverTimestamp: () => 'server-time',
    onSnapshot(ref, ...args) {
      const [next, error] = args.filter(value => typeof value === 'function');
      const listener = { path: ref.path, next, error, active: true };
      listeners.push(listener);
      return () => { listener.active = false; };
    },
    setDoc: async (ref, data, options) => { writes.push({ path: ref.path, data, options }); },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./useSettings.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: api, require: name => name === 'react' ? react : name.endsWith('/operationalClient') ? client
      : name.endsWith('/firebase') ? { db: {} } : name.endsWith('/AuthContext') ? { useAuth: () => ({ user }) }
        : (() => { throw new Error(`Unexpected import: ${name}`); })(),
    queueMicrotask: callback => microtasks.push(callback), window: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    console: { error() {} },
  });
  const root = () => run('root', () => api.SettingsProvider ? api.SettingsProvider({ children: null }) : api.useSettings());
  const consumer = name => { consumers.add(name); return run(name, () => api.useSettings()); };
  const flush = () => {
    for (let i = 0; i < 4; i++) {
      effects.splice(0).forEach(work => work());
      microtasks.splice(0).forEach(work => work());
      root(); consumers.forEach(consumer);
    }
  };
  root();
  return { root, consumer, flush, listeners, writes, storage,
    commit: () => effects.splice(0).forEach(work => work()),
    drainMicrotasks: () => microtasks.splice(0).forEach(work => work()),
    emit: (listener, notifications, fromCache = false) => listener.next({ exists: () => notifications !== null, data: () => notifications, metadata: { fromCache } }),
    navigate() { dispose('settings'); consumers.delete('settings'); },
    user(next) { user = next; root(); },
    unmount() { for (const id of [...instances.keys()]) dispose(id); },
  };
}

test('saved RFID preference is already enabled on the first render after Settings navigation', () => {
  const h = harness(); h.flush();
  h.emit(h.listeners[0], { rfidVisitAlerts: true }); h.flush();
  let page = h.consumer('settings');
  assert.equal(page.settings.notifications.rfidVisitAlerts, true);
  h.flush(); h.navigate();
  page = h.consumer('settings');
  assert.equal(page.settings.notifications.rfidVisitAlerts, true);
  assert.equal(page.isLoaded, true);
  assert.equal(h.writes.length, 0);
});

test('settings consumers share one listener and edits without another navigation read', () => {
  const h = harness(); h.flush(); h.emit(h.listeners[0], { rfidVisitAlerts: true }); h.flush();
  h.consumer('notifications'); h.consumer('bridge'); h.consumer('settings'); h.flush();
  assert.equal(h.listeners.filter(listener => listener.active).length, 1);
  h.consumer('settings').updateNotificationSetting('rfidVisitAlerts', false); h.flush();
  assert.equal(h.consumer('notifications').settings.notifications.rfidVisitAlerts, false);
  assert.equal(h.consumer('bridge').settings.notifications.rfidVisitAlerts, false);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].path, 'users/owner/settings/notifications');
  assert.equal(h.writes[0].data.rfidVisitAlerts, false);
  h.navigate(); assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  assert.equal(h.listeners.length, 1);
});

test('an uncached or corrupt preference stays unknown until a successful remote read', () => {
  for (const cached of [undefined, '{broken', '{}', '{"notifications":{"rfidVisitAlerts":"true"}}']) {
    const h = harness(cached ? { 'littersense_settings:owner': cached } : {}); h.flush();
    assert.equal(h.consumer('settings').isLoaded, false);
    h.listeners[0].error(new Error('offline')); h.flush();
    assert.equal(h.consumer('settings').isLoaded, false);
    assert.equal(h.storage.get('littersense_settings:owner'), cached);
    assert.equal(h.writes.length, 0);
    h.emit(h.listeners[0], null); h.flush();
    assert.equal(h.consumer('settings').isLoaded, true);
    assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  }
});

test('account changes hide prior settings immediately and discard old listener callbacks', () => {
  const h = harness(); h.flush(); const old = h.listeners[0];
  h.emit(old, { rfidVisitAlerts: true }); h.flush();
  h.consumer('settings');
  h.user({ uid: 'other' });
  assert.equal(h.consumer('settings').isLoaded, false);
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  h.flush(); assert.equal(old.active, false);
  h.emit(old, { rfidVisitAlerts: true }); h.flush();
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  assert.equal(h.storage.has('littersense_settings:other'), false);
  h.emit(h.listeners.at(-1), { rfidVisitAlerts: false }); h.flush();
  h.user(null);
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  h.flush(); assert.equal(h.listeners.filter(listener => listener.active).length, 0);
});

test('queued cache hydration cannot subscribe after the provider unmounts', () => {
  const h = harness({ 'littersense_settings:owner': JSON.stringify({ notifications: { rfidVisitAlerts: true } }) });
  h.commit(); h.unmount(); h.drainMicrotasks();
  assert.equal(h.listeners.length, 0);
});

test('valid owner cache survives same-owner authentication refresh and remote reconciliation', () => {
  const h = harness({ 'littersense_settings:owner': JSON.stringify({ notifications: { rfidVisitAlerts: true } }) });
  h.flush(); assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, true);
  assert.equal(h.consumer('settings').isLoaded, true);
  h.user({ uid: 'owner' });
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, true);
  h.flush(); assert.equal(h.listeners.length, 1);
  h.emit(h.listeners[0], { rfidVisitAlerts: false }); h.flush();
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, false);
  assert.equal(h.writes.length, 0);
});

test('a missing legacy offline cache is not treated as a confirmed disabled preference', () => {
  const h = harness(); h.flush();
  h.emit(h.listeners[0], null, true); h.flush();
  assert.equal(h.consumer('settings').isLoaded, false);
  h.emit(h.listeners[0], { rfidVisitAlerts: true }, false); h.flush();
  assert.equal(h.consumer('settings').isLoaded, true);
  assert.equal(h.consumer('settings').settings.notifications.rfidVisitAlerts, true);
});
