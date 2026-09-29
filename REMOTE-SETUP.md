# LitterSense remote access

Production website: https://litter-sense-csp-web-app.vercel.app

This implementation sends sensor data to the existing authenticated sensor receiver and sends live JPEG frames through a separate relay. Home IP addresses are not used by the remote viewer. No router port forwarding or home computer is required.

## What has to be deployed

1. The modified Next.js website on Vercel, using the existing Firebase project.
2. `services/camera-relay` from the website repository on Render (one instance).
3. The updated CameraWebServer firmware on the ESP32-S3.
4. The updated `littersense_rfid_test` and `gas_sensor` firmware on their respective boards, if these are your active sketches.

The camera relay source is also in `CameraWebServer/cloud/relay`. It uses Node's built-in HTTP server and cryptography, with no npm dependencies.

## Hosting setup

The Vercel connector must be signed into an account with permission to manage the existing project. Changes are local until deployed. Do not paste account passwords, service account JSON, or API tokens into chat.

Create a private random shared relay secret (minimum 32 characters). For example, run the following command locally and copy its output only into the hosting dashboards:

```sh
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

In Render, create a Node web service linked to the website repository:

| Setting | Value |
| --- | --- |
| Root directory | `services/camera-relay` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Instances | 1 |
| `CAMERA_RELAY_SECRET` | The private random secret |
| `CAMERA_ALLOWED_ORIGINS` | `https://litter-sense-csp-web-app.vercel.app` |

`render.yaml` is an alternative Blueprint configuration. It specifies a free instance for initial testing; Render may spin it down while idle, so the first viewer request can take longer. Upgrade in Render only if you need an always-ready relay. A single instance is required because viewer demand and frames are held in memory; replicas would need shared routing/state. No disk is needed. Use Render's assigned HTTPS URL, without a path.

In Vercel, retain the existing Firebase variables and set:

| Variable | Value |
| --- | --- |
| `CAMERA_RELAY_URL` | `https://<your-relay>.onrender.com` |
| `CAMERA_RELAY_SECRET` | The same secret as Render |
| `CAMERA_APP_ORIGIN` | `https://litter-sense-csp-web-app.vercel.app` |

These variables are server-only: do not prefix them with `NEXT_PUBLIC_`. The existing `FIREBASE_SERVICE_ACCOUNT_BASE64` must be set for the same Firebase project as the website. Do not put a Firebase service account on an ESP32. If Firebase sign-in reports an unauthorized domain, add the Vercel hostname to Firebase Authentication's authorized domains.

Deploy the website after setting variables. Its existing build command `npm run check` runs lint, website tests, relay tests and the production build. The live site must allow devices to reach `/api/sensors` and `/api/camera/device-session` without Vercel's team-login deployment protection; these endpoints perform their own device authentication. Do not use protected preview URLs for firmware.

The new `cameraDevices` collection is accessed only by Firebase Admin; the existing default-deny Firestore rules protect it. No public camera collection or anonymous camera read rule is needed.

## Pair the camera once

1. Upload CameraWebServer using ESP32 package **3.3.11**, ESP32S3 Dev Module, the board's correct flash/PSRAM options, and USB CDC enabled if using native USB. This build was compiled for S3 with OPI PSRAM and 16 MB flash. Do not enable erase-all-flash on routine uploads because it removes Wi-Fi and camera pairing.
2. Log into the website. Open **Live View**, open the viewer if its Connect button appears, and choose **Pair camera → Create pairing code**. A new code replaces the previous camera pairing for that account.
3. Open Serial Monitor at 115200, choose Newline, and send `setup`. This opens the visible `LitterSense-Setup` hotspot even when the S3 is already connected to home Wi-Fi.
4. Join `LitterSense-Setup` (password `littersense`) and open `http://192.168.4.1`.
5. If needed, save the home Wi-Fi first. After it connects, send `setup` again and rejoin setup Wi-Fi.
6. Under **Remote camera**, paste the pairing code and save. The board restarts automatically. Pairing is stored locally; the raw key is never logged or stored by the website after being shown to you.
7. Rejoin normal Wi-Fi or use mobile data, then open Live View. Expect `Cloud camera: authenticated; waiting for a viewer.` on Serial Monitor. The board waits for internet time (NTP) before validating HTTPS certificates.

Frames are sent over verified HTTPS only while a viewer is requesting them. They are held temporarily in relay memory, never recorded. This is a live sequence of JPEG frames, not H.264/WebRTC video or audio. Frame rate depends on home upload speed and S3 memory/CPU; the initial loop aims for a few frames per second, not 30 FPS. The browser polls one frame at a time, renews short-lived authorization, pauses requests in background tabs, and removes stale images instead of showing them as live.

## Connect sensor/RFID boards

The downloaded sketches are staged for:

- `littersense_rfid_test` — RFID with ultrasonic entrance confirmation.
- `gas_sensor` — MQ digital inputs and ultrasonic presence.

Both join the hidden `LitterSense` hotspot with their existing credentials. Both cloud URLs are `https://litter-sense-csp-web-app.vercel.app/api/sensors`. The existing private provisioning tokens were preserved. They must match the saved provisioning token for the owner in the deployed website's Firebase project. Register each cat's full RFID EPC under the same account before testing visits. An unmatched tag is not counted as a registered cat visit.

Upload both updated sketches with ESP32 core 3.3.11. The uploader uses the core's CA certificate bundle and waits for NTP; it never uses `setInsecure()`. Local RFID-to-ultrasonic confirmation still uses mDNS on the S3 hotspot, so the gas board does not need a fixed IP. Sensor detection runs separately from cloud requests.

Expected serial messages:

- RFID: `SYNC: cloud heartbeat accepted`, then `SYNC: visit saved in cloud` after an acknowledged visit.
- Gas: `SYNC: gas/ultrasonic readings saved in cloud (HTTP 200)`.
- HTTP 400/404/422: check the provisioning token and Firebase owner/config records.
- HTTP 401/403 or an HTML login page: check deployment protection and device credentials.
- HTTP -1: check internet/NAPT, DNS, NTP and certificate verification.

RFID uploads retry the same event ID and dequeue only after the server acknowledges that ID. The existing queue holds 32 completed visits in RAM; it does not survive power loss. Gas uploads retain the latest snapshot. Historical gas logging and reboot-persistent RFID storage are not added by this change.

## End-to-end acceptance

1. Power on all boards, verify S3 internet sharing and successful cloud upload logs.
2. Turn off phone Wi-Fi and use mobile data. Log into the website and verify live camera frames, sensor state and RFID entry/exit.
3. Close all website tabs, complete a visit, reopen the site and confirm exactly one recorded visit.
4. Interrupt the home internet, complete a visit without powering off the RFID board, then reconnect. Verify offline indicators and one uploaded visit after recovery.
5. Open the website as a different account. It must not receive the first owner's camera or sensor readings.
6. Stop viewing and verify video upload stops within about ten seconds. Reopen and verify recovery.
7. Change the home Wi-Fi through S3 setup. No firmware URL or local IP edits should be needed.

Hardware upload, phone playback, NAPT throughput, and real RFID scans must be tested on the actual boards. A compile or simulated relay test does not verify those.
