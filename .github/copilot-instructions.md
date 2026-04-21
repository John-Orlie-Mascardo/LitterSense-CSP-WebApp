# LitterSense Workspace Instructions

**Project:** LitterSense CSP WebApp — IoT-enabled cat health monitoring PWA  
**Tech Stack:** Next.js 16 + React 19 + TypeScript + Firebase + Tailwind CSS 4  
**Status:** Pre-launch; using mock data, Firebase integration in progress

---

## 1. QUICK START

### Dev Commands
```bash
npm run dev      # Start Next.js dev server (localhost:3000)
npm run build    # Build static export to /dist
npm start        # Serve production build
npm run lint     # Run ESLint (no auto-fix by default)
```

### Project Structure
- **`app/`** — Next.js pages and routes (file-based routing)
- **`components/`** — Reusable React components (by feature: `dashboard/`, `cats/`, `settings/`, etc.)
- **`lib/`** — Shared code: Firebase config, contexts, hooks, utilities, mock data
- **`public/`** — Static assets, manifest.json, service worker

---

## 2. ARCHITECTURE OVERVIEW

### Why PWA Instead of Native?
LitterSense is a **Progressive Web App** because:
- **Single codebase** for all devices (no separate iOS/Android apps)
- **Instant updates** (no app store approval needed)
- **Works offline** (service worker + cache)

**Hardware Integration:** ESP32 microcontroller reads sensors → Firebase → web app fetches and displays data. PWA doesn't need direct Bluetooth access.

### Data Flow
```
Physical Sensors → ESP32 → Firebase (Firestore + Storage)
                              ↓
                         Next.js App
                         ↓
                    User's Browser (PWA)
```

### Rendering Strategy
- **Static Export:** Next.js builds static HTML/CSS/JS (no API routes, no Server Actions)
- **Client-Side Data Fetching:** React components fetch from Firebase on mount
- **Authentication:** Firebase Auth singleton + React Context + ProtectedRoute HOC

---

## 3. CODE CONVENTIONS

### Naming Conventions
| Category | Pattern | Example |
|----------|---------|---------|
| **Components** | PascalCase | `CatChip.tsx`, `StatCard.tsx` |
| **Utilities** | camelCase | `formatDuration()`, `getStatusColor()` |
| **Hooks** | `use*` prefix | `useAuth()`, `useNotificationPermission()` |
| **Types/Interfaces** | PascalCase | `CatData`, `NotificationSettings` |
| **CSS Classes** | kebab-case | `.litter-primary`, `.litter-alert` |
| **Custom Tailwind** | `litter-*` prefix | `bg-litter-primary`, `text-litter-alert` |

### Component Patterns

#### Status-Based Coloring
LitterSense uses a **three-tier status system** across the app:
```typescript
type HealthStatus = "healthy" | "watch" | "alert";

// Colors automatically applied:
// "healthy" → green (#34D399)
// "watch"   → amber (#FBBF24)
// "alert"   → red (#EF4444)
```

Use the `getStatusColor()` utility from [lib/utils/formatters.ts](lib/utils/formatters.ts):
```typescript
import { getStatusColor } from "@/lib/utils/formatters";

<div className={getStatusColor(cat.status)}>
  {cat.status}
</div>
```

#### Interactive Components Use `"use client"`
Client components (with interactivity) must have `"use client"` at the top:
```typescript
"use client";
import { useState } from "react";

export default function CatChip({ cat }: Props) {
  const [isSelected, setIsSelected] = useState(false);
  // ...
}
```

#### Reusable UI Components
Atomic UI components (Button, Card, Modal) live in `components/ui/` and accept props interfaces:
```typescript
interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: HealthStatus;
  trend?: "up" | "down" | "stable";
}

export default function StatCard({ label, value, unit, status }: StatCardProps) {
  // Render with flexibility
}
```

---

## 4. FIREBASE INTEGRATION

### Current State: Mock Data
**⚠️ The app currently uses mock data** from [lib/data/mockData.ts](lib/data/mockData.ts).  
Real Firestore integration is planned for Q2. See the comment in the file for the integration date.

### Firebase Setup
[lib/firebase.ts](lib/firebase.ts) uses a **singleton pattern** to avoid re-initialization:

```typescript
// Already initialized, just import and use
import { auth, db, storage } from "@/lib/firebase";

// Example: Listen to auth state
import { onAuthStateChanged } from "firebase/auth";
onAuthStateChanged(auth, (user) => {
  // Handle login/logout
});
```

#### Firebase Config
- Source: Environment variables (`NEXT_PUBLIC_*`)
- Exports: `auth` (Firebase Auth), `db` (Firestore), `storage` (Cloud Storage)
- **Do NOT export Firebase app directly** — keep it private for singleton pattern

### Authentication Context
[lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) wraps `RootLayout` and provides `useAuth()` hook:

```typescript
import { useAuth } from "@/lib/contexts/AuthContext";

export default function Dashboard() {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  
  return <div>{user.email}</div>;
}
```

### Protected Routes
Use the [components/ProtectedRoute.tsx](components/ProtectedRoute.tsx) HOC to guard pages:

