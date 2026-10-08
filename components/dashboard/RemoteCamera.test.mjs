import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';

function harness() {
  const timers = [], sockets = [], effects = [], logs = [];
  let cleanup, blockRenewal, requests = 0;
  const document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  class Socket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor() { sockets.push(this); }
    open() { this.readyState = 1; this.onopen(); }
    close() { this.readyState = 3; this.onclose?.({ code: 1000, wasClean: true }); }
    send(value) { this.sent.push(value); }
    async frame() {
      const data = new ArrayBuffer(16);
      new DataView(data).setBigUint64(0, BigInt(Date.now()));
      await this.onmessage({ data });
    }
  }
  const imports = {
    react: { useRef: () => ({ current: null }), useState: value => [value, () => {}], useEffect: effect => effects.push(effect) },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    '@/lib/contexts/AuthContext': { useAuth: () => ({ user: { getIdToken: async () => 'test-auth' } }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./RemoteCamera.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require: name => imports[name], document, WebSocket: Socket,
    setTimeout(fn, delay) { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; }, setInterval: () => 1, clearInterval() {},
    fetch: async () => { requests++; if (requests > 1 && blockRenewal) await blockRenewal; return Response.json({ frameUrl: 'https://relay/frame', streamUrl: 'wss://relay/live', expiresIn: 300 }); },
    Response, AbortController, AbortSignal, Date, performance, Blob, ArrayBuffer, DataView,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Image: class { async decode() {} }, requestAnimationFrame: fn => fn(),
    console: { info: (...args) => logs.push(args) },
  });
  exports.RemoteCamera({ onStreamStateChange() {} });
  cleanup = effects[0]();
  return {
    sockets, logs, cleanup,
    async start() { await setImmediate(); sockets[0].open(); await sockets[0].frame(); },
    async renew() { timers.find(timer => !timer.cleared && timer.delay > 200000).fn(); await setImmediate(); },
    block() { let release; blockRenewal = new Promise(resolve => { release = resolve; }); return async () => { release(); await setImmediate(); }; },
  };
}

test('camera keeps delivering while renewal waits, and switches only after replacement frame', async () => {
  const h = harness(); await h.start();
  const old = h.sockets[0], release = h.block();
  await h.renew();
  assert.equal(old.readyState, 1, 'renewal must not close the working stream before authorization');
  await old.frame();
  assert.equal(old.sent.length, 2, 'old viewer continues accepting frames');
  await release();
  const next = h.sockets[1]; assert.ok(next, 'replacement connection starts immediately after authorization');
  next.open();
  assert.equal(old.readyState, 1, 'keep old stream until replacement image is decoded');
  await next.frame();
  assert.equal(old.readyState, 3);
  assert.equal(next.readyState, 1);
  h.cleanup();
});

test('failed replacement leaves the working stream connected', async () => {
  const h = harness(); await h.start(); await h.renew();
  const old = h.sockets[0], next = h.sockets[1];
  assert.ok(next); next.close();
  assert.equal(old.readyState, 1);
  await old.frame(); assert.equal(old.sent.length, 2);
  h.cleanup();
});

test('cleanup closes both current and pending camera connections', async () => {
  const h = harness(); await h.start(); await h.renew();
  assert.equal(h.sockets.length, 2);
  h.cleanup();
  assert.ok(h.sockets.every(socket => socket.readyState === 3));
});
