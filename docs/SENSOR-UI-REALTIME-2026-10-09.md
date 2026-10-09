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

For a read-only live subscription check, run `node scripts/verify-sensor-realtime.mjs`
with `SUPABASE_URL` and `SUPABASE_SECRET_KEY` configured in `.env.local`. It verifies
subscription acknowledgement without modifying sensor data or printing credentials.
Acknowledgement alone is not a physical sensor-to-screen latency measurement.

Regression coverage exercises immediate invalidation, updates during pending reads,
background polling, owner filtering, paired-device filtering, split SSE frames,
reconnect reconciliation and teardown.