```typescript
import ProtectedRoute from "@/components/ProtectedRoute";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  );
}
```

### Security Rules
See [firestore.rules](firestore.rules) for Firestore security rules. Current setup restricts user data access to the authenticated user:
```
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}
```

---

## 5. TYPESCRIPT & TYPES

### Data Models
Define TypeScript interfaces in the same file or in a dedicated `types/` folder:

```typescript
interface CatData {
  id: string;
  name: string;
  breed: string;
  age: number;
  status: "healthy" | "watch" | "alert";
  createdAt: Date;
}

interface NotificationSettings {
  enabled: boolean;
  alerts: ("health" | "maintenance")[];
}
```

### Props Interfaces
Always define props interfaces for components:

```typescript
interface CatCardProps {
  cat: CatData;
  onSelect?: (catId: string) => void;
  isSelected?: boolean;
}

export default function CatCard({ cat, onSelect, isSelected }: CatCardProps) {
  // ...
}
```

### Avoid `any`
Use `unknown` or more specific types instead.

---

## 6. STYLING & TAILWIND CSS

### Custom CSS Variables (Preferred)
Instead of using `dark:` prefixes in JSX, define custom CSS variables in [app/globals.css](app/globals.css):

```css
:root {
  --color-primary: #1E6B5E;
  --color-primary-dark: #34D399;
  --color-alert: #EF4444;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #34D399;
  }
}
```

Then use them in Tailwind:
```tsx
<div className="bg-[var(--color-primary)] text-white">
  Styled with CSS variables
</div>
```

### Responsive Design
LitterSense is **mobile-first**. Use Tailwind's responsive prefixes:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {/* Single column on mobile, 2 on tablet, 3 on desktop */}
</div>
```

### Fonts
- **Headings:** Outfit (bold, geometric)
- **Body:** Poppins (friendly, readable)

Both imported via Tailwind config. Use semantic HTML (`<h1>`, `<h2>`, etc.) for heading hierarchy.

---

## 7. HOOKS & UTILITIES

### Custom Hooks
Reusable logic lives in [lib/hooks/](lib/hooks/):

- **`useAuth()`** — Get current user and auth state ([lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx))
- **`useNotificationPermission()`** — Request/check notification permission ([lib/hooks/useNotificationPermission.ts](lib/hooks/useNotificationPermission.ts))
- **`useSettings()`** — Fetch/update user settings ([lib/hooks/useSettings.ts](lib/hooks/useSettings.ts))
- **`useReports()`** — Fetch analytics reports ([lib/hooks/useReports.ts](lib/hooks/useReports.ts))

### Utility Functions
Shared utilities in [lib/utils/](lib/utils/):

- **`formatDuration(ms: number)`** — Convert milliseconds to readable duration
- **`getStatusColor(status: HealthStatus)`** — Return Tailwind class for status
- **`formatDate(date: Date)`** — Format date for display

---

## 8. COMMON TASKS

### Add a New Page
1. Create file in `app/` following file-based routing: `app/dashboard/new-page/page.tsx`
2. Use `"use client"` if the page is interactive
3. Wrap in `<ProtectedRoute>` if it requires authentication
4. Import and use hooks (e.g., `useAuth()`, custom hooks)

### Add a New Component
1. Create file in `components/` organized by feature
2. Define `Props` interface
3. Use `"use client"` only if the component has interactivity
4. Export as default export
5. Add to `components/index.ts` for easy imports (if applicable)

### Add a Custom Hook
1. Create in `lib/hooks/use*.ts`
2. Follow React hook naming convention (`use*`)
3. Return tuple or object (avoid multiple return parameters)
4. Include JSDoc comments explaining dependencies and side effects

### Connect to Firestore (When Integration Begins)
1. Import auth/db from [lib/firebase.ts](lib/firebase.ts)
2. Use Firebase SDK methods (`getDoc`, `query`, `getDocs`, etc.)
3. Handle loading and error states in the component
4. Cache data using React state or SWR/React Query (not yet in project)

---

## 9. COMMON PITFALLS & HOW TO AVOID

### ❌ Pitfall: Duplicate Mock Data Entries
**Problem:** If a cat exists in `mockCats` but not in `mockStats`, the dashboard shows "undefined".

**Solution:** Keep [lib/data/mockData.ts](lib/data/mockData.ts) in sync. Both arrays must have matching cat IDs.

```typescript
// ✅ Good
const mockCats = [{ id: "cat-1", name: "Whiskers" }, ...];
const mockStats = [{ catId: "cat-1", ... }, ...];

// ❌ Bad
const mockCats = [{ id: "cat-1" }, { id: "cat-2" }];
const mockStats = [{ catId: "cat-1" }, ...]; // Missing cat-2
```

### ❌ Pitfall: Forgetting `"use client"` on Interactive Components
**Problem:** Event handlers (`onClick`, `onChange`) fail silently because the component runs on the server.

**Solution:** Always add `"use client"` at the top of components with React hooks or event handlers.

```typescript
"use client"; // ← Required for useState, onClick, etc.
import { useState } from "react";

