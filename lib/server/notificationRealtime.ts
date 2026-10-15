// Credentials and database payloads stay on the server. Clients receive invalidations only.
type ChangeKind = 'cats' | 'visits' | 'sensors';
type Listener = { changed: (kind?: ChangeKind) => void; unavailable: () => void };
type SharedWatch = { listeners: Set<Listener>; stop: () => void; ready: boolean };
// Sharing is local to this running server instance, never across owners or device credentials.
const watches = new Map<string, SharedWatch>();

function reconcile(changed: Listener['changed']) {
  changed(); changed('cats'); changed('visits'); changed('sensors');
}

export function watchNotificationChanges(uid: string, changed: Listener['changed'], unavailable: () => void, sensorTokenHash?: string) {
  const key = JSON.stringify([uid, sensorTokenHash ?? null]);
  const listener = { changed, unavailable };
  let watch = watches.get(key);
  if (watch) {
    watch.listeners.add(listener);
    if (watch.ready) reconcile(changed);
  } else {
    const entry: SharedWatch = { listeners: new Set([listener]), stop: () => {}, ready: false };
    watch = entry;
    watches.set(key, entry);
    const fail = () => {
      if (watches.get(key) !== entry) return;
      watches.delete(key);
      entry.stop();
      const listeners = [...entry.listeners];
      entry.listeners.clear();
      listeners.forEach(subscriber => subscriber.unavailable());
    };
    try {
      entry.stop = openNotificationChanges(uid, kind => {
        if (watches.get(key) !== entry) return;
        entry.ready = true;
        entry.listeners.forEach(subscriber => subscriber.changed(kind));
      }, fail, sensorTokenHash);
    } catch (error) {
      watches.delete(key);
      throw error;
    }
  }
  const entry = watch;
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size && watches.get(key) === entry) {
      watches.delete(key);
      entry.stop();
    }
  };
}

function openNotificationChanges(uid: string, changed: Listener['changed'], unavailable: () => void, sensorTokenHash?: string) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error('Notification realtime is not configured');
  const url = new URL('/realtime/v1/websocket', base);
  url.protocol = 'wss:';
  url.searchParams.set('apikey', key);
  url.searchParams.set('vsn', '1.0.0');
  const socket = new WebSocket(url);
  const topic = 'realtime:notifications';
  let stopped = false, reconciled = false, sequence = 0;
  const send = (event: string, payload: unknown, target = topic) => {
    if (!stopped && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ topic: target, event, payload, ref: String(++sequence) }));
  };
  const heartbeat = setInterval(() => send('heartbeat', {}, 'phoenix'), 15000);
  socket.onopen = () => send('phx_join', {
    config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [
      { event: '*', schema: 'public', table: 'operational_records', filter: `owner_id=eq.${uid}` },
      ...(sensorTokenHash ? [{ event: '*', schema: 'public', table: 'sensor_snapshots', filter: `token_hash=eq.${sensorTokenHash}` }] : []),
    ] },
    access_token: key,
  });
  socket.onmessage = event => {
    if (stopped) return;
    try {
      const message = JSON.parse(String(event.data));
      if (message.event === 'system') {
        if (message.payload?.status === 'ok') {
          if (!reconciled) { reconciled = true; reconcile(changed); }
        } else unavailable();
      }
      if (message.event === 'phx_reply' && message.payload?.status === 'error') unavailable();
      if (message.event === 'postgres_changes') {
        const data = message.payload?.data;
        const path = data?.record?.document_path ?? data?.old_record?.document_path;
        if (data?.table === 'sensor_snapshots' && sensorTokenHash && data?.record?.token_hash === sensorTokenHash) changed('sensors');
        if (typeof path === 'string' && path.startsWith(`users/${uid}/deviceState/`)) changed('sensors');
        if (typeof path === 'string' && path.startsWith(`users/${uid}/sensorHistory/`)) changed('sensors');
        if (typeof path === 'string' && path.startsWith(`users/${uid}/notifications/`)) changed();
        if (typeof path === 'string' && path.startsWith(`users/${uid}/sessions/`)) changed('visits');
        if (typeof path === 'string' && (path.startsWith(`users/${uid}/cats/`) || path.startsWith(`users/${uid}/catDetails/`))) changed('cats');
      }
    } catch { unavailable(); }
  };
  socket.onerror = () => { if (!stopped) unavailable(); };
  socket.onclose = () => { if (!stopped) unavailable(); };
  return () => { stopped = true; clearInterval(heartbeat); socket.close(); };
}
