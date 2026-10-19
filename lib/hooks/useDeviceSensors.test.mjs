import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from 'node:module';
const requirePresence = createRequire(import.meta.url)('../utils/sensorPresence.ts');
const { useAirQualityReadings } = createRequire(import.meta.url)('./useAirQualityReadings.ts');
const { getLiveAirQualityStatus } = createRequire(import.meta.url)('../utils/liveSensorStatus.ts');

function mount() {
  let user = { uid: "owner-a", getIdToken: async () => "token-a" };
  let state, context, cleanup, effect, dependency, now = 0, timerId = 0;
  let payload = { online: true, gasUltrasonicOnline: true, sessionActive: false, mq135Raw: 1, mq136Raw: 1 };
  let failure = false, pending, sensorChanged, presenceChanged, presenceUnavailable, presenceTick;
  const baseTime = Date.parse('2026-10-09T08:00:00Z');
  class ClockDate extends Date { static now() { return baseTime + now; } }
  const timers = new Map(), listeners = new Map(), requests = [], deadlines = [];
  const requestSignals = { any: signals => AbortSignal.any(signals), timeout: () => {
    const controller = new AbortController(); deadlines.push(controller); return controller.signal;
  } };
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
    module: loadedModule, exports: loadedModule.exports, window, document, AbortController, AbortSignal: requestSignals, Error, Date: ClockDate,
    require: (name) => {
      if (name === "react") return react;
      if (name === "@/lib/contexts/AuthContext") return { useAuth: () => ({ user }) };
      if (name === "@/lib/utils/notificationLive") return { subscribeSensorChanges: fn => { sensorChanged = fn; return () => { sensorChanged = null; }; } };
      if (name === "@/lib/utils/devicePresenceClient") return { subscribeDevicePresence: (_token, changed, unavailable) => { presenceChanged = changed; presenceUnavailable = unavailable; return () => { presenceChanged = presenceUnavailable = null; }; } };
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
    devicePresence: async (event) => { presenceChanged?.(event); await flush(); },
    presenceUnavailable: async (role) => { presenceUnavailable?.(role); await flush(); },
    age: async ms => { now += ms; presenceTick?.(); await flush(); },
    reconnect: async () => { listeners.get('online')?.(); await flush(); },
    expireRequests: async () => { deadlines.forEach(controller => controller.abort(new DOMException('Sensor request timed out', 'TimeoutError'))); await flush(); },
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

test('relay presence overrides stale saved heartbeats per board and falls back without extra reads', async () => {
  const h = mount(); h.render(); await h.flush();
  await h.age(121000);
  assert.equal(h.read().data.online, false);
  assert.equal(h.read().data.gasUltrasonicOnline, false);
  const requests = h.requests.length;
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:02:01.000Z' });
  assert.equal(h.read().data.gasUltrasonicOnline, true, 'a current gas relay connection outranks an old cloud snapshot');
  assert.equal(h.read().data.online, false, 'gas presence does not revive the separate RFID board');
  await h.devicePresence({ role: 'rfid', online: true, updatedAt: '2026-10-09T08:02:02.000Z' });
  assert.equal(h.read().data.online, true);
  await h.devicePresence({ role: 'rfid', online: false, updatedAt: null });
  assert.equal(h.read().data.online, false);
  assert.equal(h.read().data.sessionActive, false, 'presence updates do not alter the session payload');
  await h.presenceUnavailable('rfid');
  assert.equal(h.read().data.online, false, 'an unavailable relay stream falls back to stale database presence');
  assert.equal(h.requests.length, requests, 'relay status events do not query the database');
  h.unmount();
});

test('RFID relay heartbeats cannot freshen or move an old active session', async () => {
  const h = mount();
  h.payload({ online: true, sessionActive: true, activeRfidHex: 'A123', activeSessionStartMs: 123456, activeSessionDurationMs: 30000 });
  h.render(); await h.flush();
  const receipt = h.read().data.rfidUpdatedAt;
  await h.age(20000);
  const requests = h.requests.length;
  await h.devicePresence({ role: 'rfid', online: true, updatedAt: '2026-10-09T08:00:20.000Z' });
  assert.equal(h.read().data.online, true, 'transport connectivity remains visible');
  assert.equal(h.read().data.rfidUpdatedAt, receipt, 'only an accepted upload can change session receipt time');
  assert.equal(h.read().data.rfidState, 'stale');
  assert.equal(h.read().data.sessionActive, true, 'absence of telemetry must not invent an exit');
  assert.equal(h.read().data.activeSessionStartMs, 123456);
  assert.equal(h.read().data.activeSessionDurationMs, 30000);
  assert.equal(h.requests.length, requests);
  h.unmount();
});

test('RFID telemetry expires on the local clock while relay transport stays connected', async () => {
  const h = mount(); h.render(); await h.flush();
  const receipt = h.read().data.rfidUpdatedAt;
  await h.devicePresence({ role: 'rfid', online: true, updatedAt: receipt });
  await h.age(15001);
  assert.equal(h.read().data.online, true);
  assert.equal(h.read().data.rfidState, 'stale');
  assert.equal(h.read().data.rfidUpdatedAt, receipt);
  assert.equal(h.requests.length, 1);
  h.payload({ online: true, sessionActive: false });
  await h.changed();
  assert.equal(h.read().data.rfidState, 'online');
  assert.equal(h.read().data.sessionActive, false);
  h.unmount();
});

test('a failed cloud read preserves RFID entry evidence without presenting it as fresh through the relay', async () => {
  const h = mount(); h.payload({ online: true, sessionActive: true }); h.render(); await h.flush();
  const receipt = h.read().data.rfidUpdatedAt;
  await h.devicePresence({ role: 'rfid', online: true, updatedAt: receipt });
  h.failure(new Error('temporary cloud outage'));
  await h.changed();
  assert.equal(h.read().data.online, true);
  assert.equal(h.read().data.rfidState, 'stale');
  assert.equal(h.read().data.rfidUpdatedAt, receipt);
  assert.equal(h.read().data.sessionActive, true);
  h.unmount();
});

test('a connected relay cannot make an expired Clear reading current again', async () => {
  const h = mount();
  h.payload({ online: true, gasUltrasonicOnline: true, mq135: 'Clear', mq136: 'Clear', mq135Raw: 1, mq136Raw: 1 });
  h.render(); await h.flush();
  const receipt = h.read().data.gasUltrasonicUpdatedAt;
  await h.age(121000);
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:02:01.000Z' });
  const data = h.read().data;
  assert.equal(data.gasUltrasonicOnline, true, 'the relay still reports a connected board');
  assert.equal(data.gasUltrasonicState, 'stale', 'telemetry remains expired until another snapshot arrives');
  assert.equal(data.gasUltrasonicUpdatedAt, receipt, 'a connection heartbeat is not a reading receipt');
  assert.equal(h.requests.length, 1, 'a relay heartbeat does not fetch readings');
  const readings = useAirQualityReadings(data);
  assert.equal(readings.ammonia.displayValue, 'Syncing');
  assert.equal(readings.ammonia.online, false, 'expired telemetry cannot generate a gas alert');
  const status = getLiveAirQualityStatus({ sensorData: data, sensorsLoading: false, sensorsError: null });
  assert.equal(status.value, 'Syncing');
  assert.equal(status.label, 'Awaiting readings');
  h.payload({ online: true, gasUltrasonicOnline: true, mq135: 'Gas Detected', mq136: 'Clear', mq135Raw: 0, mq136Raw: 1 });
  await h.changed();
  assert.equal(h.read().data.gasUltrasonicState, 'online');
  assert.equal(h.read().data.gasUltrasonicUpdatedAt, '2026-10-09T08:02:01.000Z');
  assert.equal(useAirQualityReadings(h.read().data).ammonia.displayValue, 'Detected', 'fresh telemetry replaces the waiting state');
  h.unmount();
});

test('gas telemetry expires locally while relay transport stays connected', async () => {
  const h = mount(); h.render(); await h.flush();
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:00:00.000Z' });
  await h.age(121000);
  assert.equal(h.read().data.gasUltrasonicOnline, true);
  assert.equal(h.read().data.gasUltrasonicState, 'stale');
  assert.equal(h.read().data.gasUltrasonicUpdatedAt, '2026-10-09T08:00:00.000Z');
  h.unmount();
});

test('a gas relay reconnect refreshes readings once while repeated heartbeats and hidden reconnects do not poll', async () => {
  const h = mount(); h.render(); await h.flush();
  await h.devicePresence({ role: 'gas-ultrasonic', online: false, updatedAt: null });
  h.payload({ online: true, gasUltrasonicOnline: true, mq135: 'Gas Detected', mq136: 'Clear', mq135Raw: 0, mq136Raw: 1 });
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:00:01.000Z' });
  assert.equal(h.requests.length, 2, 'reconnection reconciles the current cloud reading immediately');
  assert.equal(h.read().data.mq135Raw, 0);
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:00:02.000Z' });
  assert.equal(h.requests.length, 2, 'another online heartbeat does not create a request');
  await h.visible(false);
  await h.devicePresence({ role: 'gas-ultrasonic', online: false, updatedAt: null });
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:00:03.000Z' });
  assert.equal(h.requests.length, 2, 'hidden dashboards keep their no-read behavior');
  await h.visible(true);
  assert.equal(h.requests.length, 3, 'returning to the tab reconciles once');
  h.unmount();
});

test('relay status continues updating during a cloud snapshot outage without another read', async () => {
  const h = mount(); h.render(); await h.flush();
  h.failure(true);
  await h.changed();
  assert.equal(h.read().data.online, false);
  assert.equal(h.read().data.gasUltrasonicOnline, false);
  const requests = h.requests.length;
  await h.devicePresence({ role: 'rfid', online: true, updatedAt: '2026-10-09T08:03:00.000Z' });
  await h.devicePresence({ role: 'gas-ultrasonic', online: true, updatedAt: '2026-10-09T08:03:01.000Z' });
  assert.equal(h.read().data.online, true);
  assert.equal(h.read().data.gasUltrasonicOnline, true);
  assert.equal(h.requests.length, requests, 'presence events do not depend on a successful database snapshot');
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

test('a stalled token refresh times out and releases sensor polling for internet recovery', async () => {
  const h = mount(); let releaseToken, tokenPending = true;
  const stalledToken = new Promise(resolve => { releaseToken = resolve; });
  h.user({ uid: 'owner-a', getIdToken: () => tokenPending ? stalledToken : Promise.resolve('recovered-token') });
  h.render(); await h.flush();
  assert.equal(h.requests.length, 0);
  assert.equal(h.read().isLoading, true);
  await h.expireRequests();
  assert.equal(h.read().isLoading, false, 'a blocked token must not hold Syncing forever');
  assert.match(h.read().error, /timed out/i);
  assert.equal(h.interval(), 5000);
  tokenPending = false;
  h.payload({ online: true, gasUltrasonicOnline: true, mq135Raw: 0, mq136Raw: 1, mq135: 'Gas Detected', mq136: 'Clear' });
  await h.reconnect();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].headers.Authorization, 'Bearer recovered-token');
  assert.equal(h.read().error, null);
  assert.equal(useAirQualityReadings(h.read().data).ammonia.displayValue, 'Detected');
  releaseToken('late-token'); await h.flush();
  assert.equal(h.requests.length, 1, 'the abandoned token cannot start a late sensor read');
  h.unmount();
});

test('account cleanup abandons an unresolved token before any request can use the previous owner', async () => {
  const h = mount(); let releaseToken;
  h.user({ uid: 'owner-a', getIdToken: () => new Promise(resolve => { releaseToken = resolve; }) });
  h.render(); await h.flush();
  h.user({ uid: 'owner-b', getIdToken: async () => 'owner-b-token' }); h.render(); await h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].headers.Authorization, 'Bearer owner-b-token');
  releaseToken('late-owner-a-token'); await h.flush();
  assert.equal(h.requests.length, 1, 'unmounted token work must never initiate an old-owner request');
  assert.equal(h.read().error, null);
  h.unmount();
});

