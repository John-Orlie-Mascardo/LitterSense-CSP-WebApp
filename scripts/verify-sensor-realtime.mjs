// Read-only check: verifies the configured server can subscribe to paired sensor snapshots.
process.loadEnvFile('.env.local');
const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!base || !key) throw new Error('Missing server Supabase configuration');
const response = await fetch(new URL('/rest/v1/sms_devices?select=token_hash&limit=1', base), {
  headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000),
});
if (!response.ok) throw new Error(`Device lookup failed: HTTP ${response.status}`);
const [device] = await response.json();
if (!device?.token_hash) throw new Error('No paired device available for subscription check');
const url = new URL('/realtime/v1/websocket', base);
url.protocol = 'wss:'; url.searchParams.set('apikey', key); url.searchParams.set('vsn', '1.0.0');
await new Promise((resolve, reject) => {
  const socket = new WebSocket(url), topic = 'realtime:sensor-check';
  const timer = setTimeout(() => finish(new Error('Sensor subscription timed out')), 15000);
  let completed = false;
  function finish(error) {
    if (completed) return; completed = true; clearTimeout(timer); socket.close();
    if (error) reject(error); else resolve();
  }
  socket.addEventListener('open', () => socket.send(JSON.stringify({ topic, event: 'phx_join', ref: '1', payload: {
    config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [
      { event: '*', schema: 'public', table: 'sensor_snapshots', filter: `token_hash=eq.${device.token_hash}` },
    ] }, access_token: key,
  } })));
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.event === 'phx_reply' && message.ref === '1') {
      const bindings = message.payload?.response?.postgres_changes;
      if (message.payload?.status !== 'ok' || !bindings?.some(binding => binding.table === 'sensor_snapshots')) {
        finish(new Error('Sensor subscription was not acknowledged')); return;
      }
      console.log('Sensor realtime subscription acknowledged; credentials and device IDs remain server-side.');
      finish();
    }
    if (message.event === 'system' && message.payload?.status === 'error') finish(new Error('Sensor realtime subscription unavailable'));
  });
  socket.addEventListener('error', () => finish(new Error('Sensor realtime transport failed')));
  socket.addEventListener('close', () => { if (!completed) finish(new Error('Sensor realtime closed before acknowledgement')); });
});
