# LitterSense — IoT-Enabled Feline Health Monitoring

> **A Progressive Web App for Filipino cat owners to detect early signs of FLUTD through smart litter box monitoring.**

---

## 1. PROJECT OVERVIEW

### What LitterSense Is

LitterSense is a complete health monitoring system for cats that turns an ordinary litter box into a smart medical diagnostic tool. The system uses sensors to track how often your cats use the litter box, how long they stay, and the air quality inside the box. By establishing what's "normal" for each individual cat, LitterSense can alert you when something changes — often weeks before you would notice symptoms yourself.

The primary health concern LitterSense addresses is **FLUTD (Feline Lower Urinary Tract Disease)**, which includes conditions like urinary blockages and bladder infections. These conditions are life-threatening for male cats in particular, and early detection is critical. A cat with a urinary blockage can go from fine to critical in 24-48 hours. Changes in litter box behavior — frequency of visits, time spent, straining — are often the first warning signs.

### Who It's For

LitterSense is designed specifically for **Filipino cat owners**, particularly those in:
- Multi-cat households (3+ cats) where monitoring individual behavior is difficult
- Urban areas with limited access to 24-hour veterinary care
- Homes where owners work long hours and can't observe their cats constantly
- Families with senior cats (7+ years) who are at higher risk for urinary issues

### Why a PWA Instead of Native App

We chose to build a **Progressive Web App** rather than separate iOS/Android native apps for several strategic reasons:

| Factor | PWA Approach | Native App Approach |
|--------|-------------|---------------------|
| Development | Single codebase | Two separate codebases (Swift + Kotlin) |
| Distribution | No app store approval needed | App Store/Play Store review process (days to weeks) |
| Updates | Instant deployment | Users must manually update |
| Storage | Uses browser cache (~10MB) | Full app install (50-100MB+) |
| Access | Works on any device with browser | Requires compatible OS version |
| Cost | Free for users and developers | $99/year Apple Developer fee |

**The Tradeoff:** PWAs cannot access certain native device features like Bluetooth Low Energy (for direct sensor pairing) or background location. For LitterSense, this was acceptable because the ESP32 microcontroller handles all sensor communication independently and pushes data to Firebase. The phone only needs to display data — it never needs to talk directly to the hardware.

### Data Flow: End-to-End

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW DIAGRAM                            │
└─────────────────────────────────────────────────────────────────────┘

  SENSORS          ESP32           FIREBASE           NEXT.JS          USER
     │               │                 │                 │              │
     │ 1. Read       │                 │                 │              │
     │────values────>│                 │                 │              │
     │               │                 │                 │              │
     │               │ 2. Process      │                 │              │
     │               │ (edge logic)    │                 │              │
     │               │                 │                 │              │
     │               │ 3. Send JSON    │                 │              │
     │               │────────────────>│                 │              │
     │               │                 │                 │              │
     │               │                 │ 4. Store in     │              │
     │               │                 │ Firestore       │              │
     │               │                 │                 │              │
     │               │                 │ 5. Real-time    │              │
     │               │                 │ push update     │              │
     │               │                 │────────────────>│              │
     │               │                 │                 │              │
     │               │                 │                 │ 6. Re-render │
     │               │                 │                 │ dashboard    │
     │               │                 │                 │─────────────>│
     │               │                 │                 │              │
     ▼               ▼                 ▼                 ▼              ▼
