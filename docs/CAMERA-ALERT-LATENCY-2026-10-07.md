# Camera and push latency investigation — 2026-10-07

## Status

Focused push fixes and remote camera diagnostics are deployed as
`dpl_pSE1rCVRGUbtRZhgcx9p8eUtobyg` on the existing production domain.
Camera dropout resolution, capture-to-display latency, phone delivery latency,
and the required five-minute uninterrupted camera test remain unverified.
No firmware was edited or flashed, and no USB connection was required.

## Baseline evidence

- Supabase project metadata: database in `ap-southeast-1` (Singapore).
- Before deployment, production response identified `sin1::iad1`: Singapore edge,
  Washington function. Afterwards, `sin1::sin1`; deployment inspection lists
  functions in `sin1`.
- Real outbox records: Urine queued at 10:04:45.600933 UTC, push claimed at
  10:04:56.404726, provider acceptance recorded at 10:05:00.817: **15.216 s**
  queue-to-acceptance. Stool queued at 10:08:00.516046, claimed at
  10:08:04.605079, acceptance 10:08:08.621: **8.105 s**.
  These are not sensor-to-phone measurements.
- User's browser screenshots: first interval **0 frames in 11.001 s**, then
  **17 / 10.009 s = 1.70 fps**, **45 / 10.991 s = 4.09 fps**,
  **42 / 10.003 s = 4.20 fps**, **45 / 10.997 s = 4.09 fps**.
  Last-frame age samples 61–619 ms measure time since local display update,
  not capture age. This screenshot sequence is not a five-minute test.
- Source inspection: firmware paced at 200 ms (maximum 5 fps), relay latest-frame
  retention 2 s, browser waiting threshold 2.5 s, frame removal after 10 s.
  Relay timestamp is already server receive time; browser freshness uses local
  elapsed time. WS is active in the screenshots. HTTP fallback has serialized
  requests and no-store caching. No evidence yet establishes capture clock skew,
  caching, decode failure, or publisher stalls as the dropout cause.
- Sensor firmware changes bypass 60 s idle / 15 s active heartbeat intervals;
  the upload guard is 1 s after a successful attempt, retries 5 s after failure.
  Ultrasonic requires two new samples, not a five-second hold: the 5 s constant
  is the confirmation request's expiry window. Source inspection is not proof of
  the exact flashed binaries or device-to-server timing.
- Three daily-stat requests timed out in the supplied console screenshots.
  The client deadline is 20 s. Those database requests are separate from the
  active WS image transport; their causal contribution is not established.

## Changes in this investigation

- `app/api/sensors/route.ts`: start push and SMS concurrently with independent
  error outcomes; SMS could previously delay push or skip it after a failure.
  Log receipt-to-queue duration without account details.
- `app/api/sensors/delivery-latency.test.mjs`: actual post-response callback
  regression tests for a blocked SMS provider and a failing provider in both
  gas and RFID ingestion. All four failed before the fix and pass afterwards.
- `lib/utils/pushDelivery.ts`: log and persist queue-to-provider and provider
  request durations for every alert; preserve existing gas per-device outcome
  evidence and all recipient/quiet-hours checks.
- `lib/server/operationalRecords.ts`: temporary timing for canonical recipient
  refresh, to measure remaining repeated database work before optimizing it.
- `vercel.json`: run functions in Singapore, alongside the operational database,
  eliminating the confirmed cross-continent route.
- `components/dashboard/RemoteCamera.tsx`: temporary startup, inter-frame gap,
  decode, relay-receive-age and socket-close diagnostics; one five-minute summary.
  Timestamp age is explicitly marked as including browser/server clock offset,
  and never used to reject frames. Stream pacing and freshness rules are unchanged.

## Before/after controlled probe

### Additional browser evidence

- Initial post-deployment startup: 1,424 ms. Active intervals delivered
  42 frames / 10,009 ms and 45 frames / 10,003 ms (4.20–4.50 fps).
  Decode averaged 1 ms, maximum 2 ms. Receipt ages were about -14.7 s,
  demonstrating browser/relay clock offset; these are not valid latency numbers.
