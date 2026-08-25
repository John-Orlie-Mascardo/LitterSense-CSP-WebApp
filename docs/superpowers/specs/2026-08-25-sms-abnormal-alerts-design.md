# Abnormal Behavior SMS Alerts

## Goal

Send a formal SMS to the signed-in cat owner's saved Philippine phone number when the ESP32 records a real abnormal litter-box session. The alert must work while the dashboard is closed, must not expose the iProgSMS token to the browser, and must not send duplicate messages for the same session.

## Alert Message

`LitterSense alert: Abnormal behavior was detected for {cat}. Observe your cat and consult a veterinarian if it persists. This alert is not a diagnosis.`

`{cat}` is replaced with the stored cat name. The copied HTML entity `&#x20;` is not part of the SMS.

## Architecture

The existing `POST /api/sensors` route remains the single ingestion point. After it successfully stores a new session, it identifies sessions already classified as anomalous by the existing sensor-sync logic. Demo data and normal sessions never trigger SMS.

For each abnormal session, the server:

1. Reads the owner profile from `users/{uid}`.
2. Requires a saved Philippine phone number and an enabled `smsAbnormalAlerts` preference.
3. Reads the cat name from `users/{uid}/cats/{catId}`.
4. Checks `users/{uid}/smsAlerts/{sessionId}` for an existing queued alert.
5. Sends one request to iProgSMS.
6. Records the queue result without failing or rolling back sensor ingestion.

The API token is read only from `IPROGSMS_API_TOKEN`. It must never use a `NEXT_PUBLIC_*` name or appear in browser code, Firestore, logs, responses, or committed files.

## Firestore Data

The existing profile fields remain the SMS destination:

- `users/{uid}.phoneNumber`
- `users/{uid}.phoneCountryCode`

The notification settings document gains:

- `users/{uid}/settings/notifications.smsAbnormalAlerts: boolean`

The setting defaults to `false`; the owner explicitly enables it in Settings.

Each attempted alert uses the abnormal session ID as its document ID:

- `users/{uid}/smsAlerts/{sessionId}.status`: `queued`, `failed`, or `skipped`
- `catId`, `providerMessageId`, `createdAt`, and `updatedAt`
- `error`: a safe provider error summary when sending fails

The API token and full provider response are never stored.

## Provider Request

The server sends JSON to `POST https://www.iprogsms.com/api/v1/sms_messages` with `api_token`, `phone_number`, and `message`. The default provider selection is used. A successful provider response is recorded as `queued`, not `delivered`, because iProgSMS processes the message asynchronously.

iProgSMS is treated as a Philippine SMS provider. Only `+63` destinations are eligible. Shared sender coverage may exclude Smart/TNT; production coverage for those networks requires an approved sender name from iProgSMS.

## Validation and Failure Handling

- Reject missing, non-Philippine, or malformed recipient numbers before contacting iProgSMS.
- Apply a short request timeout so provider latency does not hold the sensor route indefinitely.
- Never expose the API token or provider request URL in error output because the token is a request credential.
- Sensor/session persistence succeeds even when SMS sending fails.
- A queued alert is never sent again for the same session.
- Failed alerts are recorded for diagnosis but are not retried automatically in this version, avoiding accidental duplicate SMS and credit charges when a provider response is lost.

## Settings Experience

Add an `SMS abnormal behavior alerts` toggle under Notifications. It is disabled when no Philippine phone number is saved, with guidance to add one in Edit Profile. The existing phone field remains optional for users who do not want SMS.

## Testing

- Unit-test message construction, Philippine recipient conversion, abnormal-event eligibility, and duplicate decisions.
- Route-test successful queueing, provider rejection, missing configuration, disabled preference, and existing alert records with controlled dependencies.
- Run the existing sensor-sync tests, settings UI checks, TypeScript, lint on changed files, and the production build.

## Deliberate Scope Limit

This version sends one alert per abnormal session and records whether iProgSMS queued it. Delivery-status polling, automatic retries, multiple recipients, international SMS, and a delivery-history UI are excluded. Add a server-side outbox worker only when production monitoring shows failed delivery attempts need automated recovery.