export default function Button() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Click me</button>;
}
```

### ❌ Pitfall: Static Export Limitations
**Problem:** API routes (`/api/*`) and Server Actions don't work with static export.

**Solution:** Use client-side Firebase fetching instead of API routes. Keep business logic in utility functions.

```typescript
// ✅ Good (client-side)
import { query, collection, where } from "firebase/firestore";

export async function getCatsByUserId(userId: string) {
  const q = query(collection(db, "cats"), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data());
}

// ❌ Avoid (won't work with static export)
// API routes like app/api/cats/route.ts
```

### ❌ Pitfall: Re-initialization of Firebase
**Problem:** Firebase is initialized multiple times, causing memory leaks.

**Solution:** Import from [lib/firebase.ts](lib/firebase.ts) singleton, never call `initializeApp()` directly.

```typescript
// ✅ Good
import { db } from "@/lib/firebase";

// ❌ Avoid
import { initializeApp } from "firebase/app";
const app = initializeApp(config); // Don't do this
```

### ❌ Pitfall: Notification Permission Re-prompt Delay
**Problem:** Users dismiss notification permission, but the app immediately re-prompts after service worker activation.

**Solution:** Respect the **24-hour delay** between re-prompts (see [lib/hooks/useNotificationPermission.ts](lib/hooks/useNotificationPermission.ts)).

### ❌ Pitfall: Bulk CSS Replacement (Dark Mode)
**Problem:** Previous attempts to toggle dark mode globally broke styling (duplicate `dark:` prefixes).

**Solution:** Use CSS variables and `prefers-color-scheme` media query instead of bulk `dark:` replacement. See cleanup script in [theme-replace.js](theme-replace.js) for context.

---

## 10. KEY FILES REFERENCE

| File | Purpose | Key Exports |
|------|---------|------------|
| [lib/firebase.ts](lib/firebase.ts) | Firebase singleton initialization | `auth`, `db`, `storage` |
| [lib/contexts/AuthContext.tsx](lib/contexts/AuthContext.tsx) | Auth provider + `useAuth()` hook | `AuthProvider`, `useAuth()` |
| [components/ProtectedRoute.tsx](components/ProtectedRoute.tsx) | Higher-order component for auth guards | `ProtectedRoute` |
| [lib/data/mockData.ts](lib/data/mockData.ts) | Mock cats, stats, and settings (temporary) | `mockCats`, `mockStats`, `mockSettings` |
| [app/globals.css](app/globals.css) | Global styles, CSS variables, fonts | CSS custom properties |
| [next.config.ts](next.config.ts) | Next.js static export config | Static build output |
| [lib/utils/formatters.ts](lib/utils/formatters.ts) | Utility functions (date, status color) | `formatDuration()`, `getStatusColor()` |
| [app/dashboard/page.tsx](app/dashboard/page.tsx) | Main dashboard (exemplar for component patterns) | Main dashboard page |
| [components/dashboard/StatCard.tsx](components/dashboard/StatCard.tsx) | Reusable stat display (exemplar UI component) | `StatCard` |
| [firestore.rules](firestore.rules) | Firestore security rules | Security policy |

---

## 11. DEVELOPMENT WORKFLOW

### Before Committing
1. Run `npm run lint` and fix issues
2. Test authentication flow manually (login/logout)
3. Verify mock data is consistent across `mockCats` and `mockStats`
4. Check that new pages/components have proper TypeScript types

### When Adding Features
1. **New Page?** Follow file-based routing in `app/`
2. **New Component?** Organize by feature in `components/`
3. **New Hook?** Use `lib/hooks/` and follow `use*` naming
4. **New Utility?** Add to `lib/utils/` with clear exports
5. **Styling?** Use CSS variables + Tailwind, avoid `dark:` prefixes in JSX

### Code Review Checklist
- [ ] TypeScript types defined for all props and return values
- [ ] `"use client"` present on interactive components
- [ ] No hardcoded values (use constants or env vars)
- [ ] Mock data in sync (if touching mockData.ts)
- [ ] Error states handled (loading, 404, etc.)
- [ ] Responsive design tested on mobile

---

## 12. FUTURE ROADMAP

- [ ] **Firebase Firestore Integration** (Real data, away from mock data)
- [ ] **Cloud Functions** (Anomaly detection for health alerts)
- [ ] **Cloud Storage** (Photo uploads from dashboard)
- [ ] **Service Worker Notifications** (Push alerts for health events)
- [ ] **Offline Support** (Cache data, sync on reconnect)
- [ ] **Analytics** (Track app usage, user retention)

---

## 13. QUICK LINKS

- **Project README:** [README.md](README.md)
- **Firebase Security Rules:** [firestore.rules](firestore.rules)
- **ESLint Config:** [eslint.config.mjs](eslint.config.mjs)
- **Next Config:** [next.config.ts](next.config.ts)
- **TypeScript Config:** [tsconfig.json](tsconfig.json)

---

**Last Updated:** March 2026  
**Next Review:** Q2 2026 (post-Firebase integration)
