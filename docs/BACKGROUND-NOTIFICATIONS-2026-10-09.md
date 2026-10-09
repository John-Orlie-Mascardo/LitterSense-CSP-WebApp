# Background notification repair — 2026-10-09

The notification inbox and background push are separate. Production diagnostics confirmed recent sensor alerts were saved and returned by the authenticated inbox API, while FCM accepted the device push batches. The user's labeled test appeared in the bell but did not produce a system pop-up. Provider acceptance is not confirmation that a phone received or displayed the push.

The browser registration path previously obtained its token immediately after service-worker registration, without waiting for activation. Existing settings could verify a saved token but could not replace a stale device subscription or check local OS notification display.

This change waits for the active root worker with a bounded timeout, serializes token renewal and reconnection, and exposes registration errors instead of swallowing them. Network restoration retries enrollment. Settings now offers:

- **Reconnect notifications**: removes the current browser's old token from this owner, replaces the local FCM subscription, and registers the replacement. Other device tokens are retained. A failed server removal leaves the existing subscription intact for retry.
- **Check system notification**: calls the active worker's Notification API locally, without sending FCM or SMS. Success means the browser accepted the display request; the user must confirm actual display in the system notification panel.

Device verification still required: reconnect on phone and desktop, check local display, close the app, then confirm a new genuine sensor alert appears while using another app. This release does not claim that the activation race is the proven cause of the reported background failure. OS restrictions and push transport can still delay delivery.

No hardware or sensor freshness changes. Gas and RFID ingestion already queue their alerts on the server while the UI is closed. No unsolicited server test messages are sent by this change.

## Desktop display latency follow-up

Windows had disabled Chrome notification delivery (Enabled=0). Desktop repair enabled that sender, banners, and notification-center display. The user then confirmed system notifications appeared, but roughly20–30seconds after requesting the local check. Windows banner duration was five seconds; this does not establish why banner delivery was delayed.

The local check previously called serviceWorker.register() on every click and only started its15-second timeout after that call completed. Registration can fetch the worker script, unnecessarily making a local display check depend on the network. The follow-up reuses the matching activated root worker and bounds lookup, registration, and activation together. First installation and mismatched workers still require proper activation. Browser-managed worker update checks and the existing PWA registration remain in place.

The local check also re-alerts when its previous tagged check already exists, and reports browser display-request elapsed time. This elapsed time is not proof of visible Windows delivery. Actual desktop banner timing still requires a device retest after deployment.

Hardware and sensor freshness remain unchanged. The user chose accurate status with unchanged hardware; a five-second gas timeout would falsely expire data between normal uploads.
