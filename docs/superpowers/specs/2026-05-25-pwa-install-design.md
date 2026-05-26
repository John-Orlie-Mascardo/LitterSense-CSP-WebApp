# PWA Install Feature — Design Spec
**Date:** 2026-05-25
**Branch:** laurenz-branch

---

## Overview

Add an Android PWA install prompt to LitterSense. When Chrome deems the app installable, a download icon button appears in the `TopBar` beside the notification bell, and an "Install App" row appears in the Settings page. Tapping either triggers the browser's native install dialog. iOS is out of scope.

---

## Existing Infrastructure

- `public/manifest.json` — already configured (`display: standalone`, correct icons, theme color `#1E6B5E`)
- `public/sw.js` — already exists; handles push notifications
- `app/layout.tsx` — manifest already linked via Next.js metadata
- `lib/hooks/useNotificationPermission.ts` — registers `sw.js`, but only when notification permission is granted

**Gap:** The service worker must be registered for `beforeinstallprompt` to fire. Currently it's tied to notification permission, so users who haven't granted notifications would never see the install prompt. The new hook fixes this by registering SW eagerly.

---

## Architecture

### 1. `lib/hooks/usePWAInstall.ts` (new)

**Responsibilities:**
- Register `sw.js` on mount (unconditionally, SSR-safe) so the install criteria are met
- Capture and hold the `beforeinstallprompt` event
- Detect if already running in standalone mode (`window.matchMedia('(display-mode: standalone)')`)
- Expose `isInstallable: boolean`, `triggerInstall(): Promise<void>`, `dismiss(): void`
- No localStorage needed — the button is small and unobtrusive; no dismiss action required
- After `triggerInstall()`, check `userChoice` from the deferred event: if `accepted`, clear the prompt and set `isInstallable: false`; if `dismissed`, keep prompt alive so user can try again from Settings

**State machine:**
```
idle → installable (beforeinstallprompt fires, not standalone)
installable → installed (user accepts native dialog → userChoice: "accepted")
installable → installable (user cancels native dialog → userChoice: "dismissed", stays visible)
```

**Returns:**
```ts
{
  isInstallable: boolean;   // true = show install UI
  triggerInstall: () => Promise<void>;
}
```

### 2. `components/layout/TopBar.tsx` (edit)

- Import and call `usePWAInstall()`
- In the right-side actions div (currently only has the bell), add a download icon button **before** the bell
- Rendered only when `isInstallable === true`
- Styled to match the existing bell button: `p-2 rounded-xl`, uses `var(--color-text)` icon color, hover uses `var(--color-bg)` background, `motion.button` with spring scale animation
- Uses `Download` icon from `lucide-react`
- `aria-label="Install app"`
- On click: calls `triggerInstall()`

### 3. `app/dashboard/settings/page.tsx` (edit)

- Import `usePWAInstall`
- Add an "App" section with a single `SettingsRow`:
  - `icon`: `Download` from lucide-react (already imported)
  - `label`: `"Install App"`
  - `description`: `"Add LitterSense to your home screen"`
  - `control`: a small `"Install"` button styled with `bg-litter-primary text-white rounded-xl px-4 py-1.5 text-sm font-medium`
  - `onClick` on the row: calls `triggerInstall()`
- Entire section is conditionally rendered: only shown when `isInstallable === true`

---

## Behaviour

| Scenario | Result |
|---|---|
| Android Chrome, not installed, manifest + SW valid | `beforeinstallprompt` fires → button + row visible |
| Already running in standalone (installed) | `isInstallable: false` → no UI shown |
| User taps Install, accepts dialog | `isInstallable: false` → UI disappears |
| User taps Install, cancels dialog | `isInstallable` stays true → UI stays (can retry) |
| iOS Safari | No `beforeinstallprompt` → nothing shown |
| Desktop Chrome | `beforeinstallprompt` may fire → button visible (acceptable) |

---

## Files Changed

| File | Change |
|---|---|
| `lib/hooks/usePWAInstall.ts` | **Create** |
| `components/layout/TopBar.tsx` | **Edit** — add install button in right actions |
| `app/dashboard/settings/page.tsx` | **Edit** — add "App" section with Install row |

No new dependencies. No changes to `sw.js`, `manifest.json`, or `layout.tsx`.

---

## UI Design Rules

- Match existing TopBar icon button style exactly: `motion.button`, spring scale, `var(--color-text)` default, `var(--color-bg)` hover
- Match existing `SettingsRow` usage in settings page — icon in `bg-litter-primary-light` tile, `text-litter-primary` icon color
- Install button control uses `bg-litter-primary` pill style matching other action buttons in settings
- No new CSS classes — use only existing Tailwind tokens from the design system

---

## Out of Scope

- iOS "Add to Home Screen" instructions
- Offline caching / Workbox (sw.js stays push-only)
- Push notification permission changes
- PWA splash screen or standalone-mode UI changes
