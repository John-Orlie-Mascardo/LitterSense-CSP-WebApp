# Recent Activity RFID continuity

Recent Activity was treating a missing heartbeat or failed sensor read as an RFID exit. The presence clock set `sessionActive` to false after fifteen seconds, and the sensor fetch error path also cleared it. The authenticated sensor response did the same when its stored snapshot became stale. The dashboard removed the live entry until the next successful read restored the same session.

Connection freshness and recorded activity are now separate: reader status still expires at the existing timeout, while the last reported entry remains available until RFID reports a new state. An unavailable connection must be shown as awaiting an RFID update rather than as a confirmed exit or current occupancy.

The dashboard distinguishes daily summaries and earlier completed visits from the current entry, uses a valid calendar timestamp for entry dates, and shows the latest reported exit while the full history refresh catches up. These temporary display projections do not enter the visit-count calculation, so daily summaries cannot double count the same exit.

Firmware, reader freshness thresholds, and gas sensor freshness are unchanged. Sensor changes continue to trigger immediate refreshes through the existing authenticated live stream, with the existing shared poll loop providing recovery when the stream is interrupted.

Regression checks cover stale heartbeats, failed reads, authentic exit replacement, owner changes, activity timestamps, and handoff into saved history. Production validation must include a real RFID entry and exit after refreshing the deployed page.
