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
- [ ] Remove the two StatCard renderings and presentation-only arguments; keep useDeviceSensors and RfidVisitBridge running.
- [ ] Give brain/bell controls identical 40px flex-centered boxes with 20px icons and consistent spacing.
- [ ] Check existing UI contracts and mobile/desktop layout.

### Task 2: Add Cat scanner

File: app/dashboard/cats/page.tsx.
- [ ] Replace editable RFID field with read-only scanned value plus scan button; retain existing three-scan enrollment and hint.
- [ ] Check scan callback still fills verified tag and existing save/duplicate validation remains intact.

### Task 3: Profile SMS and messages

Files: app/dashboard/settings/page.tsx; lib/utils/phoneNumber.ts; lib/utils/smsAccountSync.ts; lib/utils/smsDelivery.ts; lib/utils/sensorSms.ts; app/api/sms/settings/route.ts; app/api/sms/test/route.ts; docs SMS migration/check files.
- [ ] Hide SmsSettings card; preserve background SmsAccountSync.
- [ ] Test profile normalization (+63 with national, local and full numbers), strict Philippine mobile validation and non-crashing invalid-number sync.
- [ ] Change claims, recipient checks and tests to profile-backed phone_number; retire legacy number writes/read paths without deleting legacy data.
- [ ] Add alert-specific ASCII templates with Manila time and actual context; test length, placeholders and one-alert/one-message behavior.
- [ ] Inspect IPROG account footer and resolve its literal placeholder suffix; document any provider approval dependency.

### Task 4: Sparse predictive analysis

Files: app/dashboard/predictive-health/page.tsx; lib/utils/predictiveHealth.ts; lib/utils/predictiveHealth.test.cjs.
- [ ] Find actual baseline establishment rule before writing progress copy.
- [ ] Test zero/one/two-session evidence and confidence; show recorded visits, today's count and available chart points.
- [ ] Include current environment flags and availability without inventing gas readings.
- [ ] Show general sourced guidance and zero-session setup steps; keep vet note.

### Task 5: Push pipeline

Files: lib/utils/firebaseMessaging.ts; public/sw.js; public/manifest.json; lib/hooks/useNotificationPermission.ts; components/onboarding/OnboardingFlow.tsx; components/dashboard/PushNotifications.tsx; lib/server/pushDelivery.ts; app/api/push routes; alert outbox SQL; app/api/sms/process/route.ts; app/api/sensors/route.ts; lib/contexts/NotificationContext.tsx.
- [ ] Test root-scope worker payload handling, foreground display, permission-after-tap, token registration and multi-device persistence.
- [ ] Add independent push processing to the same server alert path/worker that handles SMS, including invalid-token removal and preferences/quiet hours.
- [ ] Show iOS 16.4+/Home Screen hint and an explicit enable/test control.
- [ ] Verify all ten checklist points; run full npm run check and report physical delivery limits.

## Release

- [ ] Review scoped diff and save work in Git.
- [ ] Provide per-item files, final templates, known limits and user SMS/push test steps.
