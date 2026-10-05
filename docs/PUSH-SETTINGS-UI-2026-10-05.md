# Simplified push settings

## Changes

- `components/dashboard/PushNotifications.tsx`: show "Notifications enabled on this device" after successful registration instead of the Enable button. Verify an already permitted device on mount and browser focus without asking for permission again.
- Keep Enable available for a device that needs setup or whose registration could not be verified. Permission requests still originate from a button tap.
- Move Send test push into a native, initially collapsed Notification troubleshooting section. Tests are disabled until registration is confirmed.
- `components/dashboard/PushNotifications.test.mjs`: exercise new setup, existing permission, registration failure and account switching. These checks cover the actual component; the external messaging call is stubbed.

## Verification

`npm run check` passed: lint, 284 app tests, 4 camera relay tests, TypeScript and production build. The first UI test run exposed an asynchronous test-harness flush issue; the harness now waits for pending promise continuations before checking the rendered state, and the full check passes.

Notification transport, gas/SMS cooldowns, alert preferences, database functions and the existing foreground notification component are unchanged. No messages were sent during these checks.

Ready for publishing approval. After deployment, verify that a registered phone shows the enabled label, Troubleshooting starts collapsed, and a new device still has an Enable button. Closed-app NH3/H2S delivery verification remains pending from the gas task.
