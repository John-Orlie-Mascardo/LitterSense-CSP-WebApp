import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from 'node:module';
const requirePresence = createRequire(import.meta.url)('../utils/sensorPresence.ts');

function mount() {
  let user = { uid: "owner-a", getIdToken: async () => "token-a" };
  let state, context, cleanup, effect, dependency, now = 0, timerId = 0;
  let payload = { online: true, gasUltrasonicOnline: true, sessionActive: false, mq135Raw: 1, mq136Raw: 1 };
  let failure = false, pending, sensorChanged, presenceTick;
  const baseTime = Date.parse('2026-10-09T08:00:00Z');
  class ClockDate extends Date { static now() { return baseTime + now; } }
  const timers = new Map(), listeners = new Map(), requests = [];
  const document = { hidden: false, addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event) => listeners.delete(event) };
  const window = { setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; }, clearTimeout: (id) => timers.delete(id), setInterval: fn => { presenceTick = fn; return -1; }, clearInterval: () => { presenceTick = null; }, addEventListener: document.addEventListener, removeEventListener: document.removeEventListener };
  const react = {
    createContext: () => ({ Provider: "provider" }),
    createElement: (_type, props) => { context = props.value; return context; },
    useContext: () => context,
    useState: (initial) => { state ??= initial; return [state, (next) => { state = typeof next === "function" ? next(state) : next; }]; },
    useEffect: (fn, deps) => { if (dependency !== deps[0]) { cleanup?.(); dependency = deps[0]; effect = fn; } },
  };
  const loadedModule = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(new URL("./useDeviceSensors.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, window, document, AbortController, AbortSignal, Error, Date: ClockDate,
    require: (name) => {
      if (name === "react") return react;
      if (name === "@/lib/contexts/AuthContext") return { useAuth: () => ({ user }) };
      if (name === "@/lib/utils/notificationLive") return { subscribeSensorChanges: fn => { sensorChanged = fn; return () => { sensorChanged = null; }; } };
      if (name === "@/lib/utils/sensorPresence") return requirePresence;
      throw new Error(name);
    },
    fetch: async (_url, options) => {
      requests.push(options);
      if (pending) return pending;
      if (failure) return { ok: false, json: async () => ({ error: "Unable to read device state" }) };
      return { ok: true, json: async () => ({ serverTime: new Date(baseTime + now).toISOString(), rfidUpdatedAt: new Date(baseTime + now).toISOString(), gasUltrasonicUpdatedAt: new Date(baseTime + now).toISOString(), ...payload }) };
    },
  });
  const render = () => {
    loadedModule.exports.DeviceSensorsProvider({ children: null });
    if (effect) { const next = effect; effect = null; cleanup = next(); }
    return loadedModule.exports.useDeviceSensors();
  };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); render(); };
  return {
    requests, render, flush, read: () => loadedModule.exports.useDeviceSensors(),
    interval: () => Math.min(...[...timers.values()].map((timer) => timer.at - now)),
    tick: async () => { const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; timers.delete(id); now = timer.at; timer.fn(); await flush(); },
    visible: async (visible) => { document.hidden = !visible; listeners.get("visibilitychange")?.(); await flush(); },
    payload: (next) => { payload = next; }, failure: (next) => { failure = next; },
    pending: (next) => { pending = next; }, user: (next) => { user = next; },
    changed: async () => { sensorChanged?.(); await flush(); },
    age: async ms => { now += ms; presenceTick?.(); await flush(); },
    reconnect: async () => { listeners.get('online')?.(); await flush(); },
    unmount: () => { cleanup?.(); }, timers, listeners,
  };
}

test('online status expires locally even while the next API read is pending, with server clock skew accounted for', async () => {
  const h = mount();
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: true, serverTime: '2026-10-09T08:01:00Z', rfidUpdatedAt: '2026-10-09T08:01:00Z', gasUltrasonicUpdatedAt: '2026-10-09T08:01:00Z' });
  h.render(); await h.flush(); assert.equal(h.read().data.online, true);
  h.pending(new Promise(() => {})); await h.tick(); const requests = h.requests.length;
  await h.age(14000);
  assert.equal(h.read().data.online, false);
  assert.equal(h.read().data.sessionActive, true, 'stale presence preserves the recorded entry');
  assert.equal(h.read().data.gasUltrasonicOnline, true);
  assert.equal(h.requests.length, requests, 'presence clock creates no requests');
  await h.age(105000);
  assert.equal(h.read().data.gasUltrasonicOnline, false);
  h.unmount();
});

