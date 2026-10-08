import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { useAirQualityReadings } = require('../../lib/hooks/useAirQualityReadings.ts');

function harness(primary = false) {
  let sensor = { data: null, isLoading: false, error: null };
  let user = { uid: 'owner' };
  const notifications = { ammoniaAlerts: true, h2sAlerts: true };
  const saved = [];
  const slots = [];
  let slot = 0;
  let fail = false;
  const effects = [];
  const addNotification = async (payload) => {
    if (fail) throw new Error('temporary failure');
    saved.push(payload);
  };
  const imports = {
    '@/lib/utils/operationalMode': { operationalPrimary: async () => primary },
    react: {
      useRef(value) { const index = slot++; return slots[index] ??= { current: value }; },
      useEffect(effect, deps) {
        const index = slot++;
        if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index][i]))) effects.push(effect);
        slots[index] = deps;
      },
    },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user }) },
    '@/lib/hooks/useAirQualityReadings': { useAirQualityReadings },
    '@/lib/hooks/useDeviceSensors': { useDeviceSensors: () => sensor },
    '@/lib/hooks/useRfidVisitTracker': { useRfidVisitTracker() {} },
    '@/lib/contexts/NotificationContext': { useNotifications: () => ({ addNotification }) },
    '@/lib/hooks/useSettings': { useSettings: () => ({ settings: { notifications } }) },
  };
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('./RfidVisitBridge.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => imports[id], console: { error() {}, warn() {} } });
  return {
    saved, notifications,
    set fail(value) { fail = value; },
    set user(value) { user = value; },
    async render(data, error = null) {
      sensor = { data, isLoading: false, error };
      slot = 0;
      exports.RfidVisitBridge();
      effects.splice(0).forEach((effect) => effect());
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
  };
}
const detected = { online: false, gasUltrasonicOnline: true, mq135: 'Gas Detected', mq136: 'Gas Detected', mq135Raw: 0, mq136Raw: 0 };
const clear = { ...detected, mq135: 'Clear', mq136: 'Clear', mq135Raw: 1, mq136Raw: 1 };

test('gas alerts honor switches, independent board status, deduplication, recovery and retry', async () => {
  const h = harness();
  h.notifications.ammoniaAlerts = false;
  await h.render(detected);
  assert.deepEqual(h.saved.map((n) => n.source), ['h2s_alert']);
  await h.render(detected);
  assert.equal(h.saved.length, 1);
  h.notifications.ammoniaAlerts = true;
  await h.render(detected);
  assert.equal(h.saved[1].source, 'ammonia_alert');
  await h.render({ ...detected, gasUltrasonicOnline: false });
  await h.render(detected, 'network unavailable');
  assert.equal(h.saved.length, 2);
  await h.render(clear);
  h.fail = true;
  await h.render(detected);
  assert.equal(h.saved.length, 2);
  h.fail = false;
  await h.render(detected);
  assert.equal(h.saved.length, 4);
  h.user = { uid: 'another-owner' };
  await h.render(detected);
  assert.equal(h.saved.length, 6);
});

test('primary dashboards never create additional copies of server gas alerts', async () => {
  const pc = harness(true), phone = harness(true);
  for (let i = 0; i < 3; i++) { await pc.render(detected); await phone.render(detected); }
  assert.equal(pc.saved.length, 0); assert.equal(phone.saved.length, 0);
});
