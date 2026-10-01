# Persistent camera transport

The camera connects to `/v1/publish` over WSS using its existing short-lived publish bearer ticket. The browser obtains a view ticket from `/api/camera/session` and connects to `/v1/live`. The relay uses the same secret and allowed origins as the HTTP endpoints.

Publisher control messages: `1` enables streaming, `0` stops it, and `a` acknowledges one JPEG. Viewer packets contain an eight-byte big-endian relay receipt timestamp followed by the JPEG. The viewer sends `ready` after decoding/displaying a frame; the relay sends only its newest frame and never builds a viewer frame queue. Tickets expire after five minutes; both clients renew before expiry. Heartbeats detect dead clients. Closing or hiding Live disconnects that viewer.

The firmware starts at five frames/second, with at most three unacknowledged frames. An acknowledgment stall of two seconds triggers a reconnect. The existing HTTP endpoints and viewer polling remain available during rollout. Firmware falls back to HTTP after an initial 20-second connection failure and retries WSS after a board restart. Firmware statistics distinguish WS frame sends and relay acknowledgments; browser console statistics identify `transport: websocket`.

Deploy the relay before the web app and firmware. Use an application-only firmware update at `0x10000` with the unchanged partition layout. Verify `Cloud camera: WebSocket connected`, then WS frame and acknowledgment summaries while Live is visible. Local tests and build success do not establish hardware frame rate or latency.
