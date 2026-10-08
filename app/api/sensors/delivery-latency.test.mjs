import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual post-response workers, with a slow or failed SMS provider.
const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
const primary = source.slice(source.indexOf("if (rfidPrimaryEnabled() && payload.source === 'gas-ultrasonic')"), source.indexOf('let response = await handleSensorSync'));
const workers = [...primary.matchAll(/after\(async \(\) => \{([\s\S]*?)\n\s*\}\);/g)].map(match => match[1]);

for (const [index, worker] of workers.entries()) {
  test(`primary ${index === 0 ? 'gas' : 'RFID'} push starts while SMS is still waiting`, async () => {
    let releaseSms;
    const sms = new Promise(resolve => { releaseSms = resolve; });
    let pushed = false;
    const run = vm.runInNewContext(`(async () => {${worker}})`, {
      uid: 'owner', saved: { uid: 'owner' }, alerts: { ownerId: 'owner' },
      processSmsOutbox: () => sms,
      processPushOutbox: async () => { pushed = true; },
      console: { warn() {}, info() {} }, Date, Promise,
    });
    const completion = run();
    await Promise.resolve();
    const started = pushed;
    releaseSms({ processed: 0 });
    await completion;
    assert.equal(started, true, 'push must not wait for SMS completion');
  });
  test(`primary ${index === 0 ? 'gas' : 'RFID'} SMS failure cannot skip push`, async () => {
    let pushed = false;
    await vm.runInNewContext(`(async () => {${worker}})`, {
      uid: 'owner', saved: { uid: 'owner' }, alerts: { ownerId: 'owner' },
      processSmsOutbox: async () => { throw new Error('SMS unavailable'); },
      processPushOutbox: async () => { pushed = true; },
      console: { warn() {}, info() {} }, Date, Promise,
    })();
    assert.equal(pushed, true);
  });
}
assert.equal(workers.length, 2, 'both primary ingestion paths must be exercised');