test("dashboard consumers share one realtime-first loop with a 5-second fallback", async () => {
  const h = mount(); h.render(); await h.flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.read(), h.read(), "consumers receive the same snapshot without extra requests");
  assert.equal(h.interval(), 5000);
  await h.tick();
  assert.equal(h.requests.length, 2, "five seconds of idle time performs one fallback read");
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: true, mq135Raw: 1, mq136Raw: 1 });
  await h.tick(); assert.equal(h.interval(), 5000);
  h.payload({ online: true, gasUltrasonicOnline: true, sessionActive: false, mq135Raw: 0, mq136Raw: 1 });
  await h.tick(); assert.equal(h.interval(), 5000);
  await h.visible(false); assert.equal(h.timers.size, 0);
  const previous = h.requests.length;
  await h.visible(true); assert.equal(h.requests.length, previous + 1);
  assert.equal(h.interval(), 5000);
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

test('hidden dashboard stops sensor reads and reconciles once when visible again', async () => {
  const h = mount(); h.render(); await h.flush();
  const before = h.requests.length;
  await h.visible(false);
  assert.equal(h.timers.size, 0, 'hiding clears the fallback timer');
  for (let i = 0; i < 720; i++) {
    await h.age(5000);
    await h.changed();
  }
  await h.reconnect();
  assert.equal(h.requests.length, before, 'one hidden hour and invalidations cause no sensor reads');
  h.payload({ online: true, gasUltrasonicOnline: true, mq135Raw: 0 });
  await h.visible(true);
  assert.equal(h.requests.length, before + 1, 'returning refreshes exactly once');
  assert.equal(h.read().data.mq135Raw, 0, 'returning reconciles the latest snapshot');
  assert.equal(h.interval(), 5000, 'visible fallback remains five seconds');
  h.unmount();
});

test('an in-flight read finishing while hidden does not restart polling', async () => {
  const h = mount(); h.render(); await h.flush();
  let resolve;
  h.pending(new Promise(done => { resolve = done; }));
  await h.tick();
  await h.changed();
  await h.visible(false);
  const before = h.requests.length;
  h.pending(null);
  resolve({ ok: true, json: async () => ({ online: true, mq135Raw: 1 }) });
  await h.flush();
  assert.equal(h.requests.length, before);
  assert.equal(h.timers.size, 0);
  await h.visible(true);
  assert.equal(h.requests.length, before + 1);
  assert.equal(h.interval(), 5000);
  h.unmount();
});

test('mounting a dashboard in a hidden tab defers its first sensor read', async () => {
  const h = mount();
  await h.visible(false);
  h.render(); await h.flush();
  assert.equal(h.requests.length, 0);
  assert.equal(h.timers.size, 0);
  await h.visible(true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.interval(), 5000);
  h.unmount();
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
  assert.equal(h.read().error, null); assert.equal(h.interval(), 5000);
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