- First five-minute summary: 300,065 ms, 1,086 frames, 3.62 fps, maximum
  gap 9,844 ms, four gaps over 2.5 s and one disconnect. Visibility was
  interrupted. Close code 1005 alone does not establish the cause.
- Subsequent summary: 360,815 ms, 341 frames, 0.95 fps, maximum gap
  167,526 ms, six gaps over 2.5 s, zero counted disconnects, stale at summary.
  Visibility was interrupted and a normally ten-second diagnostic tick took
  174,940 ms. Hidden-page time contaminated the aggregate; this is not evidence
  of a continuous 167-second camera publisher outage.
- Diagnostics now restart the foreground sample after visibility returns and log
  `Camera visibility timing`. Background pauses are excluded from the new sample.
  At that diagnostic release, transport, renewal and freshness thresholds were unchanged.
- Valid continuous-foreground run: 300,525 ms, 990 frames, 3.29 fps,
  maximum gap 17,489 ms, ten gaps over 2.5 s, one disconnect, and recovered
  by summary time. This establishes genuine foreground interruptions.
- Confirmed source defect: viewer renewal closed the active stream before the
  1.5 s reconnect delay, session authorization and WebSocket handshake. The fix
  requests a replacement while the old viewer continues receiving frames and
  closes the old viewer only after the first replacement image decodes. A failed
  replacement or session request keeps the old valid connection until its normal
  expiry. No ticket lifetime or authorization checks were weakened.
- Three actual-component regression tests failed before this renewal fix and pass
  afterwards: slow authorization, replacement failure, and teardown during renewal.
  Added per-gap relay-receipt deltas plus authorization/handshake/renewal timing.
  The renewal defect cannot explain all ten gaps; remaining publisher/transport
  stalls are not yet attributed and need these measurements.
- Renewal fix deployment is Ready on the existing production alias. The configured
  lint, app tests, relay tests and production build gate passed. Targeted three
  regression tests, changed-file lint and TypeScript checks also passed locally.
  A new continuous five-minute physical run is still required; no after-fix
  camera or phone latency claim is made.
- Owner-scoped gas snapshot received at 10:31:45.627 UTC; at 11:03:59 UTC it
  was 1,933.8 s old. Dashboard reads were returning 200. The three-minute stale
  indicator was correct; why device uploads stopped remains undetermined.

Same PC, same authenticated `/api/sms/process` request, five sequential samples,
all HTTP 200, empty queues, zero messages sent by these probes:

| | Before (Washington) | After (Singapore) |
|---|---|---|
| Samples, ms | 3568, 1311, 1199, 1392, 1427 | 372, 189, 469, 223, 420 |
| Median | 1392 ms | 372 ms |
| Range | 1199–3568 ms | 189–469 ms |

Median improved approximately 73%. This is worker/API response latency including
network travel from this PC, not event-to-phone latency. It is not a historical
Firebase comparison. Recent real alert numbers after deployment still need collection.

## Verification and next measurements

- Local full check: 349 app tests, 4 relay tests and production TypeScript build
  passed. Changed files have zero lint warnings/errors. Full local lint reported
  an existing unused variable in a private release QA script. Deployment is Ready
  after its configured full check; a CLI connection failure did not stop the build.
- Refresh Live once and leave it visible for five minutes. Expand
  `Camera five-minute timing` plus any `Camera connection timing` lines.
  The summary records visibility interruption, frame gaps, current stale state
  and connection closes. Scheduled ticket renewal closes must be distinguished
  from unexplained failures. Do not claim success if a gap exceeded the threshold.
- Compare startup and decode/gap timing. To establish the ~1 s **capture-to-screen**
  target, additional camera capture timing or a visual clock test is needed;
  relay receipt timestamps alone cannot prove it.
- One clearly labeled push test with SMS disabled is waiting for the user's
  phone readiness. Record queue time, provider request/acceptance and observed
  phone arrival separately. Do not replay old health events or resend SMS.
- FCM acceptance does not guarantee display. Network availability and phone/browser
  power restrictions can defer delivery; there is no defensible fixed extra latency
  figure for this phone without the live observation.
- Remove temporary diagnostic logging after collecting the required samples.

References: Vercel region guidance <https://vercel.com/docs/regions>;
FCM message lifespan <https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan>.
