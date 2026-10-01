import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_FRAME = 256 * 1024;
const ID = /^cam_[a-f0-9]{32}$/;

export function verifyTicket(token, secret, scope, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const received = Buffer.from(parts[1], 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const seconds = Math.floor(now / 1000);
    if (value.v !== 1 || !ID.test(value.deviceId) || value.scope !== scope ||
        !Number.isInteger(value.exp) || value.exp <= seconds || value.exp > seconds + 600) return null;
    return value;
  } catch { return null; }
}

export function createRelay({ secret, origins = [], now = Date.now, maxDevices = 100 } = {}) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('CAMERA_RELAY_SECRET must contain at least 32 characters');
  const devices = new Map();
  const allowedOrigins = new Set(origins);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  function stateFor(id) {
    let state = devices.get(id);
    if (!state && devices.size < maxDevices) {
      state = { demandUntil: 0, frame: null, frameAt: 0, touched: now(), uploading: false, viewers: new Set(), publisher: null };
      devices.set(id, state);
    }
    return state;
  }
  function demandFor(state) { return state.viewers.size > 0 || state.demandUntil > now(); }
  function signalDemand(state) {
    if (state.publisher?.readyState === WebSocket.OPEN) state.publisher.send(demandFor(state) ? '1' : '0');
  }
  function deliver(viewer, state) {
    if (!viewer.ready || !state.frame || now() - state.frameAt > 2000 || viewer.lastFrame === state.frameAt) return;
    if (viewer.bufferedAmount > 64 * 1024) { viewer.terminate(); return; }
    const header = Buffer.alloc(8);
    header.writeBigUInt64BE(BigInt(state.frameAt));
    viewer.ready = false;
    viewer.lastFrame = state.frameAt;
    viewer.send(Buffer.concat([header, state.frame]), { binary: true });
  }
  function publishFrame(state, frame) {
    if (!demandFor(state)) return;
    state.frame = frame;
    state.frameAt = now();
    for (const viewer of state.viewers) deliver(viewer, state);
  }
  function prune() {
    const time = now();
    for (const [id, state] of devices) {
      if (!state.publisher && !state.viewers.size && time - state.touched > 60000) devices.delete(id);
      else if (time - state.frameAt > 2000) state.frame = null;
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) { res.writeHead(403).end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (origin) res.setHeader('Access-Control-Expose-Headers', 'X-Frame-At, X-Frame-Age-Ms');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204).end(); return;
    }
    const url = new URL(req.url, 'http://relay.invalid');
    if (url.pathname === '/healthz' && req.method === 'GET') { res.writeHead(200).end('ok'); return; }
    const viewing = req.method === 'GET' && url.pathname === '/v1/frame';
    const publishing = req.method === 'POST' && url.pathname === '/v1/frame';
    const demand = req.method === 'GET' && url.pathname === '/v1/demand';
    if (!viewing && !publishing && !demand) { res.writeHead(404).end(); return; }
    const token = viewing ? url.searchParams.get('ticket') : req.headers.authorization?.replace(/^Bearer /, '');
    const claim = verifyTicket(token, secret, viewing ? 'view' : 'publish', now());
    if (!claim) { res.writeHead(401).end(); return; }
    prune();
    const state = stateFor(claim.deviceId);
    if (!state) { res.writeHead(503).end(); return; }
    state.touched = now();
    if (demand) { res.writeHead(demandFor(state) ? 200 : 204).end(); return; }
    if (viewing) {
      state.demandUntil = now() + 10000;
      signalDemand(state);
      const frameAgeMs = now() - state.frameAt;
      if (!state.frame || frameAgeMs > 2000) { res.writeHead(204).end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': state.frame.length, 'X-Frame-At': String(state.frameAt), 'X-Frame-Age-Ms': String(Math.max(0, frameAgeMs)) });
      res.end(state.frame); return;
    }
    if (req.headers['content-type'] !== 'image/jpeg') { res.writeHead(415).end(); req.resume(); return; }
    const length = Number(req.headers['content-length']);
    if (!Number.isInteger(length) || length < 4 || length > MAX_FRAME) { res.writeHead(413).end(); req.resume(); return; }
    if (state.uploading || (state.frame && now() - state.frameAt < 200)) {
      res.writeHead(429, { 'Retry-After': '1' }).end(); req.resume(); return;
    }
    state.uploading = true;
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_FRAME || size > length) { res.writeHead(413).end(); req.destroy(); return; }
        chunks.push(chunk);
      }
      const frame = Buffer.concat(chunks);
      if (size !== length || frame[0] !== 0xff || frame[1] !== 0xd8 ||
          frame.at(-2) !== 0xff || frame.at(-1) !== 0xd9) { res.writeHead(400).end(); return; }
      // Expiry is checked again after receipt. Frames are never persisted or logged.
      if (!verifyTicket(token, secret, 'publish', now())) { res.writeHead(401).end(); return; }
      const viewerActive = demandFor(state);
      publishFrame(state, frame);
      res.writeHead(204, { 'X-Viewer-Active': viewerActive ? '1' : '0' }).end();
    } catch {
      if (!res.headersSent) res.writeHead(400).end();
    } finally { state.uploading = false; }
  });
  server.on('upgrade', (req, socket, head) => {
    const reject = code => socket.end(`HTTP/1.1 ${code} Rejected\r\nConnection: close\r\n\r\n`);
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) { reject(403); return; }
    const url = new URL(req.url, 'http://relay.invalid');
    const scope = url.pathname === '/v1/publish' ? 'publish' : url.pathname === '/v1/live' ? 'view' : null;
    if (!scope) { reject(404); return; }
    // Browser viewing requires an allowed Origin; device publishers use a bearer ticket.
    if (scope === 'view' && (!origin || !allowedOrigins.has(origin))) { reject(403); return; }
    const token = scope === 'view' ? url.searchParams.get('ticket') : req.headers.authorization?.replace(/^Bearer /, '');
    const claim = verifyTicket(token, secret, scope, now());
    if (!claim) { reject(401); return; }
    prune();
    const state = stateFor(claim.deviceId);
    if (!state) { reject(503); return; }
    if (scope === 'publish' && state.publisher) { reject(409); return; }
    if (scope === 'view' && state.viewers.size >= 8) { reject(429); return; }
    sockets.handleUpgrade(req, socket, head, ws => {
      ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      const expiry = setTimeout(() => ws.close(1008, 'Session expired'), Math.max(1, claim.exp * 1000 - now()));
      expiry.unref();
      state.touched = now();
      if (scope === 'publish') {
        state.publisher = ws;
        signalDemand(state);
      } else {
        ws.ready = true;
        ws.lastFrame = 0;
        state.viewers.add(ws);
        signalDemand(state);
        deliver(ws, state);
      }
      ws.on('message', (data, binary) => {
        if (!verifyTicket(token, secret, scope, now())) { ws.close(1008, 'Session expired'); return; }
        state.touched = now();
        if (scope === 'view') {
          if (binary || data.toString() !== 'ready') { ws.close(1008, 'Invalid control'); return; }
          ws.ready = true;
          deliver(ws, state);
          return;
        }
        if (!binary || data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8 || data.at(-2) !== 0xff || data.at(-1) !== 0xd9) {
          ws.close(1008, 'Invalid JPEG'); return;
        }
        publishFrame(state, data);
        ws.send('a');
      });
      ws.on('error', () => {});
      ws.on('close', () => {
        clearTimeout(expiry);
        if (scope === 'publish' && state.publisher === ws) state.publisher = null;
        state.viewers.delete(ws);
        if (!demandFor(state)) state.frame = null;
        signalDemand(state);
      });
      sockets.emit('connection', ws, req);
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
    for (const state of devices.values()) signalDemand(state);
  }, 5000);
  heartbeat.unref();
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.setTimeout(10000, socket => socket.destroy());
  server.maxRequestsPerSocket = 1000;
  const cleanup = setInterval(prune, 10000);
  cleanup.unref();
  server.on('close', () => { clearInterval(cleanup); clearInterval(heartbeat); for (const ws of sockets.clients) ws.terminate(); sockets.close(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createRelay({
    secret: process.env.CAMERA_RELAY_SECRET,
    origins: (process.env.CAMERA_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  });
  server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('LitterSense camera relay ready'));
  process.on('SIGTERM', () => { server.close(); server.closeAllConnections(); });
}
