// Credentials and database payloads stay on the server. Clients receive invalidations only.
export function watchNotificationChanges(uid: string, changed: (kind?: 'cats' | 'visits') => void, unavailable: () => void) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error('Notification realtime is not configured');
  const url = new URL('/realtime/v1/websocket', base);
  url.protocol = 'wss:';
  url.searchParams.set('apikey', key);
  url.searchParams.set('vsn', '1.0.0');
  const socket = new WebSocket(url);
  const topic = 'realtime:notifications';
  let stopped = false, sequence = 0;
  const send = (event: string, payload: unknown, target = topic) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ topic: target, event, payload, ref: String(++sequence) }));
  };
  const heartbeat = setInterval(() => send('heartbeat', {}, 'phoenix'), 15000);
  socket.onopen = () => send('phx_join', {
    config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'operational_records', filter: `owner_id=eq.${uid}` }] },
    access_token: key,
  });
  socket.onmessage = event => {
    try {
      const message = JSON.parse(String(event.data));
      if (message.event === 'system') {
        if (message.payload?.status === 'ok') { changed(); changed('cats'); changed('visits'); } // Reconcile changes during reconnect.
        else unavailable();
      }
      if (message.event === 'phx_reply' && message.payload?.status === 'error') unavailable();
      if (message.event === 'postgres_changes') {
        const data = message.payload?.data;
        const path = data?.record?.document_path ?? data?.old_record?.document_path;
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
