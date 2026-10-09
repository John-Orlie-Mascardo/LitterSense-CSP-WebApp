# Sensor UI refresh

Sensor snapshots now invalidate the dashboard through the existing authenticated
notification event stream. The server subscribes to the paired device's
`sensor_snapshots` rows and the owner's `deviceState` records. The browser gets
only a `sensors` invalidation, then reads `/api/sensors` with its Firebase token.
Server credentials, pairing tokens and snapshot records are not sent in the stream.

The dashboard retains its shared two-second polling fallback. Hiding the page
no longer adds the previous thirty-second application delay. Returning to the page
refreshes immediately. Browser/OS background suspension can still pause a page.
An invalidation during an in-flight read requests one follow-up read, preserving
serialization and account-switch cleanup.

Migration `20261009160000_sensor_realtime.sql` adds `sensor_snapshots` to the
Supabase realtime publication. Its existing RLS and server-only grants remain.
The authenticated stream renews every 45 seconds within Vercel's 60-second limit;
reconnection invalidates sensors to reconcile changes missed between connections.

This change removes frontend waiting. It does not change firmware upload intervals
or manufacture fresh readings when the device has not uploaded. The existing
90-second freshness window and RFID visit timeout remain independent of UI polling.

## Web-only presence display update

At the user's request, firmware remains unchanged. The UI treats RFID heartbeats
as recent for 15 seconds and gas heartbeats for 120 seconds. It reevaluates presence every second, even
while an API request is pending. Expired data displays "No recent heartbeat";
this does not distinguish loss of power from loss of network. The server's
90-second enrollment/session grace window remains unchanged.

The sensor response includes `serverTime`. The UI anchors heartbeat ages to that
server time and advances them locally, so browser/server clock offset does not
make a fresh device stale. Reading the same snapshot again never resets its age.
Network restoration triggers an immediate fetch instead of waiting for retry
backoff. Failed reads retry after five seconds, then at most ten seconds.
Realtime invalidation and two-second fallback polling remain active.

Sensor config reads now check the foundation, owner, pointer and owned credential
once. Duplicate public-config resolution and duplicate route readiness checks
are removed. Snapshot and mirror reads run concurrently. Existing account,
credential rotation, owner isolation and migration readiness checks remain.

Production logs confirmed accepted gas uploads about 62 to 94 seconds apart.
The previous 15-second gas display window incorrectly hid working readings
between those uploads. Both the gas API freshness and gas UI now use 120 seconds,
independently of RFID. Clear/Detected remains visible with an offline RFID board;
new gas readings still invalidate the UI immediately. No measurement is fabricated
or forced online after the gas freshness window expires. A disconnected board
can take up to two minutes after its last receipt to show stale, plus refresh time.
Power-on still requires the device's first accepted upload; web changes cannot
skip its Wi-Fi association, NTP/TLS setup or firmware retry schedule.

For a read-only live subscription check, run `node scripts/verify-sensor-realtime.mjs`
with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` configured in `.env.local`. It verifies
subscription acknowledgement without modifying sensor data or printing credentials.
Acknowledgement alone is not a physical sensor-to-screen latency measurement.

Regression coverage exercises immediate invalidation, updates during pending reads,
background polling, owner filtering, paired-device filtering, split SSE frames,
reconnect reconciliation and teardown.