test('restoring internet retries immediately instead of waiting through failure backoff', async () => {
  const h = mount(); h.render(); await h.flush(); h.failure(true);
  for (let i = 0; i < 5; i++) await h.tick();
  const before = h.requests.length;
  h.failure(false); await h.reconnect();
  assert.equal(h.requests.length, before + 1);
  assert.equal(h.read().error, null);
  assert.equal(h.read().data.online, true);
  h.unmount();
});

test("dashboard consumers share one loop with responsive idle, visit, gas and background rates", async () => {
  const h = mount(); h.render(); await h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.read(), h.read(), "consumers receive the same snapshot without extra requests");
  assert.equal(h.interval(), 2000);
  for (let i = 0; i < 29; i++) await h.tick();
  assert.equal(h.requests.length, 30, "one minute of idle requests has one shared loop");
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: true, mq135Raw: 1, mq136Raw: 1 });
  await h.tick(); assert.equal(h.interval(), 2000);
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: false, mq135Raw: 0, mq136Raw: 1 });
  await h.tick(); assert.equal(h.interval(), 2000);
  await h.visible(false); assert.equal(h.interval(), 2000);
  await h.tick(); assert.equal(h.interval(), 2000);
  const previous = h.requests.length;
  await h.visible(true); assert.equal(h.requests.length, previous + 1);
  assert.equal(h.interval(), 2000);
  h.unmount();
});

test("realtime invalidation refreshes immediately and reconciles events during an in-flight read", async () => {
  const h = mount(); h.render(); await h.flush();
  h.payload({ online: true, mq135Raw: 0 });
  await h.changed();
  assert.equal(h.requests.length, 2);
  assert.equal(h.read().data.mq135Raw, 0);
  let resolve;
  h.pending(new Promise(done => { resolve = done; }));
  await h.tick(); const before = h.requests.length;
  await h.changed(); await h.changed();
  assert.equal(h.requests.length, before, "no overlapping reads");
  h.pending(null); h.payload({ online: true, mq135Raw: 1 });
  resolve({ ok: true, json: async () => ({ online: true, mq135Raw: 0 }) });
  await h.flush();
  assert.equal(h.requests.length, before + 1, "one follow-up fetch reconciles the newer event");
  assert.equal(h.read().data.mq135Raw, 1);
  h.unmount(); await h.changed(); assert.equal(h.requests.length, before + 1);
});

test("failures back off, preserve error display, then recover the normal cadence", async () => {
  const h = mount();
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: true, activeRfidHex: 'AABB', activeSessionStartMs: Date.parse('2026-10-09T07:59:55Z') });
  h.render(); await h.flush(); h.failure(true);
  for (const delay of [5000, 10000, 10000, 10000, 10000, 10000]) {
    await h.tick(); assert.equal(h.interval(), delay);
    assert.equal(h.read().error, "Unable to read device state");
    assert.equal(h.read().data.online, false);
    assert.equal(h.read().data.gasUltrasonicOnline, false);
    assert.equal(h.read().data.sessionActive, true, 'a failed read is not an RFID exit');
    assert.equal(h.read().data.activeRfidHex, 'AABB');
  }
  h.failure(false); h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: false }); await h.changed();
  assert.equal(h.read().error, null); assert.equal(h.interval(), 2000);
  assert.equal(h.read().data.sessionActive, false, 'the reported exit replaces the saved active entry immediately');
  h.unmount();
});

test("requests never overlap and cleanup aborts pending work without sharing a previous owner's data", async () => {
  const h = mount(); h.render(); await h.flush();
  let resolve;
  h.pending(new Promise((done) => { resolve = done; }));
  await h.tick(); const count = h.requests.length;
  await h.visible(false); await h.visible(true);
  assert.equal(h.requests.length, count);
  const signal = h.requests.at(-1).signal;
  h.pending(null);
  h.user({ uid: "owner-b", getIdToken: async () => "token-b" });
  assert.equal(h.render().data, null, "account switch hides owner-a's snapshot before the next effect completes");
  assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => ({ online: true, connectedSsid: "old-owner" }) });
  await h.flush();
  assert.notEqual(h.read().data?.connectedSsid, "old-owner");
  assert.equal(h.requests.at(-1).headers.Authorization, "Bearer token-b");
  h.user(null); h.render(); await h.flush();
  assert.equal(h.read().data, null);
  assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  h.unmount();
});