```

**Step-by-step:**
1. **Sensors** detect physical changes (weight on scale, RFID tag present, gas levels rising)
2. **ESP32** reads sensor values every 100ms, applies filtering, and decides if a "session" has started/ended
3. **ESP32** sends a JSON payload to Firebase Realtime Database over WiFi (using Firebase Arduino library)
4. **Firebase** stores the data and triggers any cloud functions (like anomaly detection)
5. **Firebase** pushes the update to all connected clients in real-time
6. **Next.js app** receives the update via `onSnapshot` listener and re-renders the UI
7. **User** sees new data instantly without refreshing the page

---

## 2. TECH STACK

### Next.js 14 (App Router)

**What it is:** A React framework that handles routing, server-side rendering, static generation, and API routes.

**Why chosen for LitterSense:**
- **App Router** allows mixing Server Components (fast, no JS bundle) with Client Components (interactive) in the same app
- **Static Export** (`output: 'export'`) generates pure HTML/CSS/JS files that can be hosted anywhere — critical for keeping costs low for a student capstone project
- **Image optimization** built-in (though we use `unoptimized: true` for static export compatibility)

**What it does in this codebase:**
- Handles all routing (`/login`, `/dashboard`, `/cats`)
- Renders pages at build time for instant loading
- Manages the HTML document shell (`layout.tsx`)

**Tradeoffs:**
- App Router has a steeper learning curve than the older Pages Router
- Static export means no API routes (we use Firebase directly instead)
- Server Actions are disabled in static export mode

---

### React 18

**What it is:** A JavaScript library for building user interfaces using components.

**Why chosen for LitterSense:**
- Component-based architecture lets us build reusable UI pieces (StatCard, CatChip)
- Declarative syntax makes UI state easier to reason about
- Largest ecosystem of any frontend framework — libraries like Framer Motion integrate seamlessly

**What it does in this codebase:**
- Powers all interactive UI (form inputs, tab switching, animations)
- Manages component state (which cat is selected, form values)
- Handles user events (clicks, form submissions)

**Tradeoffs:**
- Requires client-side JavaScript (we use "use client" directives for interactive components)
- JSX syntax adds build step complexity

---

### TypeScript

**What it is:** JavaScript with static type checking — catches errors at compile time instead of runtime.

**Why chosen for LitterSense:**
- Prevents entire classes of bugs (undefined values, wrong prop types)
- Autocomplete in VS Code makes development faster
- Self-documenting code — interfaces explain data shapes

**What it does in this codebase:**
- Defines data structures (`Cat`, `CatStats`, `ActivityItem` in `mockData.ts`)
- Ensures components receive correct props
- Catches Firebase data shape mismatches early

**Example from our code:**
```typescript
export interface Cat {
  id: string;
  name: string;
  status: "healthy" | "watch" | "alert";  // Only these three values allowed
  avatar: string | null;
}
```

**Tradeoffs:**
- Adds build time overhead
- Requires learning type syntax
- Can feel verbose for small projects (but pays off as projects grow)

---

### Tailwind CSS v4

**What it is:** A utility-first CSS framework where you write styles as class names directly in HTML/JSX.

**Why chosen for LitterSense:**
- No context-switching between CSS files and component files
- Consistent design system through configuration
- Smaller bundle size than component libraries (Material-UI, Chakra)
- v4 uses CSS-native configuration (no `tailwind.config.js` needed)

**What it does in this codebase:**
- All styling is done via utility classes (`bg-[#1E6B5E]`, `rounded-xl`, `shadow-sm`)
- Custom colors defined in `@theme inline` block in `globals.css`
- Responsive breakpoints handle mobile→desktop transitions (`lg:flex`, `sm:text-3xl`)

**Example from our code:**
```tsx
<motion.button
  className="w-full py-4 bg-[#1E6B5E] text-white font-semibold rounded-xl 
             shadow-lg shadow-[#1E6B5E]/25 hover:shadow-xl 
             hover:shadow-[#1E6B5E]/30 transition-all duration-200"
>
  Sign In
</motion.button>
```

**Tradeoffs:**
- HTML becomes verbose with many classes
- Learning curve to remember utility names
- PurgeCSS can accidentally remove used classes if not configured right

---

### Framer Motion

**What it is:** A React animation library that uses a declarative API for animations.

**Why chosen for LitterSense:**
- Declarative syntax fits React's mental model
- Handles complex orchestration (staggered animations, layout transitions)
- Works seamlessly with React's render cycle

**What it does in this codebase:**
- Entrance animations when pages load (`initial`, `animate` props)
- Staggered form field animations (`variants`, `staggerChildren`)
- Interactive feedback (`whileHover`, `whileTap` on buttons)
- Layout animations for tab indicator

**Example from our code:**
```tsx
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" }
  }
};
```

**Tradeoffs:**
- Adds ~30KB to bundle size
- Can impact performance if overused (many simultaneous animations)
- Learning curve for complex orchestration

---

### Firebase

**What it is:** Google's Backend-as-a-Service platform providing authentication, database, hosting, and more.

**Services used in LitterSense:**

#### Firebase Authentication
- Handles user login/signup (email/password and Google OAuth)
- Manages session persistence (stays logged in across page refreshes)
- Provides secure JWT tokens for API requests

#### Firestore (Database)
- NoSQL document database storing cats, sessions, users
- Real-time listeners (`onSnapshot`) push updates to connected clients
- Offline persistence (app works briefly without internet)

#### Realtime Database
- Used for immediate sensor data (faster writes than Firestore)
- ESP32 writes here; Next.js reads from here for "live" indicators

**Why chosen for LitterSense:**
- Zero backend code to write and maintain
- Real-time out of the box (WebSocket-like behavior)
- Generous free tier (50K reads/day, 20K writes/day)
- Firebase Arduino library makes ESP32 integration straightforward

**What it does in this codebase:**
- `lib/firebase.ts` initializes the Firebase app with environment variables
- `lib/useCatData.ts` hook subscribes to Firestore updates
- `app/login/page.tsx` uses Firebase Auth for authentication

**Tradeoffs:**
- Vendor lock-in (hard to migrate away from Firebase)
- Pricing can spike unexpectedly if queries aren't optimized
- Less control over data structure than a custom API
- Complex security rules syntax

---

### ESP32 Microcontroller

**What it is:** A low-cost WiFi and Bluetooth-enabled microcontroller (like a tiny computer) that can read sensors and connect to the internet.

**Why chosen for LitterSense:**
- Built-in WiFi means no separate module needed
- Dual-core processor handles multiple sensors simultaneously
- Low power consumption (can run on battery for hours)
- Firebase Arduino library exists for easy cloud connectivity
- Costs ~$5 USD vs. Raspberry Pi at ~$35 USD

**What it does in this project:**
- Reads all sensors every 100ms in a continuous loop
- Runs edge processing logic (detecting session start/end)
- Connects to home WiFi and sends data to Firebase
- Handles RFID tag reading to identify which cat is present

**Limitations:**
- Limited RAM (520KB) — can't store much data locally
- Single-threaded Arduino programming model (though dual-core)
- Requires 5V power supply (USB adapter or power bank)

---

### MQ-135 Gas Sensor

**What it is:** A sensor that detects air quality by measuring the concentration of various gases (ammonia, nitrogen oxides, benzene, smoke, CO2).

**Why chosen for LitterSense:**
- Detects ammonia — the primary component of cat urine odor
- Low cost (~$2 USD)
- Analog output compatible with ESP32 ADC pins
- Responds quickly to changes (seconds, not minutes)

**What it does:**
- Measures relative air quality inside the litter box enclosure
- Sharp increases in readings correlate with fresh urine deposits
- Baseline established during "empty box" periods; deltas trigger events

**Limitations:**
- Not calibrated for absolute ppm values (varies by temperature/humidity)
- Cross-sensitive to other gases (alcohol vapors, cigarette smoke)
- Requires 24-48 hour "burn-in" period for stable readings

---

### MQ-136 Gas Sensor

**What it is:** A sensor specifically tuned to detect hydrogen sulfide (H2S) and sulfur compounds.

**Why chosen for LitterSense:**
- Detects the "rotten egg" smell of sulfur compounds in cat waste
- Complements MQ-135 (different gas spectrum)
- Inexpensive (~$3 USD)

**What it does:**
- Provides secondary air quality data point
- High H2S readings with no corresponding weight change may indicate diarrhea
- Combined with MQ-135 gives more complete air quality picture

**Limitations:**
- Same calibration issues as MQ-135
- More sensitive to temperature than MQ-135

---

### Ultrasonic Sensor (HC-SR04)

**What it is:** A sensor that measures distance by emitting ultrasonic sound waves and timing the echo return.

**Why chosen for LitterSense:**
- Non-contact measurement (nothing to clean)
- Measures litter level from above
- Very low cost (~$1 USD)

**What it does:**
- Mounted above litter box pointing down
- Measures distance to litter surface
- Decreasing distance = rising litter level (needs emptying)
- Sudden distance changes indicate cat presence

**Limitations:**
- Litter dust can coat sensor over time
- Sound waves can be absorbed by soft litter (reduced accuracy)
- Minimum range of ~2cm (can't measure very close objects)

---

### RFID (RC522 Module)

**What it is:** A radio-frequency identification reader that detects passive RFID tags (the same technology in contactless payment cards).

**Why chosen for LitterSense:**
- Identifies individual cats in multi-cat households
- Passive tags require no battery (lasts cat's lifetime)
- Tag attached to cat collar

**What it does:**
- Antenna mounted at litter box entrance
- When cat enters, tag is detected and UID is read
- UID maps to `catId` in Firebase database
- Allows per-cat tracking even if weights are similar

**Limitations:**
- Short range (~5cm) — cat must pass close to antenna
- Some cats may lose collars (backup identification via weight recommended)
- Metal litter boxes can interfere with RF signal

---

### Lucide React

**What it is:** A collection of open-source SVG icons as React components.

**Why chosen for LitterSense:**
- Tree-shakeable (only icons you use get bundled)
- Consistent, clean design language
- TypeScript support built-in

**What it does in this codebase:**
- All icons (Clock, Timer, Wind, AlertTriangle, etc.) imported from `lucide-react`
- Icons are React components accepting props like `className`, `size`

**Example:**
```tsx
import { Clock } from "lucide-react";
<Clock className="w-5 h-5 text-[#1E6B5E]" />
```

**Tradeoffs:**
- Limited to one icon style (can't mix Material Icons)
- Some niche icons may not exist

---

### next/font (Google Fonts)

**What it is:** Next.js's built-in font optimization system that downloads Google Fonts at build time.

**Why chosen for LitterSense:**
- Fonts are self-hosted (no external requests to Google)
- Automatic optimization (subsetted, compressed)
- Prevents Flash of Unstyled Text (FOUT)
- Zero layout shift from font loading

**Fonts used:**
- **Fraunces** (serif) — Display headings, brand identity. Chosen for warmth and trustworthiness.
- **DM Sans** (sans-serif) — Body text, UI elements. Chosen for excellent mobile readability.

**What it does in this codebase:**
- Imported via CSS `@import` in `globals.css`
- Applied via CSS classes (`.font-display`, `.font-body`)

**Tradeoffs:**
- Limited to Google Fonts catalog (can't use Adobe Fonts directly)
- Build time increases slightly as fonts are downloaded

---

## 3. FOLDER STRUCTURE

```
littersense-capstone/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout (fonts, meta tags, PWA setup)
│   ├── page.tsx                 # Root redirect to /login
│   ├── globals.css              # Global styles, Tailwind imports, CSS variables
│   ├── login/
│   │   └── page.tsx             # Login page (split-screen on desktop)
│   └── dashboard/
│       └── page.tsx             # Main dashboard (greeting, stats, activity)
│
├── components/                   # Reusable React components
│   ├── ui/                      # Presentational UI components
│   │   ├── StatCard.tsx         # Stats display card with icon
│   │   ├── CatChip.tsx          # Cat selector pill/chip
│   │   ├── ActivityItem.tsx     # Activity feed list item
│   │   └── AlertBanner.tsx      # Health alert notification banner
│   └── layout/                  # Layout components
│       ├── TopBar.tsx           # Fixed header with logo, bell, avatar
│       └── BottomNav.tsx        # Mobile bottom navigation tabs
│
├── lib/                         # Utility code, hooks, data
│   ├── mockData.ts              # TypeScript mock data (cats, stats, activity)
│   ├── firebase.ts              # Firebase initialization and config
│   ├── useCatData.ts            # Custom hook for real-time cat data
│   └── utils.ts                 # Helper functions (date formatting, etc.)
│
├── public/                      # Static assets
│   ├── manifest.json            # PWA manifest
│   └── icons/                   # App icons
│       ├── icon-192x192.svg     # PWA icon (small)
│       └── icon-512x512.svg     # PWA icon (large, splash screen)
│
├── next.config.ts               # Next.js configuration (static export)
├── tsconfig.json                # TypeScript configuration
├── package.json                 # Dependencies and scripts
└── .env.local                   # Environment variables (not committed)
```

---

### Detailed File Explanations

#### `app/layout.tsx`

**Type:** Layout Component (Server Component)

**Purpose:** Provides the root HTML structure shared by all pages. This is the outermost wrapper of your application.

**Why it exists:** Next.js uses this file to wrap every page. It's where you put elements that should persist across navigation — fonts, meta tags, analytics scripts, global providers.

**Key logic:**
```tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1E6B5E",  // Controls browser chrome color on mobile
};
```

The `themeColor` makes the browser's address bar match our teal brand color when the PWA is installed.

**Connected to:** Every page in the app. Also imports `globals.css` for global styles.

---

#### `app/page.tsx`

**Type:** Page Component (Server Component)

**Purpose:** Redirects root URL (`/`) to `/login`.

**Why it exists:** We want users to land on the login page, not a blank page. In a full implementation, this might check auth state and redirect to dashboard if already logged in.

**Key logic:**
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
```

This is a server-side redirect (HTTP 307), so it happens before any JavaScript loads on the client.

**Connected to:** `app/login/page.tsx` — the destination of the redirect.

---

#### `app/login/page.tsx`

**Type:** Page Component (Client Component — "use client")

**Purpose:** Authentication page with email/password form, Google OAuth, and branding.

**Why it exists:** Users need to authenticate before accessing cat health data. This page handles the entire login flow with loading states and error handling.

**Key logic:**
- **Split-screen layout:** Left panel (branding with teal background) is hidden on mobile (`hidden lg:flex`), full-screen stacked on small screens
- **Form animations:** Uses Framer Motion variants for staggered entrance of form fields
- **Loading state:** Shows spinner inside button during mock 1.5s delay
- **Password visibility:** Toggle between `type="password"` and `type="text"`

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  window.location.href = "/dashboard";
};
```

Note: This currently uses mock authentication. In production, it would call `signInWithEmailAndPassword` from Firebase Auth.

**Connected to:** 
- `app/dashboard/page.tsx` — redirect destination after login
- `lib/firebase.ts` — for actual authentication (when implemented)

---

#### `app/dashboard/page.tsx`

**Type:** Page Component (Client Component)

**Purpose:** Main application dashboard showing cat health data, stats, and activity feed.

**Why it exists:** This is the primary user interface. After authentication, users spend most of their time here monitoring their cats' health.

**Key logic:**
- **Dynamic greeting:** Changes based on time of day (`Good morning` / `Good afternoon` / `Good evening`)
- **Cat selection:** Uses `useState` to track `selectedCatId`; clicking a CatChip updates this state
- **Memoized data:** `useMemo` prevents recalculating derived data on every render
- **Conditional rendering:** Health alert banner only shows if `hasAnomaly` is true
- **Stats calculation:** Maps air quality and litter level strings to status colors

```tsx
const selectedCat = useMemo(() => getCatById(selectedCatId), [selectedCatId]);
const stats = useMemo(() => mockStats[selectedCatId], [selectedCatId]);
```

**Connected to:**
- `components/layout/TopBar.tsx` — fixed header
- `components/layout/BottomNav.tsx` — mobile navigation
- `components/ui/StatCard.tsx`, `CatChip.tsx`, `ActivityItem.tsx` — UI components
- `lib/mockData.ts` — data source (to be replaced with Firebase)

---

#### `components/ui/StatCard.tsx`

**Type:** Presentational Component (Client Component)

**Purpose:** Displays a single statistic with icon, value, label, and status indicator.

**Why it exists:** This card appears 4 times on the dashboard (visits, duration, air quality, litter level). Making it a component ensures consistency and reduces code duplication.

**Key logic:**
```tsx
interface StatCardProps {
  icon: LucideIcon;           // Icon component from lucide-react
  value: string | number;     // The big number/text
  label: string;              // Small text below
  status?: "healthy" | "watch" | "alert" | "normal";  // Color coding
  delay?: number;             // Animation delay for stagger effect
}
```

The `icon` prop uses TypeScript's `LucideIcon` type, which means you can pass any icon component from the library: `<StatCard icon={Clock} ... />`.

**Status colors:**
- `healthy` → Green theme (good metrics)
- `watch` → Amber theme (slightly elevated, monitor)
- `alert` → Red theme (concerning, needs attention)
- `normal` → Teal theme (neutral/default)

**Connected to:** Used by `app/dashboard/page.tsx` 4 times.

---

#### `components/ui/CatChip.tsx`

**Type:** Presentational Component (Client Component)

**Purpose:** Horizontal scrollable chip/button for selecting which cat's data to view.

**Why it exists:** Multi-cat households need to switch between cats easily. This component provides a compact, visual selector that shows each cat's name and health status at a glance.

**Key logic:**
- **Avatar fallback:** If no image URL, shows first letter of name
- **Status dot:** Small colored dot (green/amber/red) on avatar edge
- **Active state:** Teal background when selected, white when not
- **Tap animation:** `whileTap={{ scale: 0.95 }}` provides tactile feedback

```tsx
<div className={`w-8 h-8 rounded-full flex items-center justify-center ...`}>
  {cat.avatar ? (
    <img src={cat.avatar} ... />
  ) : (
    cat.name.charAt(0).toUpperCase()
  )}
</div>
```

**Connected to:** Used by `app/dashboard/page.tsx` inside a horizontal scrolling container.

---

#### `components/ui/ActivityItem.tsx`

**Type:** Presentational Component (Client Component)

**Purpose:** Single row in the activity feed showing a litter box visit.

**Why it exists:** The activity feed lists recent events. Each row needs consistent styling for avatar, text, time, and optional warning badges.

**Key logic:**
- **Border color coding:** Left border indicates status (teal = normal, amber = warning)
- **Anomaly badge:** If `anomaly: true`, shows amber badge with warning icon
- **Avatar lookup:** Uses `getCatById(catId)` to fetch cat details

```tsx
const borderColor = anomaly ? borderColors.warning : borderColors.normal;
```

**Connected to:** Used by `app/dashboard/page.tsx` mapped over `mockActivity` array.

---

#### `components/layout/TopBar.tsx`

**Type:** Layout Component (Client Component)

**Purpose:** Fixed header visible on all pages showing brand identity and user controls.

**Why it exists:** Users need persistent access to notifications and account. The TopBar stays fixed at the top during scroll.

**Key logic:**
- **Backdrop blur:** `bg-white/95 backdrop-blur-sm` for frosted glass effect
- **Notification badge:** Red dot positioned absolutely over bell icon
- **Logo:** Custom SVG paw icon inside teal rounded square

**Connected to:** Used by `app/dashboard/page.tsx`. Could be added to other pages.

---

#### `components/layout/BottomNav.tsx`

**Type:** Layout Component (Client Component)

**Purpose:** Mobile navigation bar fixed at bottom with 4 tabs.

**Why it exists:** Mobile apps need thumb-reachable navigation. This follows iOS/Android tab bar patterns while being a web component.

**Key logic:**
- **Active indicator:** Teal line above active tab using Framer Motion's `layoutId` for smooth transitions
- **usePathname:** From `next/navigation` to determine active route
- **Safe area padding:** `safe-area-pb` CSS class handles iPhone notch area

```tsx
{isActive && (
  <motion.div
    layoutId="activeTab"
    className="absolute -top-2 ... w-8 h-1 bg-[#1E6B5E] rounded-full"
  />
)}
```

The `layoutId` prop tells Framer Motion this element should animate smoothly when it moves between tabs.

**Connected to:** Used by `app/dashboard/page.tsx`. Would be used by other main app pages.

---

#### `lib/mockData.ts`

**Type:** Utility/Data File

**Purpose:** Provides static mock data for UI development before Firebase integration.

**Why it exists:** Building the UI before the backend is complete allows parallel development. The components can be designed and tested with realistic data shapes.

**Key logic:**
```typescript
export interface Cat {
  id: string;
  name: string;
  status: "healthy" | "watch" | "alert";
  avatar: string | null;
}
```

The TypeScript interfaces define the contract that real Firebase data must eventually match.

**Helper functions:**
- `getCatById(id)` — returns Cat object or undefined
- `getStatsByCatId(id)` — returns CatStats object

**Connected to:** Used by `app/dashboard/page.tsx` and `components/ui/ActivityItem.tsx`.

---

#### `lib/firebase.ts`

**Type:** Utility/Config File

**Purpose:** Initializes Firebase app and exports configured instances.

**Why it exists:** Firebase should only be initialized once. This file ensures a single instance is shared across the app.

**Key logic:**
```typescript
import { initializeApp, getApps } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  // ... other config
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const auth = getAuth(app);
```

The conditional initialization prevents "Firebase already initialized" errors during hot module replacement in development.

**Connected to:** Would be used by `app/login/page.tsx` (auth) and `lib/useCatData.ts` (database).

---

#### `lib/useCatData.ts`

**Type:** Custom React Hook

**Purpose:** Encapsulates Firebase real-time data subscription logic.

**Why it exists:** Multiple components might need cat data. A custom hook prevents code duplication and provides a clean API: `const { cats, loading, error } = useCatData();`

**Key logic (when implemented):**
```typescript
export function useCatData(userId: string) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "cats"),
      where("ownerId", "==", userId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const catsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCats(catsData);
      setLoading(false);
    });

    return unsubscribe; // Cleanup on unmount
  }, [userId]);

  return { cats, loading };
}
```

`onSnapshot` creates a real-time listener. When Firebase data changes, the callback fires and React re-renders components using this data.

**Connected to:** Would be used by `app/dashboard/page.tsx` to replace mock data.

---

#### `public/manifest.json`

**Type:** Static Config File

**Purpose:** Tells browsers this app can be installed as a PWA.

**Why it exists:** Without a manifest, browsers won't offer "Add to Home Screen." The manifest defines how the app appears when installed.

**Key fields:**
- `name` / `short_name` — App name (short used under icon)
- `theme_color` — Status bar color
- `background_color` — Splash screen background
- `display: "standalone"` — Hides browser chrome, looks like native app
- `icons` — Icons for home screen and task switcher

**Connected to:** Referenced in `app/layout.tsx` metadata. Read by browsers when visiting the site.

---

#### `app/globals.css`

**Type:** Global Stylesheet

**Purpose:** Tailwind CSS imports, custom properties, and global styles.

**Why it exists:** Next.js requires this file for Tailwind. It's also where we define CSS custom properties (variables) for our color palette.

**Key sections:**
1. **Google Fonts import** — Must come before Tailwind import
2. **CSS Custom Properties** — Defined on `:root` for global access
3. **@theme inline** — Tailwind v4's configuration syntax
4. **Utility classes** — `.font-display`, `.font-body`, `.scrollbar-hide`

**Custom properties example:**
```css
:root {
  --color-bg: #FDFAF6;
  --color-primary: #1E6B5E;
  --color-accent: #E8924A;
}
```

These are used in Tailwind classes like `bg-[#1E6B5E]` and can be accessed in CSS as `var(--color-primary)`.

**Connected to:** Imported by `app/layout.tsx`. Applied to all pages.

---

#### `next.config.ts`

**Type:** Configuration File

**Purpose:** Configures Next.js build behavior.

**Why it exists:** We need to tell Next.js to export static files instead of requiring a Node.js server.

**Key configuration:**
```typescript
const nextConfig: NextConfig = {
  output: 'export',        // Generate static HTML files
  distDir: 'dist',         // Output folder name
  images: {
    unoptimized: true,     // Required for static export
  },
};
```

`output: 'export'` is the critical line. It tells Next.js to generate a `dist` folder with plain HTML/CSS/JS that can be uploaded to any static host (Firebase Hosting, Vercel, Netlify, GitHub Pages).

**Connected to:** Used by `next build` command. Affects the entire build process.

---

#### `.env.local`

**Type:** Environment Configuration (Not committed to Git)

**Purpose:** Stores sensitive configuration values like API keys.

**Why it exists:** API keys and secrets should never be committed to version control. This file is in `.gitignore` so each developer (and production) can have its own values.

**Contents:**
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

**The `NEXT_PUBLIC_` prefix** exposes these variables to the browser. Without this prefix, they're only available in Node.js during build.

**Connected to:** Read by `lib/firebase.ts` and Next.js build process.

---

## 4. FRONTEND ARCHITECTURE

### 4a. App Router vs Pages Router

Next.js 14 offers two routing systems: **Pages Router** (the original) and **App Router** (newer, using the `app/` directory).

**We chose App Router because:**
- Server Components by default = smaller JavaScript bundles
- Nested layouts are simpler (no `_app.tsx` wrapper complexity)
- Built-in loading and error states
- Parallel and intercepted routes for advanced patterns

#### Server Components

**What they are:** React components that run exclusively on the server. They never ship JavaScript to the browser.

**When they run:** During the build (for static export) or on each request (for SSR).

**In this project:**
- `app/layout.tsx` — Server Component (renders HTML shell)
- `app/page.tsx` — Server Component (redirects happen server-side)

**Why use them:**
- Zero client-side JavaScript = faster initial page load
- Can access server-only APIs (databases, file system)
- SEO-friendly HTML is generated immediately

#### Client Components

**What they are:** React components that run in the browser. They can use hooks (`useState`, `useEffect`) and handle user interactions.

**When they're needed:** Any component that:
- Uses React hooks
- Listens to browser events (onClick, onSubmit)
- Accesses browser APIs (localStorage, window)
- Uses browser-only libraries (Framer Motion)

**The `"use client"` directive:**
Placed at the top of a file, this tells Next.js "this component must run in the browser."

**In this project (all Client Components):**
- `app/login/page.tsx` — Uses `useState` for form inputs
- `app/dashboard/page.tsx` — Uses `useState` for cat selection
- All components in `components/ui/` — Use Framer Motion animations
- All components in `components/layout/` — Use `usePathname` hook

**Example:**
```tsx
"use client";  // Must be first line

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");  // Hook only works in client component
  // ...
}
```

**Key Takeaway:** Start with Server Components (default), only add `"use client"` when you need interactivity. LitterSense uses mostly Client Components because it's a highly interactive dashboard app.

---

### 4b. Component Design Philosophy

#### Presentational vs Container Split

We separate components into two categories:

**Presentational Components** (`components/ui/`)
- Receive data via props
- Display data without transformation
- No knowledge of where data comes from
- Highly reusable

Examples: `StatCard`, `CatChip`, `ActivityItem`

**Container Components** (pages in `app/`)
- Fetch or manage data
- Pass data down to presentational components
- Handle user interactions and business logic
- Less reusable, more specific

Examples: `app/dashboard/page.tsx`, `app/login/page.tsx`

#### Props Design

Each component's props interface is carefully designed:

```tsx
// StatCard.tsx — minimal, focused props
interface StatCardProps {
  icon: LucideIcon;        // Which icon to show
  value: string | number;  // Main display value
  label: string;           // Description below
  status?: StatusType;     // Optional color coding
  delay?: number;          // Animation timing
}
```

**Why this structure:**
- Required props enforce essential data
- Optional props (with `?`) provide flexibility
- No prop drilling of entire objects (destructure what you need)

#### State Management

We use **local state** (`useState`) for:
- Form input values
- UI toggles (password visibility, alert banner dismissal)
- Selected items (which cat is active)

We use **lifted state** (parent component state) for:
- Selected cat ID (lives in dashboard, passed to CatChip)

**Why no Redux/Zustand:**
At this scale, the Context API would suffice if needed. The component tree is shallow:
```
Dashboard (has selectedCatId state)
├── CatChip (receives selected state)
├── StatCard (receives selectedCatId, looks up stats)
└── ActivityItem (receives activity data)
```

Adding a global store would add complexity without solving a real problem.

**Key Takeaway:** Don't add state management libraries until you feel the pain of prop drilling. Start with local state, lift when necessary.

---

### 4c. Styling System

#### Tailwind Utility Classes

Instead of writing CSS like this:
```css
.login-button {
  background-color: #1E6B5E;
  padding: 1rem 1.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 10px 15px -3px rgba(30, 107, 94, 0.25);
}
```

We write Tailwind classes directly in JSX:
```tsx
<button className="bg-[#1E6B5E] py-4 px-6 rounded-xl shadow-lg shadow-[#1E6B5E]/25">
```

**How to read Tailwind classes:**
- `bg-[#1E6B5E]` — Background color (arbitrary value syntax)
- `py-4` — Padding Y-axis (1rem = 16px)
- `px-6` — Padding X-axis (1.5rem = 24px)
- `rounded-xl` — Border radius (0.75rem = 12px)
- `shadow-lg` — Large box shadow
- `shadow-[#1E6B5E]/25` — Custom colored shadow with 25% opacity

#### Custom Colors

Defined in `app/globals.css` using Tailwind v4's `@theme inline`:

```css
@theme inline {
  --color-litter-bg: #FDFAF6;
  --color-litter-primary: #1E6B5E;
  --color-litter-accent: #E8924A;
  /* ... */
}
```

Usage in components:
```tsx
<div className="bg-litter-bg text-litter-primary">
```

**Why use custom properties:**
- Consistent palette across the app
- Easy to adjust globally
- Self-documenting (the name explains the purpose)

#### CSS Variables

Also defined in `globals.css` on `:root`:
```css
:root {
  --color-bg: #FDFAF6;
  --color-primary: #1E6B5E;
  /* ... */
}
```

These can be used in regular CSS:
```css
.custom-element {
  background-color: var(--color-bg);
}
```

**Key Takeaway:** Use Tailwind for rapid UI development, CSS variables for values that need to be shared with non-Tailwind code (vanilla CSS, third-party libraries).

---

### 4d. Fonts

#### next/font/google

Instead of loading fonts via `<link>` tag in HTML (which causes layout shift), we use Next.js's font optimization:

```css
/* In globals.css */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&display=swap');
```

Next.js automatically:
1. Downloads fonts at build time
2. Subsets them (removes unused characters)
3. Optimizes formats (WOFF2 for modern browsers)
4. Inlines them in CSS (no external requests)
5. Prevents layout shift with `size-adjust`

#### Font Application

```css
/* globals.css */
.font-display {
  font-family: 'Fraunces', serif;
}

.font-body {
  font-family: 'DM Sans', sans-serif;
}
```

Usage:
```tsx
<h1 className="font-display text-3xl">Dashboard</h1>
<p className="font-body text-sm">Welcome back</p>
```

**Fraunces** (serif): Used for headings and brand elements. Conveys warmth and trust — important for a health app.

**DM Sans** (sans-serif): Used for body text and UI. Optimized for screen readability at small sizes.

**Key Takeaway:** Typography sets the emotional tone of an app. Fraunces says "caring and personal," DM Sans says "modern and clear."

---

### 4e. Animations

#### Framer Motion Basics

Framer Motion adds animation capabilities to React through a declarative API.

**Core concepts:**

1. **`motion.div`** — A `div` that can animate. Also available: `motion.button`, `motion.span`, etc.

2. **`initial`** — The starting state of the animation
   ```tsx
   initial={{ opacity: 0, y: 20 }}  // Start invisible and 20px down
   ```

3. **`animate`** — The end state
   ```tsx
   animate={{ opacity: 1, y: 0 }}  // Fade in and move to position
   ```

4. **`transition`** — How the animation behaves
   ```tsx
   transition={{ duration: 0.5, ease: "easeOut" }}
   ```

5. **`variants`** — Named animation states for orchestration
   ```tsx
   const variants = {
     hidden: { opacity: 0 },
     visible: { opacity: 1 }
   };
   ```

#### Where Animations Are Used

**Login page:**
- Left panel slides in from left
- Logo and tagline fade in with stagger
- Form fields stagger in from bottom
- Button scales on hover/tap

**Dashboard:**
- Greeting section fades in
- Cat chips slide in horizontally
- Stat cards stagger in with delay
- Activity items slide in from left
- Bottom nav indicator animates between tabs

**Why these moments:**
- Page load: Guides eye through content hierarchy
- Hover/tap: Provides tactile feedback
- Tab switch: Reinforces spatial relationships

**Key Takeaway:** Animations should guide attention and provide feedback, not distract. Every animation in LitterSense serves a purpose.

---

### 4f. Responsive Design & PWA

#### Mobile-First Approach

Tailwind uses a mobile-first breakpoint system:
```css
/* Base styles apply to all screens */
.class { padding: 1rem; }

/* sm: applies at 640px and up */
.sm:class { padding: 1.5rem; }

/* lg: applies at 1024px and up */
.lg:class { padding: 2rem; }
```

**In practice:**
```tsx
<div className="px-4 py-6 sm:px-6 lg:px-8">
  {/* Mobile: 16px horizontal padding */}
  {/* Tablet+: 24px horizontal padding */}
  {/* Desktop+: 32px horizontal padding */}
</div>
```

#### What Makes This a PWA

1. **Web App Manifest** (`manifest.json`)
   - Defines app name, icons, theme colors
   - Tells browser "this can be installed"

2. **Service Worker** (generated by Next.js)
   - Caches assets for offline use
   - Handles background sync

3. **Meta Tags** (in `layout.tsx`)
   - `viewport` — Mobile zoom behavior
   - `theme-color` — Browser chrome color
   - `apple-mobile-web-app-capable` — iOS standalone mode

4. **Icons** — Multiple sizes for home screen and splash

#### Why PWA Over Native

| Factor | PWA | Native |
|--------|-----|--------|
| Install friction | Tap "Add to Home Screen" | App store download |
| Update speed | Instant | App review + user update |
| Development | Single codebase | iOS + Android teams |
| Distribution | URL | App Store/Play Store approval |

**The "Add to Home Screen" Experience:**
1. User visits litter.sense.app
2. Browser shows "Install" prompt (Chrome) or user taps Share → "Add to Home Screen" (iOS)
3. App appears on home screen with custom icon
4. Opening it launches in standalone mode (no browser chrome)
5. App works offline (cached assets)

**Key Takeaway:** PWAs provide 80% of native app benefits with 20% of the development overhead. For a data-display app like LitterSense, they're the optimal choice.

---

## 5. BACKEND / DATA ARCHITECTURE

### 5a. Firebase Setup

#### Firebase Services Overview

**Firebase** is Google's mobile platform that provides backend services without requiring you to manage servers.

Think of it as: **A set of building blocks for app infrastructure.** Instead of setting up a server, database, and authentication system yourself, you use Firebase's pre-built, managed services.

#### Services Used

**Firebase Authentication:**
- Handles user sign-up, login, password reset
- Supports email/password and OAuth (Google, Facebook)
- Manages session tokens securely
- Provides user ID tokens for API authorization

**Cloud Firestore:**
- NoSQL document database
- Stores cats, sessions, users as JSON-like documents
- Real-time listeners push updates to connected clients
- Offline persistence (app works briefly without internet)

**Realtime Database:**
- Alternative to Firestore for high-frequency writes
- Used for immediate sensor data (ESP32 writes here)
- Lower latency than Firestore for rapid updates

#### firebase.ts Initialization

```typescript
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  // ... more config
};

// Initialize only if not already initialized (prevents hot-reload errors)
const app = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);
```

**Why check `getApps().length`:** During development, hot module replacement can cause code to reload without full page refresh. Without this check, Firebase would try to initialize twice and throw an error.

#### Environment Variables

Firebase config values come from `.env.local`:

| Variable | Where to Find It | Purpose |
|----------|------------------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Project Settings → General → Web API Key | Identifies your app to Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Same page, looks like `yourproject.firebaseapp.com` | Domain for authentication |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Same page | Identifies your project |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Same page, looks like `yourproject.appspot.com` | File storage location |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Same page | For push notifications |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Same page, looks like `1:xxx:web:xxx` | Unique app identifier |

**Why `NEXT_PUBLIC_` prefix:** By default, Next.js only exposes environment variables to Node.js (server-side). The `NEXT_PUBLIC_` prefix tells Next.js "this variable is safe to send to the browser." Firebase API keys are designed to be public (they're sent with every request), so this is safe.

**Why Firebase Was Chosen:**
- **Speed of development:** No backend code to write
- **Real-time:** Out-of-the-box WebSocket-like behavior
- **Cost:** Generous free tier (50K reads/day)
- **ESP32 integration:** Firebase Arduino library exists
- **Auth:** Pre-built UI components and security

**Tradeoffs:**
- **Vendor lock-in:** Hard to migrate away
- **Query limitations:** Firestore has limited query capabilities compared to SQL
- **Pricing cliffs:** Can become expensive if not optimized

---

### 5b. Database Schema

Our Firestore database has four main collections. Think of a collection like a folder, and documents like files within that folder.

```
Firestore Database Structure
============================

users/{userId}                          [Collection: users]
├── email: "maria@example.com"           [Document fields]
├── displayName: "Maria Santos"
├── photoURL: "https://..."
├── householdId: "household_123"         [Reference to household]
├── notificationPreferences: {           [Nested object]
│   pushEnabled: true,
│   anomalyAlerts: true,
│   dailySummary: false
│ }
├── createdAt: Timestamp
└── lastLoginAt: Timestamp

cats/{catId}
├── ownerId: "user_123"                  [Reference to user]
├── householdId: "household_123"         [For multi-user households]
├── name: "Mochi"
├── rfidTag: "A1B2C3D4"                  [RFID tag UID]
├── photoURL: "https://..."
├── birthDate: Timestamp                 [For age calculations]
├── weightBaseline: 4.2                  [kg, average weight]
├── breed: "Scottish Fold"
├── medicalNotes: "Prone to UTIs"
├── status: "healthy" | "watch" | "alert"
├── createdAt: Timestamp
└── updatedAt: Timestamp

sessions/{sessionId}
├── catId: "cat_456"                     [Who used the box]
├── householdId: "household_123"
├── startTime: Timestamp                 [When cat entered]
├── endTime: Timestamp                   [When cat exited]
├── duration: 142                        [seconds]
├── weightDelta: -0.3                    [kg change, negative = elimination]
├── weightAtStart: 4.5                   [kg, cat's weight on entry]
├── mq135Reading: 185                    [raw analog value]
├── mq135Delta: 45                       [change from baseline]
├── mq136Reading: 120
├── mq136Delta: 23
├── ultrasonicLevel: 68                  [% full]
├── anomalyDetected: true
├── anomalyType: "extended_duration"     [classification]
├── anomalySeverity: "watch" | "alert"
├── baselineComparison: {                [Context for anomaly]
│   avgDuration: 120,
│   durationDeviation: 1.18              [118% of normal]
│ }
└── createdAt: Timestamp

baselines/{catId}                        [One per cat]
├── catId: "cat_456"
├── avgVisitsPerDay: 4.2                 [Rolling 14-day average]
├── avgDuration: 134                     [seconds]
├── avgMq135: 140                        [baseline gas level]
├── avgMq136: 98
├── stdDevDuration: 23                   [variability measure]
├── lastCalculated: Timestamp
└── sampleSize: 58                       [number of sessions included]
```

#### Collection Explanations

**`users`** — Who can access the app
- **What it stores:** Authentication info and preferences
- **How it gets written:** Firebase Auth creates this automatically on signup
- **How it gets read:** Profile pages, settings, authorization checks
- **Why this structure:** Firebase Auth only stores email/password. We extend it with app-specific data.

**`cats`** — The patients we're monitoring
- **What it stores:** Cat identity, physical characteristics, current health status
- **How it gets written:** User adds a cat through the app; RFID tag is scanned
- **How it gets read:** Dashboard displays cat list; ESP32 looks up catId from RFID
- **Why this structure:** Denormalized (contains ownerId) for simple queries. Firestore doesn't support joins, so we store references.

**`sessions`** — Individual litter box visits
- **What it stores:** One document per bathroom visit with full sensor data
- **How it gets written:** ESP32 sends data at end of each session
- **How it gets read:** Dashboard shows recent activity; charts show trends
- **Why this structure:** High write volume (potentially dozens per day per cat). Firestore handles this well. Document ID is auto-generated (timestamp-based).

**`baselines`** — What's "normal" for each cat
- **What it stores:** Calculated averages from recent sessions
- **How it gets written:** Cloud Function recalculates nightly or after N sessions
- **How it gets read:** ESP32 compares current readings; dashboard shows "vs normal" indicators
- **Why this structure:** Pre-computed baselines are faster than calculating on-the-fly. Separated from `cats` because updates are frequent during learning period.

#### Data Relationships

```
┌─────────────┐     owns      ┌─────────────┐
│    User     │───────────────│     Cat     │
│  (users)    │  1 : many     │   (cats)    │
└─────────────┘               └──────┬──────┘
                                     │
                                     │ has many
                                     ▼
                              ┌─────────────┐
                              │   Session   │
                              │  (sessions) │
                              └─────────────┘
```

**No joins in Firestore:** If you need a cat's name when displaying a session, you either:
1. Store the name in the session (denormalization — what we do)
2. Make two queries (inefficient)
3. Use a reference and client-side lookup (complex)

We choose denormalization for read performance.

---

### 5c. Custom Hook: useCatData

#### What Is a Hook?

A **React Hook** is a function that lets you "hook into" React features from functional components. The most common hooks are:
- `useState` — Store data that changes over time
- `useEffect` — Run side effects (API calls, subscriptions)
- `useContext` — Access global state

A **custom hook** is a function YOU write that uses other hooks. It's a way to extract reusable logic.

#### useCatData Implementation

```typescript
import { useState, useEffect } from "react";
import { db } from "./firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";

interface Cat {
  id: string;
  name: string;
  status: "healthy" | "watch" | "alert";
  avatar: string | null;
  // ... other fields
}

interface UseCatDataReturn {
  cats: Cat[];
  loading: boolean;
  error: Error | null;
}

export function useCatData(userId: string): UseCatDataReturn {
  // State to store our data
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Create a query: "get all cats where ownerId equals this userId"
    const catsQuery = query(
      collection(db, "cats"),
      where("ownerId", "==", userId)
    );

    // Set up real-time listener
    // onSnapshot returns a function that unsubscribes
    const unsubscribe = onSnapshot(
      catsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        // Transform Firestore documents into Cat objects
        const catsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Cat[];

        setCats(catsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        // Handle errors (permission denied, network issues)
        console.error("Error fetching cats:", err);
        setError(err);
        setLoading(false);
      }
    );

    // Cleanup: unsubscribe when component unmounts or userId changes
    return () => unsubscribe();
  }, [userId]); // Re-run if userId changes

  return { cats, loading, error };
}
```

#### Step-by-Step Explanation

**Step 1: Create State**
```typescript
const [cats, setCats] = useState<Cat[]>([]);
```
This declares "I need to remember a list of cats, starting empty." React will re-render when this changes.

**Step 2: Set Up Effect**
```typescript
useEffect(() => {
  // ... logic here
}, [userId]);
```
`useEffect` says "run this code when the component mounts, and re-run if `userId` changes." This is where side effects (data fetching) belong.

**Step 3: Build Query**
```typescript
const catsQuery = query(
  collection(db, "cats"),
  where("ownerId", "==", userId)
);
```
This creates a Firestore query object: "Look in the 'cats' collection, but only return documents where 'ownerId' matches this user."

**Step 4: Subscribe to Real-time Updates**
```typescript
const unsubscribe = onSnapshot(catsQuery, (snapshot) => {
  // ... handle data
});
```
`onSnapshot` is the magic. Instead of fetching once (`getDocs`), this creates a persistent connection. When ANY client writes to Firestore matching this query, Firebase pushes the update to ALL connected clients.

Think of it like: **Instead of asking "what's the data?" every few seconds, Firebase calls you and says "hey, data changed."**

**Step 5: Transform Data**
```typescript
const catsData = snapshot.docs.map((doc) => ({
  id: doc.id,           // Document ID is separate from data
  ...doc.data(),       // Spread all fields from document
})) as Cat[];
```
Firestore documents have an ID and data. We combine them into our TypeScript `Cat` interface.

**Step 6: Update State**
```typescript
setCats(catsData);
setLoading(false);
```
This triggers a React re-render with the new data. The UI updates automatically.

**Step 7: Cleanup**
```typescript
return () => unsubscribe();
```
When the user navigates away, we must close the connection. Otherwise we'd have a memory leak and unnecessary network traffic.

#### Using the Hook

```tsx
import { useCatData } from "@/lib/useCatData";

export default function Dashboard() {
  const { cats, loading, error } = useCatData("user_123");

  if (loading) return <p>Loading cats...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      {cats.map((cat) => (
        <CatChip key={cat.id} cat={cat} />
      ))}
    </div>
  );
}
```

**Key Takeaway:** Custom hooks encapsulate complex logic (Firebase subscriptions, data transformation, loading states) into a simple, reusable API.

---

### 5d. Edge Processing Logic (ESP32)

#### What Is Edge Processing?

**Edge processing** means doing computation on the device itself (the "edge" of the network) rather than sending raw data to the cloud and processing there.

**Analogy:** Instead of sending a video of someone entering your house to a security company and waiting for them to tell you "someone entered," your doorbell camera recognizes the person locally and only sends "Maria is at the door."

#### Why Process on the ESP32?

**Philippine Connectivity Constraints:**
- Intermittent internet outages are common
- Mobile data is expensive for continuous streaming
- Power outages affect WiFi routers
- Fiber speeds vary by neighborhood

**By processing on the ESP32:**
1. **Works offline:** Sessions are stored locally, uploaded when connection returns
2. **Less data usage:** Only send "session ended, here's the summary" not 1000 readings/second
3. **Lower latency:** Detection happens immediately, not after network round-trip
4. **Cloud cost savings:** Fewer writes to Firebase

#### What Gets Processed Locally

The ESP32 runs a continuous loop (every 100ms) that:

1. **Reads all sensors:**
   ```cpp
   weight = scale.get_units();
   rfid = rfidReader.read();
   mq135 = analogRead(MQ135_PIN);
   mq136 = analogRead(MQ136_PIN);
   distance = ultrasonic.measure();
   ```

2. **Applies filtering:**
   - Weight readings: Moving average over 10 samples (reduces noise from cat shifting position)
   - Gas readings: Baseline subtraction (current - empty_box_reading)
   - RFID: Debouncing (must read same tag 3 times to confirm)

3. **Detects session state machine:**
   ```
   STATE_EMPTY → STATE_ENTERING → STATE_ACTIVE → STATE_EXITING → STATE_EMPTY
   ```
   - `STATE_EMPTY:` Weight near 0, no RFID
   - `STATE_ENTERING:` Weight spike detected, waiting for stability
   - `STATE_ACTIVE:` Weight stable above threshold, RFID confirmed
   - `STATE_EXITING:` Weight dropping, waiting for return to near-zero

4. **Calculates session summary:**
   Only when cat exits, compute:
   - Duration (exit time - entry time)
   - Min/max/average weight (to detect if cat was shifting/straining)
   - Peak gas readings (ammonia spike timing)
   - Weight delta (did cat eliminate waste?)

5. **Sends to Firebase:**
   One HTTPS POST with JSON payload:
   ```json
   {
     "catId": "cat_456",
     "startTime": 1709587200,
     "duration": 142,
     "weightDelta": -0.3,
     "mq135Delta": 45,
     "anomalyDetected": false
   }
   ```

#### What Stays on the Device

**Not sent to cloud:**
- Raw sensor readings at 10Hz (10 per second)
- Transient state changes (entering/exiting detection phases)
- Failed RFID reads (noise)
- Debug logs

**Stored locally (SD card):**
- Last 1000 sessions (backup if Firebase fails)
- Configuration (WiFi credentials, calibration values)
- Firmware version for OTA updates

**Key Takeaway:** Edge processing turns 10,000 raw data points into 1 meaningful event. This is essential for working within real-world connectivity constraints.

---

## 6. AUTHENTICATION FLOW

### Step-by-Step Login Process

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION FLOW                              │
└─────────────────────────────────────────────────────────────────────┘

  USER              BROWSER              FIREBASE              DATABASE
   │                   │                     │                      │
   │ 1. Visit /login   │                     │                      │
   │──────────────────>│                     │                      │
   │                   │                     │                      │
   │ 2. Enter email/   │                     │                      │
   │    password       │                     │                      │
   │──────────────────>│                     │                      │
   │                   │                     │                      │
   │ 3. Click Sign In  │                     │                      │
   │──────────────────>│                     │                      │
   │                   │ 4. signInWithEmail  │                      │
   │                   │    AndPassword()    │                      │
   │                   │────────────────────>│                      │
   │                   │                     │                      │
   │                   │                     │ 5. Verify against    │
   │                   │                     │    Auth database     │
   │                   │                     │                      │
   │                   │ 6. Return ID token  │                      │
   │                   │<────────────────────│                      │
   │                   │                     │                      │
   │                   │ 7. Store in         │                      │
   │                   │    localStorage     │                      │
   │                   │    (IndexedDB)      │                      │
   │                   │                     │                      │
   │ 8. Redirect to    │                     │                      │
   │    /dashboard     │                     │                      │
   │<──────────────────│                     │                      │
   │                   │                     │                      │
```

### Detailed Steps

**Step 1: User Lands on `/login`**
The login page renders as a Client Component. No authentication check happens here — it's a public route.

**Step 2: User Enters Credentials**
Email and password are stored in React state (local to the component):
```typescript
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
```

**Step 3: Form Submission**
The form's `onSubmit` handler prevents default browser behavior and calls Firebase:
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth, 
      email, 
      password
    );
    // Success!
  } catch (error) {
    // Handle error (wrong password, user not found)
  }
};
```

**Step 4-5: Firebase Verification**
Firebase Auth checks the email/password hash against its database. This happens on Google's servers, not in your code.

**Step 6: ID Token Returned**
If credentials are valid, Firebase returns:
- **ID Token:** A JWT (JSON Web Token) proving identity
- **Refresh Token:** Long-lived token to get new ID tokens
- **User Object:** uid, email, displayName, etc.

**Step 7: Session Persistence**
Firebase Auth automatically stores tokens in browser storage (IndexedDB). The user stays logged in across page refreshes.

**Step 8: Redirect to Dashboard**
After successful login:
```typescript
window.location.href = "/dashboard";
```

### Google OAuth Flow

Same process, but instead of email/password:
1. User clicks "Continue with Google"
2. `signInWithPopup(auth, provider)` opens Google login window
3. User selects Google account
4. Google returns OAuth token to Firebase
5. Firebase creates/links account, returns same tokens as email/password

### Protected Routes

In Next.js App Router, protected routes are typically handled via **middleware** or **server-side checks**.

**middleware.ts approach:**
```typescript
// middleware.ts (in project root)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check for auth token in cookies
  const token = request.cookies.get("firebase-auth-token");
  
  // If no token and trying to access protected route
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  
  return NextResponse.next();
}
```

**Why this works:** Middleware runs on the edge (server-side) before the page renders. Unauthenticated users are redirected before they see any protected content.

### Auth State Persistence

**"What happens when user refreshes the page?"**

Firebase Auth persists the session automatically. On page load:
1. Firebase SDK checks IndexedDB for stored tokens
2. If valid ID token exists, user is considered logged in
3. If ID token expired, refresh token automatically gets new one
4. `onAuthStateChanged` listener fires with user object

**Implementation:**
```typescript
import { onAuthStateChanged } from "firebase/auth";

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user) {
      setUser(user);      // Logged in
    } else {
      setUser(null);      // Logged out
      router.push("/login");
    }
    setLoading(false);     // Auth check complete
  });
  
  return unsubscribe;
}, []);
```

### Sign Out

```typescript
import { signOut } from "firebase/auth";

const handleSignOut = async () => {
  await signOut(auth);
  // Automatically redirects via onAuthStateChanged
};
```

**What happens:**
1. Tokens cleared from browser storage
2. `onAuthStateChanged` fires with `null`
3. UI updates to show logged-out state
4. User redirected to login

---

## 7. KEY LOGIC & ALGORITHMS

### 7a. Baseline Behavior Calculation

#### What Is a Baseline?

A **baseline** is a statistical profile of what's "normal" for a specific cat. It's like a medical chart that says "Mochi usually visits the litter box 4 times a day and stays for about 2 minutes."

Without baselines, we'd have to use generic "normal" values (like "cats usually go 3-5 times a day"), but individual cats vary significantly. Some cats naturally go more often. Some take longer due to age or digestion speed.

#### How It's Calculated

**Rolling Window Approach:**
We use the last 14 days of data, excluding:
- Sessions marked as anomalies (don't let outliers skew the baseline)
- Days with fewer than 2 sessions (incomplete data)
- The current day (incomplete)

**Formulas:**
```typescript
// For each cat, calculate:
const baseline = {
  // Average visits per day
  avgVisitsPerDay: totalSessions / numberOfDays,
  
  // Average duration (seconds)
  avgDuration: sumOfDurations / totalSessions,
  
  // Standard deviation (how much variation is normal)
  stdDevDuration: Math.sqrt(
    sumOfSquaredDifferences / totalSessions
  ),
  
  // Gas sensor baselines (average of "start" readings)
  avgMq135: sumOfMq135StartReadings / totalSessions,
  avgMq136: sumOfMq136StartReadings / totalSessions,
};
```

**Example Calculation:**
```
Mochi's last 14 days:
- Day 1: 4 sessions, durations [120, 135, 128, 142] seconds
- Day 2: 3 sessions, durations [118, 145, 132] seconds
- ...etc

Total sessions: 58
Sum of durations: 7772 seconds

avgDuration = 7772 / 58 = 134 seconds (2m 14s)
stdDevDuration = 18 seconds
```

#### When It Gets Recalculated

**Triggers:**
1. **Nightly batch:** Cloud Function runs at 3 AM, recalculates all baselines
2. **After N new sessions:** If 10+ new sessions since last calculation
3. **Manual refresh:** User taps "Recalculate" in settings

**Why not real-time?**
Baselines should be stable. Recalculating after every session would cause the "normal" range to fluctuate, making anomaly detection less reliable.

---

### 7b. Anomaly Detection

#### What Counts as an Anomaly?

An **anomaly** is any litter box behavior that deviates significantly from a cat's established baseline. It's not necessarily "bad" — it's "unusual and worth noting."

**Detection Rules:**

| Metric | Normal Range | Watch Threshold | Alert Threshold |
|--------|-------------|-----------------|-----------------|
| Duration | ±1 std dev from avg | >2x avg duration | >3x avg duration |
| Visit frequency | Baseline ±30% | ±50% from baseline | ±75% from baseline |
| Gas spike | <2x baseline | 2-3x baseline | >3x baseline |
| Weight delta | Normal range | Slight change | Extreme change |

**Example Decision Tree:**
```
IF duration > (avgDuration * 2) THEN
  IF duration > (avgDuration * 3) THEN
    severity = "alert"
    type = "extended_duration"
  ELSE
    severity = "watch"
    type = "extended_duration"
  END IF
END IF
```

#### Severity Levels

**Normal (Green):**
- Within 1 standard deviation of baseline
- No action needed
- UI: Green status dot, no alert

**Watch (Amber):**
- Between 1-2 standard deviations from baseline
- Monitor for pattern
- UI: Amber status dot, soft alert banner

**Alert (Red):**
- Beyond 2 standard deviations
- Possible health issue
- UI: Red status dot, prominent alert, push notification

#### How Anomalies Propagate to UI

```
1. ESP32 detects unusual session
        ↓
2. Flags anomaly in session document
   (anomalyDetected: true, anomalyType: "...")
        ↓
3. Firestore triggers Cloud Function
        ↓
4. Cloud Function updates cat's status field
   (status: "watch" or "alert")
        ↓
5. onSnapshot listener fires in useCatData hook
        ↓
6. React re-renders dashboard
        ↓
7. CatChip shows amber/red dot
   AlertBanner appears
   StatCard shows amber/red indicator bar
```

**Key Takeaway:** Anomaly detection is the core value of LitterSense. It turns "my cat went to the bathroom" into "my cat's behavior changed, you should know about it."

---

### 7c. Individual Cat Identification (RFID)

#### How RFID Works

**RFID (Radio-Frequency Identification)** uses electromagnetic fields to automatically identify tags.

**Components:**
1. **RFID Tag:** Passive device (no battery) attached to cat collar. Contains a unique ID (UID) like `A1B2C3D4`.
2. **RFID Reader (RC522):** Emits radio waves that power the tag and read its UID.
3. **Antenna:** Coil of wire that creates the electromagnetic field.

**The Process:**
1. Reader constantly emits 13.56 MHz radio waves
2. When tag enters field (within ~5cm), it harvests energy from the waves
3. Powered tag broadcasts its UID
4. Reader receives UID and sends to ESP32

#### ESP32 Integration

```cpp
#include <MFRC522.h>

MFRC522 rfid(SS_PIN, RST_PIN);

void loop() {
  // Check if tag is present
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;
  
  // Read UID
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  
  // Look up cat in local cache
  String catId = getCatIdFromRfid(uid);
  
  // If found, associate session with this cat
  if (catId != "") {
    currentSession.catId = catId;
  }
}
```

**The `getCatIdFromRfid` Lookup:**
The ESP32 maintains a local cache mapping RFID UIDs to Firebase catIds:
```cpp
std::map<String, String> rfidToCatId = {
  {"a1b2c3d4", "cat_mochi_123"},
  {"e5f6g7h8", "cat_luna_456"},
  // ... loaded from Firebase on boot
};
```

This cache is synced from Firebase when the ESP32 starts up. If a new cat is added, the ESP32 must restart to get the updated mapping.

#### Why This Matters for Multi-Cat Households

**Without RFID:**
- System only knows "a cat used the box"
- If cats have similar weights, can't distinguish them
- All data is aggregated (useless for individual health tracking)

**With RFID:**
- Every session is tagged with specific catId
- Each cat gets their own baseline and anomaly detection
- Dashboard shows "Luna's Stats" vs "Mochi's Stats"

**Fallback Identification:**
If RFID fails (lost collar, interference), the system falls back to:
1. Weight-based identification (if cats have significantly different weights)
2. "Unknown Cat" category (alerts owner to check collar)

---

### 7d. Gas Sensor Interpretation

#### What MQ-135 and MQ-136 Detect

**MQ-135:** General air quality sensor, sensitive to:
- Ammonia (NH3) — primary component of urine odor
- Nitrogen oxides (NOx)
- Benzene
- Smoke
- Carbon dioxide (CO2)

**MQ-136:** Hydrogen sulfide (H2S) sensor, sensitive to:
- Hydrogen sulfide — "rotten egg" smell
- Other sulfur compounds

#### Why Raw PPM Values Are NOT Used

**PPM (Parts Per Million)** is an absolute measurement of gas concentration. We don't use it because:

1. **Calibration varies by sensor:** Each MQ sensor has slightly different resistance characteristics
2. **Temperature affects readings:** A reading of "100" at 25°C is different from "100" at 30°C
3. **Humidity affects readings:** Philippine humidity (70-90%) skews sensors
4. **Baseline shifts over time:** Sensor "zero point" drifts as it ages

**The Solution: Relative Delta-from-Baseline**

Instead of asking "how much ammonia is there?" we ask:
> "How much more ammonia is there compared to when the box is empty?"

**Calculation:**
```cpp
// During setup (box empty, clean)
int baselineMq135 = readMq135();  // e.g., 120

// During session
int currentMq135 = readMq135();   // e.g., 165

// Delta (change from baseline)
int deltaMq135 = currentMq135 - baselineMq135;  // 45

// Percentage increase
float percentIncrease = (deltaMq135 / baselineMq135) * 100;  // 37.5%
```

#### Establishing a "Normal" Baseline

**Initial Calibration (Day 1):**
1. Clean litter box thoroughly
2. Let sit empty for 1 hour with lid closed
3. Take 100 readings, average them → `baselineEmpty`
4. Add cat, let use box normally
5. Take 100 readings immediately after → `baselineUsed`

**Ongoing Baseline Updates:**
- Every night at 3 AM, when box has been empty for >2 hours
- Average of last 50 readings → new baseline
- Accounts for sensor drift, litter changes, seasonal humidity

#### What a Significant Delta Looks Like

**Normal Urination:**
- MQ-135 delta: +20-60 (ammonia spike)
- MQ-136 delta: +5-15 (minor sulfur)
- Pattern: Spike at start, gradual decline over 10-30 minutes

**Potential FLUTD Signs:**
- MQ-135 delta: +10-20 (small ammonia — frequent small urinations)
- Duration: Very short (<30 seconds)
- Pattern: Multiple visits in 1 hour, tiny deltas each time

**Digestive Issues:**
- MQ-136 delta: +50+ (large hydrogen sulfide spike)
- MQ-135 delta: Smaller than expected
- Pattern: Large sulfur spike with minimal ammonia

**Key Takeaway:** Gas sensors tell a story when combined with other data. A single reading is meaningless, but patterns over time reveal health insights.

---

## 8. ENVIRONMENT VARIABLES

Your `.env.local` file should contain:

```bash
# Firebase Configuration
# Find these in Firebase Console → Project Settings → General → Your apps → Web app

NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=littersense-capstone.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=littersense-capstone
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=littersense-capstone.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Variable Explanations

| Variable | Description | Where to Find |
|----------|-------------|---------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public identifier for your Firebase project | Firebase Console → Project Settings → General → API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Domain where auth popups appear | Same page, looks like `yourproject.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Unique project identifier | Same page, used in URLs |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage location | Same page, ends in `.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | For push notifications | Same page, numeric ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Unique app identifier | Same page, looks like `1:xxx:web:xxx` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | For Google Analytics | Same page, starts with `G-` |

### NEXT_PUBLIC_ Prefix Explained

Next.js has two environments:
- **Server/Build time:** Node.js running `next build`
- **Browser/Runtime:** Client-side JavaScript in user's browser

By default, environment variables are only available server-side. The `NEXT_PUBLIC_` prefix tells Next.js to **inline these values into the JavaScript bundle** sent to the browser.

**Security Note:** Only prefix values that are safe to expose publicly. Firebase API keys are designed to be public — they identify your app, not authenticate it. Security comes from Firebase Security Rules, not API key secrecy.

### Why This File Is in .gitignore

```gitignore
# .gitignore
.env.local
.env*.local
```

**Reasons:**
1. **Different values per environment:** Development, staging, and production each have different Firebase projects
2. **Security:** Even though these keys are "public," you don't want them in GitHub for bots to scrape
3. **Team coordination:** Each developer has their own Firebase project for testing

**How teams handle this:**
- Create `.env.local.example` with empty values (committed)
- New developers copy to `.env.local` and fill in their own values
- Production values are set in hosting platform (Vercel, Firebase) environment variables

---

## 9. HOW TO RUN THE PROJECT

### Prerequisites

- **Node.js 18.x or higher** — [Download from nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js) or **yarn/pnpm**
- **Git** — for cloning the repository
- **A Firebase account** — [Sign up free](https://firebase.google.com)

### Step-by-Step Setup

**Step 1: Clone the Repository**
```bash
git clone https://github.com/yourusername/littersense-capstone.git
cd littersense-capstone
```

**Step 2: Install Dependencies**
```bash
npm install
```

This reads `package.json` and downloads all required libraries into `node_modules/`. This may take 2-5 minutes depending on your internet connection.

**Step 3: Create Firebase Project**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create project"
3. Name it "littersense-capstone" (or your preferred name)
4. Disable Google Analytics for now (optional)
5. Click "Create"

**Step 4: Register Web App**

1. In Firebase Console, click the `</>` icon ("Add app")
2. Choose "Web"
3. Give it a nickname: "LitterSense Web"
4. Check "Also set up Firebase Hosting" (optional)
5. Click "Register app"
6. Copy the `firebaseConfig` object shown

**Step 5: Create .env.local**

```bash
# Create the file
touch .env.local

# Open in your editor
code .env.local  # VS Code
# or
nano .env.local  # Terminal editor
```

Paste your Firebase config:
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

**Step 6: Enable Firebase Services**

In Firebase Console:
1. **Authentication** → "Get started" → Enable "Email/Password" and "Google"
2. **Firestore Database** → "Create database" → Start in test mode
3. Choose a location close to you (e.g., `asia-southeast1` for Philippines)

**Step 7: Run Development Server**
```bash
npm run dev
```

This starts Next.js in development mode:
- Builds the app in memory (faster than file writes)
- Enables hot module replacement (changes appear instantly)
- Starts server on `http://localhost:3000`

**Step 8: View in Browser**

Open `http://localhost:3000` in your browser.

You should see the login page. Currently it uses mock data — Firebase integration is the next step.

### Build for Production

**What `npm run build` does:**
1. Compiles TypeScript to JavaScript
2. Processes Tailwind CSS (purges unused classes)
3. Optimizes images and fonts
4. Generates static HTML files in `dist/` folder
5. Exports fully static site (no server required)

```bash
npm run build
```

After build completes:
```
dist/
├── index.html          # Root redirect
├── login.html          # Login page
├── dashboard.html      # Dashboard page
├── _next/              # JavaScript and CSS bundles
├── icons/              # PWA icons
└── manifest.json       # PWA manifest
```

**Preview production build locally:**
```bash
npx serve dist
```

### Deploy to Vercel (Recommended)

**Why Vercel:** Built by the creators of Next.js. Optimized for Next.js apps. Free tier is generous.

**Steps:**

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login:**
   ```bash
   vercel login
   ```

3. **Deploy:**
   ```bash
   vercel
   ```

4. **Set environment variables:**
   ```bash
   vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
   # Paste your API key
   # Repeat for all Firebase variables
   ```

5. **Redeploy with variables:**
   ```bash
   vercel --prod
   ```

**Alternative: Deploy to Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select "dist" as public directory
firebase deploy
```

---

## 10. COMMON ERRORS & HOW TO FIX THEM

### Error 1: "Firebase App not initialized"

**Error Message:**
```
FirebaseError: Firebase: No Firebase App '[DEFAULT]' has been created - 
call Firebase App.initializeApp() (app/no-app)
```

**Why it happens:**
You're trying to use Firebase before `initializeApp()` has been called. This usually happens when:
- `firebase.ts` isn't imported before using `db` or `auth`
- There's a circular import
- The component using Firebase renders before the provider initializes

**How to fix:**
1. Ensure `import "@/lib/firebase"` runs before any Firebase usage
2. Check that environment variables are defined (Firebase can't init without config)
3. Move Firebase calls inside `useEffect` so they run after component mount

---

### Error 2: Hydration Mismatch

**Error Message:**
```
Warning: Text content does not match server-rendered HTML.
```

**Why it happens:**
React "hydrates" server-rendered HTML by attaching event listeners. If the client-side render produces different HTML than the server, React complains.

Common causes:
- Using `Date.now()` or `Math.random()` during render (different values on server vs client)
- Checking `window` or `localStorage` without `useEffect`
- Using Firebase auth state before it's initialized

**How to fix:**
```tsx
// BAD: Different on server vs client
const greeting = new Date().getHours() > 12 ? "Afternoon" : "Morning";

// GOOD: Only run on client
const [greeting, setGreeting] = useState("");
useEffect(() => {
  setGreeting(new Date().getHours() > 12 ? "Afternoon" : "Morning");
}, []);
```

---

### Error 3: "use client" Missing

**Error Message:**
```
Error: useState is not defined
# or
Error: useEffect is not defined
```

**Why it happens:**
You're using React hooks (`useState`, `useEffect`, etc.) in a Server Component. Hooks only work in Client Components.

**How to fix:**
Add `"use client"` at the top of your file:
```tsx
"use client";

import { useState } from "react";
// ... rest of component
```

---

### Error 4: Environment Variables Undefined

**Error Message:**
```
FirebaseError: Invalid API key: undefined
```

**Why it happens:**
- `.env.local` file doesn't exist
- Variable names are misspelled
- Server was started before creating the file (needs restart)
- Variable doesn't have `NEXT_PUBLIC_` prefix and you're trying to use it in browser

**How to fix:**
1. Check `.env.local` exists in project root
2. Verify variable names match exactly
3. Restart dev server: `Ctrl+C`, then `npm run dev`
4. Add `console.log(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)` to debug

---

### Error 5: Tailwind Classes Not Applying

**Symptom:**
HTML renders but has no styling (looks like unstyled browser defaults).

**Why it happens:**
- `globals.css` not imported in `layout.tsx`
- Tailwind classes misspelled
- `postcss.config.mjs` missing or misconfigured
- Using Tailwind v4 syntax with v3 config

**How to fix:**
1. Check `app/layout.tsx` imports `globals.css`
2. Check `globals.css` has `@import "tailwindcss"`
3. Restart dev server
4. Try a simple test: `<div className="bg-red-500 p-10">Test</div>` should show red box

---

### Error 6: CORS Errors When Calling Firebase

**Error Message (in browser console):**
```
Access to fetch at 'https://firestore.googleapis.com/...' from origin 
'http://localhost:3000' has been blocked by CORS policy.
```

**Why it happens:**
Browsers block requests to different domains (Firebase) unless the server allows it. Firebase services should allow all origins by default, but if you've configured restricted API keys, this can happen.

**How to fix:**
1. Check Firebase Console → API & Services → Credentials
2. Ensure your API key has no HTTP referer restrictions during development
3. For production, add your domain to allowed referrers

---

### Error 7: TypeScript Type Errors on Firebase Data

**Error Message:**
```
Type 'DocumentData' is not assignable to type 'Cat'.
```

**Why it happens:**
Firestore returns `DocumentData` type (generic), but your code expects specific TypeScript interfaces.

**How to fix:**
Use type assertions or type guards:
```typescript
// Type assertion (tells TS "trust me, this is a Cat")
const cat = doc.data() as Cat;

// Or better: type guard function
function isCat(data: unknown): data is Cat {
  return data && typeof (data as Cat).name === 'string';
}
```

---

### Error 8: PWA Manifest Not Detected

**Symptom:**
Browser doesn't show "Install" prompt. Lighthouse audit says "User will not be prompted to install the web app."

**Why it happens:**
- `manifest.json` is missing required fields
- Icon paths are wrong
- Manifest isn't linked in HTML
- Served over HTTP (not HTTPS) — required for PWA

**How to fix:**
1. Check `public/manifest.json` has all required fields
2. Verify icons exist in `public/icons/`
3. Check `layout.tsx` has correct `manifest` metadata
4. Use HTTPS (or localhost for development)

---

## 11. ARCHITECTURE DECISIONS & TRADEOFFS

| Decision | Why We Chose It | What We Gave Up |
|----------|----------------|-----------------|
| **Next.js App Router** | Server Components for faster initial loads, nested layouts simpler | Steeper learning curve than Pages Router; some libraries not compatible yet |
| **Firebase over custom API** | Zero backend maintenance; real-time out of box; ESP32 library exists | Vendor lock-in; query limitations; pricing can surprise at scale |
| **PWA over native app** | Single codebase; instant updates; no app store approval | Limited native APIs (no Bluetooth direct); discoverability harder than App Store |
| **Edge processing on ESP32** | Works offline; handles PH intermittent connectivity; lower cloud costs | More complex firmware; harder to update logic (requires OTA or physical access) |
| **Relative gas readings** | More reliable across temperature/humidity; no calibration needed per unit | Cannot provide clinical-grade ppm values; research papers prefer absolute |
| **Tailwind over CSS Modules** | Faster development; consistent spacing/sizing; easy responsive design | Verbose class names; purging can be finicky; team must learn utility naming |
| **Mock data first** | Parallel UI/backend development; design can iterate without waiting for API | Double work (mock → real); risk of data shape mismatch when switching |
| **Static export over SSR** | Can host anywhere for free (Firebase Hosting, GitHub Pages); no server costs | No API routes; no server-side auth checks; no dynamic OG images |
| **Fraunces + DM Sans fonts** | Warm, trustworthy display + clean, readable body; perfect for health app | Two font downloads (slightly slower); limited weights available for free |
| **Framer Motion over CSS** | Declarative API fits React; orchestrates complex sequences; gestures built-in | ~30KB bundle addition; can impact performance if overused |

---

## 12. FUTURE IMPROVEMENTS

### 1. ML-Based Anomaly Detection (Difficulty: Hard)
**What:** Train a machine learning model on aggregated cat data to detect patterns humans can't see.
**Why:** Statistical thresholds catch obvious anomalies, but ML could detect subtle patterns (e.g., "Mochi's visits are getting slightly more frequent over 2 weeks").
**Implementation:** Export Firestore data to BigQuery, train model in Vertex AI, deploy as Cloud Function.

### 2. Push Notifications via Firebase Cloud Messaging (Difficulty: Medium)
**What:** Send native push notifications for critical alerts ("Mochi may be blocked — vet recommended").
**Why:** Users don't check the app constantly. Push alerts for life-threatening situations.
**Implementation:** Request notification permission, store FCM token in Firestore, trigger from Cloud Functions.

### 3. Vet Sharing Portal (Difficulty: Medium)
**What:** Generate a shareable link or PDF with 30-day health report for veterinarians.
**Why:** Vet visits are short. Having pre-formatted data improves diagnosis and shows you're a responsible owner.
**Implementation:** Cloud Function generates PDF with Recharts graphs, stores in Cloud Storage, returns signed URL.

### 4. Multi-User Household Accounts (Difficulty: Hard)
**What:** Multiple family members can access the same cats with different permission levels.
**Why:** Households share pet care. Parents want full access; kids might get view-only.
**Implementation:** Add `households` collection with `members` array; update all security rules; add invitation system.

### 5. Replace Mock Data with Live Firebase (Difficulty: Easy)
**What:** Swap `mockData.ts` imports for actual Firebase calls via `useCatData` hook.
**Why:** This is the critical path to a working product. Everything else is enhancement.
**Implementation:** Already prepared — just need to uncomment Firebase calls and ensure ESP32 is sending data.

### 6. Offline-First Caching with Service Workers (Difficulty: Medium)
**What:** App works without internet; syncs when connection returns.
**Why:** Philippine connectivity is intermittent. Users should still see last-known data.
**Implementation:** Workbox library configures service worker; Firestore offline persistence handles most of this automatically.

### 7. Weight Trend Charts (Difficulty: Medium)
**What:** Line chart showing cat weight over time.
**Why:** Weight loss is an early indicator of many diseases. Easy to miss gradual changes.
**Implementation:** Add `recharts` or `victory` library; aggregate session weights by day; render responsive line chart.

### 8. OTA Firmware Updates for ESP32 (Difficulty: Hard)
**What:** Update ESP32 software remotely without physical access.
**Why:** Bug fixes and new features shouldn't require visiting each device.
**Implementation:** Firebase Cloud Storage hosts firmware binary; ESP32 checks version on boot; downloads and flashes if outdated.

### 9. Geofenced Alerts (Difficulty: Medium)
**What:** Different alert thresholds when owner is home vs away.
**Why:** If you're home, you can check on the cat. If you're at work, you want earlier warnings.
**Implementation:** Track device location (with permission); adjust anomaly thresholds in Cloud Function.

### 10. Community Benchmarks (Difficulty: Hard)
**What:** Anonymous comparison: "Mochi visits 4x/day; similar cats visit 3.2x/day."
**Why:** Context helps owners understand if their cat is truly unusual or just different.
**Implementation:** Aggregate anonymized data in BigQuery; expose percentiles via API; cache aggressively.

---

## 13. GLOSSARY

| Term | Definition |
|------|------------|
| **PWA (Progressive Web App)** | A website that can be "installed" on your phone and work offline, behaving like a native app but built with web technologies. |
| **App Router** | Next.js's newer routing system using the `app/` directory. Allows mixing server and client components. |
| **Server Component** | A React component that runs only on the server. Sends HTML to browser, no JavaScript bundle. |
| **Client Component** | A React component that runs in the browser. Can use hooks and handle user interactions. Marked with `"use client"`. |
| **Firebase** | Google's platform providing backend services (database, auth, hosting) without you managing servers. |
| **Firestore** | Firebase's NoSQL document database. Stores data as JSON-like documents in collections. |
| **Realtime Database** | Firebase's older, faster database. Good for high-frequency writes like sensor data. |
| **Hook (React)** | A function that lets you use React features (state, effects) in functional components. Examples: `useState`, `useEffect`. |
| **TypeScript** | JavaScript with added type checking. Catches errors at compile time rather than runtime. |
| **Tailwind CSS** | A CSS framework where you write utility classes directly in HTML (e.g., `bg-red-500 p-4`) instead of separate CSS files. |
| **Edge Processing** | Doing computation on the device (ESP32) rather than in the cloud. Essential for unreliable internet. |
| **RFID** | Radio-Frequency Identification. Wireless system to identify objects (like cat collars) using radio waves. |
| **FLUTD** | Feline Lower Urinary Tract Disease. A group of conditions affecting cat bladder/urethra. Can be life-threatening. |
| **Anomaly Detection** | Automatically identifying data points that deviate significantly from the norm. |
| **Baseline** | A calculated "normal" value for a specific cat, used as reference for anomaly detection. |
| **Firebase Auth** | Firebase's authentication service. Handles login, signup, password reset, OAuth. |
| **Hydration** | React's process of attaching JavaScript interactivity to server-rendered HTML. |
| **API (Application Programming Interface)** | A way for software to talk to other software. Firebase provides an API your app calls. |
| **REST** | A style of API using HTTP requests (GET, POST, PUT, DELETE). Firebase uses a different style (real-time). |
| **Real-time Listener** | A connection that "pushes" updates from server to client automatically. Firebase's `onSnapshot` is this. |
| **onSnapshot** | A Firebase function that creates a real-time listener on a database query. |
| **Environment Variable** | A value stored outside code (in `.env.local`) that's injected at runtime. Used for API keys and config. |
| **.gitignore** | A file listing patterns that Git should ignore (not commit). Used for secrets and dependencies. |
| **Middleware** | Code that runs before a request reaches your application. Used for auth checks and redirects. |
| **JWT (JSON Web Token)** | A secure way to transmit user identity. Firebase Auth returns these. |
| **Framer Motion Variant** | A named animation state ("hidden", "visible") that can be orchestrated together. |

---

## Contributing

This is a capstone project. For questions about the architecture or implementation, refer to the inline code comments or create an issue in the repository.

---

**Built with ❤️ for Filipino cat owners.** 🐱
