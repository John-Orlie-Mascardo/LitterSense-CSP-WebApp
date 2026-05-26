# PWA Install Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android PWA install button to the TopBar and a Settings row so users can add LitterSense to their home screen.

**Architecture:** A `usePWAInstall` hook captures the browser's `beforeinstallprompt` event, registers `sw.js` eagerly (decoupled from notification permission), and exposes `isInstallable` + `triggerInstall()`. The TopBar renders a `Download` icon button next to the bell when installable. The Settings page renders an "Install App" `SettingsRow` under a new "App" section when installable.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Framer Motion, Lucide React, Tailwind CSS v4

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/hooks/usePWAInstall.ts` | **Create** | Capture `beforeinstallprompt`, register SW, expose install API |
| `components/layout/TopBar.tsx` | **Edit** | Add install icon button in right-side actions |
| `app/dashboard/settings/page.tsx` | **Edit** | Add "App" section with Install row |

---

## Task 1: Create `usePWAInstall` hook

**Files:**
- Create: `lib/hooks/usePWAInstall.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// lib/hooks/usePWAInstall.ts
"use client";

import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register SW eagerly so beforeinstallprompt fires regardless of notification permission
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    // Already running as installed PWA — no install UI needed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Hide install UI once app is installed
    window.addEventListener("appinstalled", () => {
      setIsInstallable(false);
      setPromptEvent(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      setIsInstallable(false);
      setPromptEvent(null);
    }
  }, [promptEvent]);

  return { isInstallable, triggerInstall };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd C:/Users/Admin/LitterSense-CSP-WebApp
npm run build
```

Expected: build succeeds or only pre-existing errors appear — no new errors from `usePWAInstall.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/usePWAInstall.ts
git commit -m "feat: add usePWAInstall hook"
```

---

## Task 2: Add install button to TopBar

**Files:**
- Modify: `components/layout/TopBar.tsx`

The existing right-side actions block starts at the comment `{/* Right side actions */}`. The install button goes **before** the bell `<div className="relative" ref={dropdownRef}>`.

The bell button style to match exactly:
```tsx
<motion.button
  whileHover={{ scale: 1.08 }}
  whileTap={{ scale: 0.92 }}
  transition={{ type: "spring", stiffness: 600, damping: 25 }}
  className="relative p-2 rounded-xl transition-colors"
  style={{ color: "var(--color-text)", background: "transparent" }}
  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)"; }}
  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
  ...
>
```

- [ ] **Step 1: Add `Download` to the lucide-react import and import the hook**

Find this line at the top of `components/layout/TopBar.tsx`:
```tsx
import { Bell, Check, Trash2, X } from "lucide-react";
```
Replace with:
```tsx
import { Bell, Check, Download, Trash2, X } from "lucide-react";
```

Add the hook import after the existing imports (after the last `import` line in the file):
```tsx
import { usePWAInstall } from "@/lib/hooks/usePWAInstall";
```

- [ ] **Step 2: Call the hook inside `TopBar`**

Find the line inside `export function TopBar()` that reads:
```tsx
  const [dropdownOpen, setDropdownOpen] = useState(false);
```
Add the hook call on the line directly above it:
```tsx
  const { isInstallable, triggerInstall } = usePWAInstall();
  const [dropdownOpen, setDropdownOpen] = useState(false);
```

- [ ] **Step 3: Add the install button before the bell**

Find this exact block (the start of right-side actions):
```tsx
        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* Notification bell + dropdown */}
          <div className="relative" ref={dropdownRef}>
```
Replace with:
```tsx
        {/* Right side actions */}
        <div className="flex items-center gap-2">
          {/* PWA install button */}
          {isInstallable && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 600, damping: 25 }}
              className="relative p-2 rounded-xl transition-colors"
              style={{ color: "var(--color-text)", background: "transparent" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              onClick={() => void triggerInstall()}
              aria-label="Install app"
            >
              <Download className="w-5 h-5" />
            </motion.button>
          )}

          {/* Notification bell + dropdown */}
          <div className="relative" ref={dropdownRef}>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/layout/TopBar.tsx
