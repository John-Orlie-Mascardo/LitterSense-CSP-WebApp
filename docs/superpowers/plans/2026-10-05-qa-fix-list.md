# LitterSense QA Fix List Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task in this session.

**Goal:** Complete the user's five ordered fixes while preserving sensor collection, dark styles, and existing alert preferences.

**Architecture:** Remove only the specified presentation elements. Reuse the profile phone normalizer, trusted account backup, and server alert outbox for independent SMS and push delivery; extend the existing predictive evidence helper and page for sparse data.

**Tech Stack:** Next.js, React, Firebase/FCM, Supabase Postgres, IPROG SMS, existing Node test runner.

**Spec:** User's October 5 fix list; QA.pdf provides screenshots only.

## Global Constraints

- Work in numbered order; no unrelated fixes or hardware changes.
- Hide cards without stopping providers, heartbeat polling, or alert collection.
- Profile phoneNumber is the SMS authority; valid Philippine numbers enable SMS automatically.
- Preserve notification preferences, quiet hours, deduplication and owner isolation.
- Show all final SMS templates; distinguish simulated checks from actual delivery.

## Review Focus

- Invalid/empty profile phone must skip SMS without breaking backup or push.
- Firebase quota failures must preserve the trusted mirrored phone/tokens.
- More than one device and concurrent workers must not duplicate each channel's alert.
- Sparse AI results must not imply an established baseline or convert digital gas flags to invented ppm.
- Service worker scope, stale tokens and iOS installation requirements must be explicit.

### Task 1: Home display and header

Files: app/dashboard/page.tsx; components/layout/TopBar.tsx.
- [x] Remove the two StatCard renderings and presentation-only arguments; keep useDeviceSensors and RfidVisitBridge running.
- [x] Give brain/bell controls identical 40px flex-centered boxes with 20px icons and consistent spacing.
- [x] Check existing UI contracts and mobile/desktop layout.

### Task 2: Add Cat scanner

File: app/dashboard/cats/page.tsx.
- [x] Replace editable RFID field with read-only scanned value plus scan button; retain existing three-scan enrollment and hint.
- [x] Check scan callback still fills verified tag and existing save/duplicate validation remains intact.

### Task 3: Profile SMS and messages

Files: app/dashboard/settings/page.tsx; lib/utils/phoneNumber.ts; lib/utils/smsAccountSync.ts; lib/utils/smsDelivery.ts; lib/utils/sensorSms.ts; app/api/sms/settings/route.ts; app/api/sms/test/route.ts; docs SMS migration/check files.
- [x] Hide SmsSettings card; preserve background SmsAccountSync.
- [x] Test profile normalization (+63 with national, local and full numbers), strict Philippine mobile validation and non-crashing invalid-number sync.
- [x] Change claims, recipient checks and tests to profile-backed phone_number; retire legacy number writes/read paths without deleting legacy data.
- [x] Add alert-specific ASCII templates with Manila time and actual context; test length, placeholders and one-alert/one-message behavior.
- [x] Inspect IPROG account footer and resolve its literal placeholder suffix; document any provider approval dependency.

### Task 4: Sparse predictive analysis

Files: app/dashboard/predictive-health/page.tsx; lib/utils/predictiveHealth.ts; lib/utils/predictiveHealth.test.cjs.
- [x] Find actual baseline establishment rule before writing progress copy.
- [x] Test zero/one/two-session evidence and confidence; show recorded visits, today's count and available chart points.
- [x] Include current environment flags and availability without inventing gas readings.
- [x] Show general sourced guidance and zero-session setup steps; keep vet note.

### Task 5: Push pipeline

Files: lib/utils/firebaseMessaging.ts; public/sw.js; public/manifest.json; lib/hooks/useNotificationPermission.ts; components/onboarding/OnboardingFlow.tsx; components/dashboard/PushNotifications.tsx; lib/utils/pushDelivery.ts; app/api/push routes; alert outbox SQL; app/api/sms/process/route.ts; app/api/sensors/route.ts; lib/contexts/NotificationContext.tsx.
- [x] Test root-scope worker payload handling, foreground display, permission-after-tap, token registration and multi-device persistence.
- [x] Add independent push processing to the same server alert path/worker that handles SMS, including invalid-token removal and preferences/quiet hours.
- [x] Show iOS 16.4+/Home Screen hint and an explicit enable/test control.
- [x] Verify all ten checklist points; run full npm run check and report physical delivery limits.

## Release

- [x] Review scoped diff and save work in Git.
- [x] Provide per-item files, final templates, known limits and user SMS/push test steps.


## Execution ledger

- Tasks 1-2: exact UI removals/read-only Add Cat; background providers unchanged. Page/header tests passed. Built TopBar measured equal 44px controls, 20px icons and 8px gap at 1280px/390px. Physical enrollment remains user verification.
- Task 3: watched profile normalization and missing-template tests fail, implemented profile authority and per-reason templates, then passed phone/template/account/delivery tests. Footer removed by user, pending IPROG approval; header retained.
- Task 4: watched sparse overview/evidence tests fail, added actual records/chart points/confidence/environment, then passed. Baseline rule is seven days; absent automatic calculation reported and deferred. Real Gemini synthetic two-visit smoke test returned valid preliminary low-confidence report.
- Task 5: native FCM payload test failed before worker fix and passed afterward. Added independent claims, sender, registration, foreground notice, invalid token cleanup, logout cleanup and iPhone hint. Final read-only reviewer found admin logout omission; fixed. Closed-app RFID creation limitation reported and retained.
- Final gates: 274 app tests, 4 camera relay tests, lint, TypeScript and build green locally and in Vercel. Focused final-review checks green.
- Approved release: commit fa2af10; Vercel dpl_HqQd6FMxv4hXY3KYtKBjoCpshU57 READY/production alias; Supabase qa_profile_sms_and_push_alerts_20261005 applied. Synthetic SQL assertions passed and rolled back, leaving zero synthetic rows/backlog. Live public assets 200, unauthenticated push 401, protected worker 200 (SMS enabled).
- Live acceptance: user confirms PC push displayed; Android browser URL notice is not confirmed push and needs clarification. No iOS device available. IPROG approval and physical three-scan check remain external verification.
- Review minor: background registration renewal is silent on failure, but explicit Settings action shows actionable error. Retained; errors may be reviewed later without changing alert behavior.
- Android follow-up: user confirmed Chrome and enabled push. Found a shared-account test limit with misleading duplicate queue acknowledgement. Added failing device-specific route test, implemented authenticated target verification/hash and explicit duplicate 429, then green focused tests/lint/TypeScript. Saved 51f92ea and deployed dpl_BPWbKBXVcxYr4HmsUc2VimaFcajE READY with full Vercel check. Asked user for Android retest; physical display confirmation pending.
