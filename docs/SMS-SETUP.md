# SMS setup progress

## Step 2: private account backup

Project: LitterSense SMS (`yrshzmpyiibchtznbjkv`), Singapore.

Set these **server-only** variables locally and later in Vercel:

```
SUPABASE_URL=https://yrshzmpyiibchtznbjkv.supabase.co
SUPABASE_SECRET_KEY=<server secret key from Supabase Settings / API Keys>
IPROGSMS_API_TOKEN=<existing IPROG token>
```

Never use NEXT_PUBLIC_ for either secret. Restart the local app after changing its environment.

The dashboard automatically calls `POST /api/sms/sync` on login and configuration changes. It requires the signed-in Firebase ID token in the Authorization Bearer header. The server reads the authenticated owner's profile, cats, cat details, notification preferences and provisioning record directly from Firebase. It validates device ownership, hashes the device token with SHA-256, and atomically updates the SMS backup. Browser-submitted owner IDs and phone numbers are ignored.

Only phone number, health alert preferences, cat names, RFID tags, baselines and hashed device ownership are copied. Wi-Fi credentials, photos and provider secrets are excluded. Public browser roles cannot read or change the backup tables or call the sync function. RLS is enabled with no public policies intentionally; service_role is the only API role granted access.

Failed Firebase reads preserve the last successful backup. Initial sync must happen before a Firebase quota outage. Changes made during an outage will not reach the backup until syncing succeeds. Existing owners sync when they open the updated dashboard; owners who have not opened it are not bootstrapped yet.

Verification: `node --test lib/utils/smsAccountSync.test.mjs` checks authentication, owner isolation, token hashing, invalid phone rejection and preservation on quota failure. Database verification exercised atomic replacement/token rotation in a rolled-back transaction and checked RLS and anonymous privileges.

## Release verification still pending

- Bootstrap actual cat/device records after Firestore quota recovery.
- Verify the deployed SMS controls with the signed-in owner.
- Enable sending only after recipient confirmation, then verify a real SMS reaches the phone.

No SMS sending is enabled in Step 2.

## Step 3: sensor-triggered queue

`/api/sensors` now evaluates SMS after a successful sync or during a Firebase quota/service failure. It resolves hashed device ownership from Supabase, matches one registered cat, and queues alerts using existing activity thresholds. Short/incomplete sessions, unknown/ambiguous tags, missing stable event IDs, records older than 24 hours and timestamps over five minutes into the future do not produce cat SMS. Unattributed gas readings create box-level alerts using the existing ammonia/H2S preferences.

The database serializes each owner's ingestion transaction. Unique event keys prevent duplicate visits and alerts. The same cat/reason is limited to one queued message per hour; repeated active gas readings do not create another alert. Frequent-visit counts use the existing six-visit warning threshold and Asia/Manila day boundaries. These counts start with visits received by the SMS integration; historical Firebase daily totals are not included. Therefore the first partial monitoring day can undercount frequency. Duration/firmware abnormal and gas alerts are unaffected.

The queue stores pending messages only. `sms_enabled` defaults to false; no provider sender or delivery worker is enabled in this phase. Sender setup must honor recipient opt-in, current preferences, quiet hours, account/device revocation and provider delivery status. Before enabling sending, account deletion must also remove the backup and cancel pending messages. Use the current owner phone number at send time rather than copying it into every queued message.

Firestore errors retain their original status and never acknowledge visit history merely because SMS queued. If Firebase saves a visit but Supabase fails, the endpoint returns 503 without an ack so the existing firmware can retry; Firebase visit deduplication prevents another history entry.

Checks: `node --test lib/utils/sensorSms.test.mjs app/api/sensors/rfid.integration.test.mjs`. Rolled-back database simulations verify duplicate visits, repeated gas readings, cooldown, preferences, frequency counts and public-role restrictions. No real SMS was sent.

## Step 4: recipient controls and delivery worker

Settings now includes SMS Alerts. Each owner explicitly saves a Philippine mobile number and opts in. SMS recipient settings are stored directly in Supabase through an authenticated server endpoint and can be disabled even during a Firestore quota outage. The SMS number is separate from the profile number and is not overwritten by later Firebase backup syncs. Enabling SMS or changing the number cancels old pending messages to avoid sending an unexpected backlog.

The worker atomically claims at most two messages. Before sending, it rechecks the current recipient, alert preferences, cat registration, quiet hours (Asia/Manila) and Firebase Auth account existence/disabled status. Firebase Auth checks do not depend on Firestore document quota. Device revocation deletes related queued alerts; the existing admin account-deletion endpoint removes SMS data first. Changes made directly in Firebase during an outage cannot reach the backup until sync recovers.

IPROG acceptance is recorded separately from delivery. The documented `completed` delivery status is mapped to delivered. Timeout, interrupted worker or an ambiguous provider response is marked unknown; these messages are not blindly retried. Definitively failed and unknown messages remain visible for inspection in Settings. Automatic retry is limited to failures known to happen before contacting IPROG (such as a temporary account-check error).

Server-only variables:

```
SMS_SENDING_ENABLED=false
SMS_PROCESS_SECRET=<random 64-character hexadecimal secret>
```

The provider token and worker secret are sensitive Vercel variables. The send gate stays false during setup. The protected `/api/sms/process` endpoint requires the worker secret; it accepts no recipient from its request body. Supabase Cron is configured to call it every minute, with the secret held in Vault. The job starts paused and must be activated only after the production endpoint is verified. The job retains SMS event/delivery records for 30 days. Sensor-triggered processing uses Next.js `after()` so provider latency does not delay the device's sensor acknowledgement.

The Settings test button confirms credit use and enforces one test message per owner per hour. Tests never invent a cat health incident. Saving settings and building/deploying the application do not send messages.

Checks: `npm run check` (lint, app tests, relay tests, build), `node --test lib/utils/smsDelivery.test.mjs`, and the rolled-back `docs/sms-delivery-check.sql` database check.

Supabase informational notices for RLS without policies are intentional: browser roles have no table/function privileges; server access uses the secret key. [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Provider references: [IPROG API](https://www.iprogsms.com/api/v1/documentation), [delivery status guide](https://www.iprogsms.com/blog/building-sms-notifications-into-your-app-developers-guide). Scheduling: [Supabase Cron and Vault](https://supabase.com/docs/guides/functions/schedule-functions). Response lifecycle: [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