git commit -m "feat: add PWA install button to TopBar"
```

---

## Task 3: Add Install row to Settings page

**Files:**
- Modify: `app/dashboard/settings/page.tsx`

The Settings page already imports `Download` from lucide-react and uses `SettingsRow`. The new "App" section goes **between** the Appearance section and the Account section (around line 557 — the `{/* Account Section */}` comment).

`SettingsRow` signature for reference:
```tsx
<SettingsRow
  icon={IconComponent}
  label="Row label"
  description="Optional description"
  control={<ReactNode />}
  onClick={() => void handler()}
/>
```

- [ ] **Step 1: Import the hook**

Find the last `import` statement in `app/dashboard/settings/page.tsx`. It will be one of the firebase imports. Add after it:
```tsx
import { usePWAInstall } from "@/lib/hooks/usePWAInstall";
```

- [ ] **Step 2: Call the hook inside `SettingsPage`**

Find this line inside `export default function SettingsPage()`:
```tsx
  const router = useRouter();
```
Add the hook call directly after it:
```tsx
  const { isInstallable, triggerInstall } = usePWAInstall();
```

- [ ] **Step 3: Add the "App" section between Appearance and Account**

Find this exact comment in the JSX:
```tsx
        {/* Account Section */}
```
Insert the following block immediately before it:
```tsx
        {/* App Section */}
        {isInstallable && (
          <div>
            <h3 className="font-body text-xs font-semibold tracking-widest text-theme-muted uppercase px-1 mb-2 mt-6">
              App
            </h3>
            <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border divide-y divide-litter-border overflow-hidden">
              <SettingsRow
                icon={Download}
                label="Install App"
                description="Add LitterSense to your home screen"
                control={
                  <button
                    onClick={() => void triggerInstall()}
                    className="bg-litter-primary text-white rounded-xl px-4 py-1.5 text-sm font-medium active:opacity-80 transition-opacity"
                  >
                    Install
                  </button>
                }
              />
            </div>
          </div>
        )}

        {/* Account Section */}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/settings/page.tsx
git commit -m "feat: add Install App row to Settings page"
```

---

## Task 4: Manual verification on Android Chrome

- [ ] **Step 1: Push the branch and open the Vercel preview URL on an Android device with Chrome**

```bash
git push
```

- [ ] **Step 2: Verify install button appears in TopBar**

After navigating to the dashboard on Android Chrome:
- The `Download` icon button should appear in the TopBar to the left of the bell
- Tapping it should trigger Chrome's native "Add to Home Screen" dialog
- After accepting, the button should disappear from the TopBar

- [ ] **Step 3: Verify Settings row appears**

- Navigate to Settings
- The "App" section should appear between Appearance and Account
- The "Install" button should trigger the same native dialog
- After installing, the entire "App" section should disappear

- [ ] **Step 4: Verify no UI shown when already installed**

- Open the app from the home screen icon (standalone mode)
- Neither the TopBar button nor the Settings row should be visible

- [ ] **Step 5: Verify on desktop Chrome (acceptable secondary)**

- The install button may appear on desktop Chrome too — this is expected and acceptable per spec

---

## Self-Review Notes

- `BeforeInstallPromptEvent` is not in standard `@types/dom` — defined inline in the hook to avoid needing a separate `.d.ts` file
- SW registration in the hook is idempotent — `navigator.serviceWorker.register("/sw.js")` called twice (once here, once via `useNotificationPermission` when notification is granted) is harmless
- `appinstalled` event listener cleanup is omitted intentionally — it only fires once and the component is mounted for the app lifetime
- No `dismiss()` API — the button has no X; if the user cancels the native dialog, `isInstallable` stays true so they can retry from Settings
