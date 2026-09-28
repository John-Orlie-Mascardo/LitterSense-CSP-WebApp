# Photo Upload, Trend Charts, and Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store cat photos safely in Firebase Storage, render fully labeled seven-day trend charts everywhere, and add a persistent, filterable, incrementally loaded Session History route.

**Architecture:** Add focused photo, trend-presentation, and history modules rather than broadening `CatContext` further. Existing profile and report screens consume the shared utilities/components, while a history-specific Firestore hook owns cursor pagination and `CatContext` suspends its unbounded session subscription only on the new route.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Firebase Auth/Firestore/Storage, Recharts 3, Tailwind CSS 4, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-photo-charts-session-history-design.md`

<!--
  2026-09-01-photo-charts-session-history.md

  Test-first execution plan for the approved photo, trend, and history work.

  DONE: file boundaries, interfaces, failure checks, verification, and review gates
  PLACEHOLDER: none

  NEXT: execute tasks in order and leave every result uncommitted for group review.
-->

## Global Constraints

- Do not change sensor interpretation, session computation, anomaly detection, classification rules, comparison operators, or persisted session states.
- Import behavior thresholds from `lib/configs/behaviorThresholds.ts`; do not place threshold literals in React components.
- Never diagnose a cat or label one healthy or unhealthy.
- Keep the current dark theme, teal/green accents, and shared six-state presentation model.
- Do not deploy Firebase configuration, modify live records, commit, or push.
- Do not change mock graph values or series generation. Preserve `lib/utils/demoCatData.ts`, `CatContext.buildTrendData`, and `useReports.buildAggregateTrendData`; chart work is presentation/reference plumbing only.
- Add the requested purpose/DONE/PLACEHOLDER/NEXT header to every new or substantially modified comment-capable file. JSON does not support comments, so the adjacent `storage.rules` header documents the `firebase.json` registration.
- End every task with a working-tree review checkpoint instead of a commit.

---

### Task 1: Photo validation and Firebase Storage boundary

**Files:**
- Create: `lib/utils/catPhoto.ts`
- Create: `lib/utils/catPhoto.test.cjs`
- Create: `storage.rules`
- Modify: `firebase.json`

**Interfaces:**
- Consumes: `storage` from `lib/configs/firebase.ts`.
- Produces: `validateCatPhotoFile(file)`, `dataUrlToBlob(dataUrl)`, `getCatPhotoPath(uid, catId)`, `uploadCatPhoto(input)`, and `deleteCatPhoto(uid, catId)`.

- [ ] **Step 1: Write failing pure-helper tests**

Create `lib/utils/catPhoto.test.cjs` with the repository header and a TypeScript transpile loader. Cover exact validation messages, the 10 MB boundary, owner-scoped paths, and data-URL conversion:

```js
test("accepts common images and rejects unsupported or oversized files", () => {
  assert.equal(validateCatPhotoFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateCatPhotoFile({ type: "image/webp", size: 1024 }), null);
  assert.equal(
    validateCatPhotoFile({ type: "application/pdf", size: 1024 }),
    "Choose a JPEG, PNG, WebP, or GIF image.",
  );
  assert.equal(
    validateCatPhotoFile({ type: "image/png", size: 10 * 1024 * 1024 + 1 }),
    "Choose an image smaller than 10 MB.",
  );
});

test("builds only the owner-scoped deterministic avatar path", () => {
  assert.equal(
    getCatPhotoPath("owner-1", "cat-2"),
    "users/owner-1/cats/cat-2/photo.jpg",
  );
});

test("converts a cropped JPEG data URL to a Blob", async () => {
  const blob = await dataUrlToBlob("data:image/jpeg;base64,/9j/2Q==");
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 4);
});
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `node --test lib/utils/catPhoto.test.cjs`

Expected: FAIL because `lib/utils/catPhoto.ts` and its exports do not exist.

- [ ] **Step 3: Implement validation, conversion, upload progress, and cleanup**

Create `lib/utils/catPhoto.ts` with these public contracts:

```ts
export const MAX_CAT_PHOTO_BYTES = 10 * 1024 * 1024;
export const CAT_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export function validateCatPhotoFile(
  file: Pick<File, "size" | "type">,
): string | null;

export function dataUrlToBlob(dataUrl: string): Promise<Blob>;
export function getCatPhotoPath(uid: string, catId: string): string;

export interface UploadCatPhotoInput {
  readonly uid: string;
  readonly catId: string;
  readonly blob: Blob;
  readonly onProgress?: (percent: number) => void;
}

export function uploadCatPhoto(input: UploadCatPhotoInput): Promise<string>;
export function deleteCatPhoto(uid: string, catId: string): Promise<void>;
```

Use `uploadBytesResumable` and resolve only after `getDownloadURL` succeeds:

```ts
const uploadTask = uploadBytesResumable(photoRef, blob, {
  contentType: "image/jpeg",
  cacheControl: "public,max-age=3600",
});

return new Promise((resolve, reject) => {
  uploadTask.on(
    "state_changed",
    (snapshot) => {
      const percent = snapshot.totalBytes === 0
        ? 0
        : Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      onProgress?.(percent);
    },
    reject,
    async () => resolve(await getDownloadURL(uploadTask.snapshot.ref)),
  );
});
```

In `deleteCatPhoto`, ignore only `storage/object-not-found`; rethrow every other error.

- [ ] **Step 4: Add owner-only Storage rules and register them locally**

Create `storage.rules` with a guidance header and this rule body:

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isOwner(userId) {
      return request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId}/cats/{catId}/photo.jpg {
      allow read, delete: if isOwner(userId);
      allow create, update: if isOwner(userId)
        && request.resource.size <= 10 * 1024 * 1024
        && request.resource.contentType.matches('image/(jpeg|png|webp|gif)');
    }
  }
}
```

Add the top-level Firebase configuration entry without disturbing hosting or Firestore:

```json
"storage": {
  "rules": "storage.rules"
}
```

- [ ] **Step 5: Run tests and validate Firebase JSON**

Run: `node --test lib/utils/catPhoto.test.cjs`

Expected: PASS.

Run: `node -e "JSON.parse(require('node:fs').readFileSync('firebase.json','utf8')); console.log('firebase.json valid')"`

Expected: `firebase.json valid`.

- [ ] **Step 6: Review the task diff without committing**

Run: `git diff -- lib/utils/catPhoto.ts lib/utils/catPhoto.test.cjs storage.rules firebase.json`

Confirm the only Firebase write target introduced is `users/{uid}/cats/{catId}/photo.jpg` and the only Firestore value produced is a download URL.

### Task 2: Integrate Storage uploads into cat creation, editing, removal, and deletion

**Files:**
- Modify: `lib/utils/imageCrop.ts`
- Modify: `app/dashboard/cats/page.tsx`
- Modify: `app/dashboard/cats/[catId]/CatDetailClient.tsx`
- Modify: `lib/contexts/CatContext.tsx`
- Create: `app/dashboard/cats/photo-upload.ui.test.mjs`

**Interfaces:**
- Consumes: all Task 1 exports and existing `cropImageToSquare`.
- Produces: profile forms that persist only Storage URLs and show upload progress/errors; cat deletion also removes its Storage object.

- [ ] **Step 1: Add source-contract tests for both photo flows**

Create `app/dashboard/cats/photo-upload.ui.test.mjs` to read the add and detail sources and assert:

```js
test("cat forms validate files and upload cropped blobs to Storage", () => {
  for (const source of [catsSource, detailSource]) {
    assert.match(source, /validateCatPhotoFile/);
    assert.match(source, /dataUrlToBlob/);
    assert.match(source, /uploadCatPhoto/);
    assert.match(source, /uploadProgress/);
    assert.match(source, /We couldn't upload that photo\. Please try again\./);
  }
});

test("cat documents receive URLs instead of fresh data URIs", () => {
  assert.match(catsSource, /avatar: uploadedPhotoUrl/);
  assert.match(detailSource, /avatar: nextAvatar/);
  assert.doesNotMatch(catsSource, /avatar,\s*isOnline/);
});

test("photo inputs declare the shared accepted image types", () => {
  assert.match(catsSource, /accept=\{CAT_PHOTO_ACCEPT\}/);
  assert.match(detailSource, /accept=\{CAT_PHOTO_ACCEPT\}/);
});
```

- [ ] **Step 2: Run the UI contract and observe failure**

Run: `node --test app/dashboard/cats/photo-upload.ui.test.mjs`

Expected: FAIL because the Storage flow is not wired.

- [ ] **Step 3: Add a header to `imageCrop.ts` and keep crop behavior unchanged**

Add the standard header describing square JPEG crop output. Do not change `outputSize = 512`, `previewSize = 128`, crop coordinates, or JPEG quality in this task.

- [ ] **Step 4: Wire the add-cat flow**

Add `selectedPhotoFile`, `uploadProgress`, and a plain-language `photo` field error. Validate before `FileReader.readAsDataURL`. In `handleSave`, keep the client-generated cat ID and use this order:

```ts
let uploadedPhotoUrl: string | null = null;
try {
  if (formData.photo && selectedPhotoFile) {
    const croppedDataUrl = await cropImageToSquare(
      formData.photo,
      photoZoom,
      photoOffset,
    );
    const blob = await dataUrlToBlob(croppedDataUrl);
    uploadedPhotoUrl = await uploadCatPhoto({
      uid: user.uid,
      catId: newCatId,
      blob,
      onProgress: setUploadProgress,
    });
  }

  await addCat({
    id: newCatId,
    name: formData.name.trim(),
    status: "normal",
    avatar: uploadedPhotoUrl,
    isOnline: false,
  }, undefined, newDetails);
} catch (error) {
  console.error("Failed to add cat profile:", error);
  if (uploadedPhotoUrl) await deleteCatPhoto(user.uid, newCatId);
  setErrors((current) => ({
    ...current,
    photo: "We couldn't upload that photo. Please try again.",
  }));
  return;
} finally {
  setIsSaving(false);
  setUploadProgress(null);
}
```

Only close/reset the sheet after the try block succeeds. Render `Uploading photo — {uploadProgress}%` while progress is non-null.

- [ ] **Step 5: Wire the edit/removal flow without re-uploading unchanged URLs**

Track whether a new local file was selected. Compute `nextAvatar` as follows:

```ts
let nextAvatar = editForm.photo;
if (selectedEditPhotoFile && editForm.photo) {
  const croppedDataUrl = await cropImageToSquare(
    editForm.photo,
    editPhotoZoom,
    editPhotoOffset,
  );
  nextAvatar = await uploadCatPhoto({
    uid: user.uid,
    catId,
    blob: await dataUrlToBlob(croppedDataUrl),
    onProgress: setUploadProgress,
  });
}

await updateCat(catId, { name: editForm.name.trim(), avatar: nextAvatar });
if (!editForm.photo && cat.avatar) await deleteCatPhoto(user.uid, catId);
```

Wrap profile updates in `try/catch/finally`, keep the sheet open on failure, and show the same owner-facing retry text. The unchanged existing download URL must bypass cropping and uploading.

- [ ] **Step 6: Delete avatar objects with cat profiles**

In `CatContext.removeCat`, call `deleteCatPhoto(user.uid, id)` after Firestore profile deletions. Treat `storage/object-not-found` as success inside the utility; log and rethrow other cleanup failures so the existing confirmation flow can report failure.

- [ ] **Step 7: Run focused and related tests**

Run: `node --test lib/utils/catPhoto.test.cjs app/dashboard/cats/photo-upload.ui.test.mjs`

Expected: PASS.

- [ ] **Step 8: Review the task diff without committing**

Run: `git diff -- lib/utils/imageCrop.ts app/dashboard/cats/page.tsx app/dashboard/cats/[catId]/CatDetailClient.tsx lib/contexts/CatContext.tsx app/dashboard/cats/photo-upload.ui.test.mjs`

Confirm no data URI is passed into `addCat` or `updateCat` after a newly selected photo is saved.

### Task 3: Pure trend reference and formatting model

**Files:**
- Create: `lib/presentation/trendCharts.ts`
- Create: `lib/presentation/trendCharts.test.cjs`

**Interfaces:**
- Consumes: baseline deviation constants and `CatTrendPoint`-shaped inputs.
- Produces: `TrendReference`, `TrendReferenceSet`, `buildCatTrendReferences`, `buildAggregateTrendReferences`, `getMetricTrendPoints`, and `formatTrendTooltipLine`.

- [ ] **Step 1: Write failing reference-model tests**

Test single-cat range construction, seconds-to-minutes conversion, visit-weighted aggregate references, and tooltip text:

```js
test("builds single-cat references from central deviation values", () => {
  const result = buildCatTrendReferences({
    avgVisitsPerDay: 4,
    avgDurationSecs: 120,
    mq135DeltaPercent: 6,
    lastUpdated: "2026-08-31",
  });

  assert.deepEqual(result.visits, { baseline: 4, normalMin: 3, normalMax: 5 });
  assert.deepEqual(result.duration, { baseline: 2, normalMin: 1.5, normalMax: 2.5 });
  assert.deepEqual(result.airQuality, { baseline: 6, normalMin: 0, normalMax: 13 });
});

test("aggregates visits by sum and other metrics by expected-visit weight", () => {
  const result = buildAggregateTrendReferences([
    { avgVisitsPerDay: 2, avgDurationSecs: 60, mq135DeltaPercent: 4, lastUpdated: "2026-08-31" },
    { avgVisitsPerDay: 6, avgDurationSecs: 180, mq135DeltaPercent: 8, lastUpdated: "2026-08-31" },
  ]);

  assert.equal(result.visits.baseline, 8);
  assert.equal(result.duration.baseline, 2.5);
  assert.equal(result.airQuality.baseline, 7);
});

test("formats one readable tooltip line", () => {
  assert.equal(
    formatTrendTooltipLine("Average Duration", 2.25, "minutes", "Mon"),
    "Average Duration: 2.25 minutes — Mon",
  );
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test lib/presentation/trendCharts.test.cjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the exact presentation types and functions**

Use these exported shapes:

```ts
export type TrendMetricId = "visits" | "duration" | "airQuality";

export interface TrendReference {
  readonly baseline: number;
  readonly normalMin: number;
  readonly normalMax: number;
}

export interface TrendReferenceSet {
  readonly visits: TrendReference;
  readonly duration: TrendReference;
  readonly airQuality: TrendReference;
}

export interface BaselineMetricsInput {
  readonly avgVisitsPerDay: number;
  readonly avgDurationSecs: number;
  readonly mq135DeltaPercent: number;
  readonly lastUpdated?: string;
}

export function buildCatTrendReferences(
  baseline: BaselineMetricsInput | null | undefined,
): TrendReferenceSet | null;

export function buildAggregateTrendReferences(
  baselines: readonly BaselineMetricsInput[],
): TrendReferenceSet | null;
```

`buildCatTrendReferences` returns `null` unless visits and duration are positive and `lastUpdated` is non-empty. Clamp lower bounds at zero. Round aggregate calculations to two decimal places. `getMetricTrendPoints` maps `avgDuration / 60` only for duration and preserves the existing day label.

- [ ] **Step 4: Run the trend-model test**

Run: `node --test lib/presentation/trendCharts.test.cjs`

Expected: PASS.

- [ ] **Step 5: Review the task diff without committing**

Run: `git diff -- lib/presentation/trendCharts.ts lib/presentation/trendCharts.test.cjs`

Confirm every range uses imported constants and no function returns a behavior state.

### Task 4: Reusable fully labeled metric chart

**Files:**
- Create: `components/charts/MetricTrendChart.tsx`
- Create: `components/charts/MetricTrendChart.ui.test.mjs`
- Delete if unused after Task 5: `components/charts/SparklineChart.tsx`

**Interfaces:**
- Consumes: `TrendReference` and `{ label, value }` points.
- Produces: `MetricTrendChart(props)` with axes, inline baseline/range labels, readable tooltip, and empty/baseline messages.

- [ ] **Step 1: Write the chart source contract**

Assert the new source contains `CartesianGrid`, `XAxis`, `YAxis`, `ReferenceArea`, `ReferenceLine`, `Normal range`, `Baseline`, `Baseline still building`, and a custom tooltip using `whitespace-nowrap`. Assert the component returns its empty message before rendering `ResponsiveContainer` when `hasData` is false.

- [ ] **Step 2: Run the contract and observe failure**

Run: `node --test components/charts/MetricTrendChart.ui.test.mjs`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component contract**

Use this public prop type:

```ts
export interface MetricTrendChartProps {
  readonly data: readonly { readonly label: string; readonly value: number }[];
  readonly metricName: string;
  readonly yAxisTitle: string;
  readonly unit: string;
  readonly color: string;
  readonly hasData: boolean;
  readonly reference?: TrendReference | null;
  readonly baselineMessage?: "building" | "unavailable";
  readonly emptyMessage: string;
  readonly height?: number;
}
```

Render the X-axis title as `Day`. Use `ReferenceArea` before the series and `ReferenceLine` after it so both labels stay visible. The tooltip content must render exactly one nowrap paragraph built by `formatTrendTooltipLine(metricName, value, unit, label)`. Keep tick text theme-aware via `fill: "var(--color-litter-muted)"` or the existing equivalent CSS token.

- [ ] **Step 4: Run the chart contract**

Run: `node --test components/charts/MetricTrendChart.ui.test.mjs`

Expected: PASS.

- [ ] **Step 5: Review the task diff without committing**

Run: `git diff -- components/charts/MetricTrendChart.tsx components/charts/MetricTrendChart.ui.test.mjs`

Confirm both axes have titles and the empty branch contains no axes.

### Task 5: Wire My Cats and Reports to the shared charts

**Files:**
- Modify: `app/dashboard/cats/[catId]/CatDetailClient.tsx`
- Modify: `app/dashboard/reports/page.tsx`
- Modify: `lib/hooks/useReports.ts`
- Modify: `lib/interfaces/ReportData.ts`
- Modify: `app/dashboard/reports/page.ui.test.mjs`
- Create: `app/dashboard/cats/[catId]/trends.ui.test.mjs`

**Interfaces:**
- Consumes: Task 3 reference builders and Task 4 chart.
- Produces: six labeled charts and optional stable `trendReferences` in new report snapshots.

- [ ] **Step 1: Add failing UI contracts for six charts and owner-facing naming**

For cat detail, assert three `MetricTrendChart` calls and exact titles/units. For Reports, assert exact `(7 days)` titles, `Air quality change`, `trendReferences`, owner-facing CSV headings, and absence of `Gas Quality` and raw sensor labels. Replace the existing raw-CSV expectation with:

```js
test("report trends use labeled seven-day owner-facing charts", () => {
  assert.equal(source.match(/<MetricTrendChart/g)?.length, 3);
  assert.match(source, /Visit Frequency \(7 days\)/);
  assert.match(source, /Average Duration \(7 days\)/);
  assert.match(source, /Air quality change \(7 days\)/);
  assert.doesNotMatch(source, /Gas Quality/);
  assert.match(source, /Change from baseline \(%\)/);
  assert.match(source, /Air quality change \(%\)/);
  assert.match(source, /Odor level change \(%\)/);
  assert.doesNotMatch(source, /MQ-135 Delta|MQ-136 Delta/);
});
```

- [ ] **Step 2: Run both contracts and observe failure**

Run: `node --test app/dashboard/reports/page.ui.test.mjs app/dashboard/cats/[catId]/trends.ui.test.mjs`

Expected: FAIL because call sites still use `SparklineChart` and Reports lacks references.

- [ ] **Step 3: Make report reference snapshots backward compatible**

Add to `ReportData`:

```ts
trendReferences?: TrendReferenceSet | null;
```

In `generateReport`, collect established baseline objects from the report's selected cats and set:

```ts
trendReferences: actualCatId === "all"
  ? buildAggregateTrendReferences(reportBaselines)
  : buildCatTrendReferences(reportBaselines[0] ?? null),
```

Do not alter `summary.overallStatus`, anomaly counts, or session-state mapping. Archived reports lacking the optional field remain readable.

- [ ] **Step 4: Replace cat-detail sparklines**

Change `TrendsTab` so only missing trend data produces the zero-session empty state. Build optional references from `details.baseline`; when absent, pass `baselineMessage="building"` and still render all data and axes. Use:

```tsx
<MetricTrendChart
  data={getMetricTrendPoints(trendData, "duration")}
  metricName="Average Duration"
  yAxisTitle="Duration (minutes)"
  unit="minutes"
  color="#E8924A"
  hasData={hasData}
  reference={references?.duration}
  baselineMessage={references ? undefined : "building"}
  emptyMessage="No sessions recorded in this 7-day period."
/>
```

Repeat with visits and air quality using their exact approved labels and reference keys.

- [ ] **Step 5: Replace report sparklines and fix the tooltip by construction**

Render three `MetricTrendChart` instances. New reports use `report.trendReferences`; older archived reports pass `baselineMessage="unavailable"`. Set `hasData={report.sessions.length > 0}` so a zero-session report renders no axes. Change CSV headings to `Air quality change (%)` and `Odor level change (%)` while retaining the internal `mq135Delta` and `mq136Delta` fields. Remove `SparklineChart` imports and delete its file if `rg "SparklineChart"` finds no remaining consumer.

- [ ] **Step 6: Run trend tests**

Run: `node --test lib/presentation/trendCharts.test.cjs components/charts/MetricTrendChart.ui.test.mjs app/dashboard/reports/page.ui.test.mjs app/dashboard/cats/[catId]/trends.ui.test.mjs`

Expected: PASS.

- [ ] **Step 7: Review the task diff without committing**

Run: `git diff -- app/dashboard/cats/[catId]/CatDetailClient.tsx app/dashboard/reports/page.tsx lib/hooks/useReports.ts lib/interfaces/ReportData.ts app/dashboard/reports/page.ui.test.mjs app/dashboard/cats/[catId]/trends.ui.test.mjs components/charts`

Confirm all six charts declare an axis title/unit and no owner-facing chart label says `Gas Quality`.

### Task 6: Shared session normalization and pure History state

**Files:**
- Create: `lib/utils/sessionNormalization.ts`
- Create: `lib/utils/sessionNormalization.test.cjs`
- Create: `lib/presentation/sessionHistory.ts`
- Create: `lib/presentation/sessionHistory.test.cjs`
- Modify: `lib/contexts/CatContext.tsx`

**Interfaces:**
- Consumes: `Session`, session date/time helpers, and shared behavior-state helpers.
- Produces: `normalizeSessionDocument`, `HistoryFilters`, preset/range parsing, filtering, sorting, grouping, and session display-state derivation.

- [ ] **Step 1: Write normalization parity tests**

Use the existing Firestore-like fixture shape to assert fallback timestamps, date keys, numbers, anomaly fields, and default `NORMAL` status exactly match current `CatContext.normalizeSession` behavior.

- [ ] **Step 2: Write History pure-model tests**

Cover these exact contracts:

```ts
export type HistoryPreset = "last7" | "last30" | "thisMonth" | "custom";
export type HistorySort = "desc" | "asc";

export interface HistoryFilters {
  readonly startDate: string;
  readonly endDate: string;
  readonly preset: HistoryPreset;
  readonly catId: "all" | "unattributed" | string;
  readonly states: readonly BehaviorStateId[];
  readonly sort: HistorySort;
}
```

Test inclusive endpoints, stale cat IDs falling back to `all`, invalid state IDs being discarded, all six states as the default, Unattributed matching missing/unknown cats, reverse sorting, and `August 28, 2026` group labels.

- [ ] **Step 3: Run both tests and confirm failure**

Run: `node --test lib/utils/sessionNormalization.test.cjs lib/presentation/sessionHistory.test.cjs`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Extract normalization mechanically**

Move `FirestoreData`, parsing helpers used only for sessions, `inferSessionStartedAt`, and `normalizeSession` into `sessionNormalization.ts`. Export:

```ts
export function normalizeSessionDocument(
  id: string,
  data: Record<string, unknown>,
): Session;
```

Import and call it from the existing `CatContext` snapshot. Do not edit `getVisitAnomaly`, `deriveLiveStatus`, `recordVisit`, or any threshold comparison.

- [ ] **Step 5: Implement History filter serialization and presentation helpers**

Export:

```ts
export const HISTORY_STORAGE_KEY = "littersense-session-history-filters";
export const HISTORY_BATCH_SIZE = 20;
export function getDefaultHistoryFilters(now?: Date): HistoryFilters;
export function parseHistoryFilters(params: URLSearchParams, validCatIds: readonly string[], now?: Date): HistoryFilters;
export function serializeHistoryFilters(filters: HistoryFilters): URLSearchParams;
export function getHistoryPresetRange(preset: Exclude<HistoryPreset, "custom">, now?: Date): Pick<HistoryFilters, "startDate" | "endDate">;
export function selectCalendarDate(startDate: string | null, endDate: string | null, selectedDate: string): { startDate: string; endDate: string | null };
export function getHistorySessionState(session: Session, catIds: ReadonlySet<string>, baselineCatIds: ReadonlySet<string>): BehaviorStateId;
export function filterAndSortHistorySessions(sessions: readonly Session[], filters: HistoryFilters, catIds: ReadonlySet<string>, baselineCatIds: ReadonlySet<string>): Session[];
export function groupHistorySessions(sessions: readonly Session[]): readonly { dateKey: string; dateLabel: string; sessions: readonly Session[] }[];
```

Use `getSessionDisplayState` for states; do not reproduce its comparisons.

- [ ] **Step 6: Run the pure tests**

Run: `node --test lib/utils/sessionNormalization.test.cjs lib/presentation/sessionHistory.test.cjs lib/presentation/behaviorStates.test.cjs`

Expected: PASS.

- [ ] **Step 7: Review the task diff without committing**

Run: `git diff -- lib/utils/sessionNormalization.ts lib/utils/sessionNormalization.test.cjs lib/presentation/sessionHistory.ts lib/presentation/sessionHistory.test.cjs lib/contexts/CatContext.tsx`

Compare the moved normalization block line-for-line with its original behavior.

### Task 7: Paginated Firestore History hook and route-aware context subscription

**Files:**
- Create: `lib/hooks/useSessionHistory.ts`
- Create: `lib/hooks/useSessionHistory.ui.test.mjs`
- Modify: `lib/contexts/CatContext.tsx`
- Modify: `app/dashboard/page.ui.test.mjs`

**Interfaces:**
- Consumes: Task 6 normalization/filter helpers, Auth, cats, and stored cat details.
- Produces: `useSessionHistory(filters)` returning incremental results, loading/error/retry state, and `loadMore`.

- [ ] **Step 1: Write source contracts for bounded queries and listener suspension**

Assert the hook uses `where("date", ">=", filters.startDate)`, `where("date", "<=", filters.endDate)`, `orderBy("date", filters.sort)`, `orderBy(documentId(), filters.sort)`, `startAfter`, and `limit(HISTORY_BATCH_SIZE)`. Assert it does not pass the bare `users/{uid}/sessions` collection directly to `getDocs` without a query and limit.

In the context contract, assert `usePathname`, `/dashboard/history`, and a conditional session unsubscribe are present. Update Home's UI test to keep its current recent-session behavior outside History.

- [ ] **Step 2: Run contracts and observe failure**

Run: `node --test lib/hooks/useSessionHistory.ui.test.mjs app/dashboard/page.ui.test.mjs`

Expected: FAIL because the hook and route guard do not exist.

- [ ] **Step 3: Implement `useSessionHistory` with cursor scanning**

Return this shape:

```ts
export interface SessionHistoryResult {
  readonly sessions: readonly Session[];
  readonly isInitialLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMore: boolean;
  readonly hasAnySessions: boolean | null;
  readonly error: string | null;
  readonly loadMore: () => Promise<void>;
  readonly retry: () => void;
}
```

On filter changes, clear the cursor/results and increment a request generation so late promises cannot append stale batches. Query one bounded server batch at a time. Normalize each document, derive/filter states in memory, and continue the loop until 20 new matches are collected or the server returns fewer than 20 documents. Deduplicate by session ID before appending.

Use a separate `limit(1)` query to set `hasAnySessions`. Map failures to `We couldn't load session history. Please try again.` and keep raw details only in `console.error`.

- [ ] **Step 4: Suspend the global session listener only on History**

At provider setup:

```ts
const pathname = usePathname();
const isHistoryRoute = pathname === "/dashboard/history";
```

Inside the existing listener effect, replace only the session subscription with a conditional no-op unsubscribe. When History is active, queue `setSessions([])`; otherwise keep the existing `onSnapshot` body. Add `isHistoryRoute` to the effect dependencies. Do not alter the remaining cat, detail, stats, or health-log listeners.

- [ ] **Step 5: Run focused contracts**

Run: `node --test lib/hooks/useSessionHistory.ui.test.mjs app/dashboard/page.ui.test.mjs lib/utils/sessionNormalization.test.cjs`

Expected: PASS.

- [ ] **Step 6: Review the task diff without committing**

Run: `git diff -- lib/hooks/useSessionHistory.ts lib/hooks/useSessionHistory.ui.test.mjs lib/contexts/CatContext.tsx app/dashboard/page.ui.test.mjs`

Confirm History reads sessions only through bounded queries and all non-History routes retain their current realtime listener.

### Task 8: Session History calendar, filters, cards, and route

**Files:**
- Create: `components/history/HistoryDateRangeCalendar.tsx`
- Create: `components/history/HistoryFilters.tsx`
- Create: `app/dashboard/history/page.tsx`
- Create: `app/dashboard/history/layout.tsx`
- Create: `app/dashboard/history/loading.tsx`
- Create: `app/dashboard/history/page.ui.test.mjs`
- Modify: `components/dashboard/SessionTimelineCard.tsx`
- Modify: `components/dashboard/SessionTimelineCard.ui.test.mjs`
- Modify: `components/ui/AppLoadingSkeletons.tsx`
- Modify: `components/ui/AppLoadingSkeletons.ui.test.mjs`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/page.ui.test.mjs`

**Interfaces:**
- Consumes: Tasks 6–7 History APIs, `BottomSheet`, shared state badges, TopBar/BottomNav, and the existing timeline card.
- Produces: `/dashboard/history`, responsive persistent filters, sticky date groups, and Home navigation.

- [ ] **Step 1: Write History page and shared-card UI contracts**

Assert the History source includes `useSessionHistory`, `HistoryFilters`, `IntersectionObserver`, `Load more`, `sticky`, `BehaviorStateBadge`, reset-range copy, and both required empty messages. Assert the filter source maps all `BEHAVIOR_STATES`, includes Unattributed, and uses `BottomSheet` on mobile. Assert the calendar uses buttons for days and range endpoint/range-middle classes.

Update session-card tests to require optional `displayState`, `BehaviorStateBadge`, and `Unattributed`. Update skeleton expectations with `app/dashboard/history/loading.tsx` and `SessionHistorySkeleton`.

Update Home's test so `View All` is a `Link` to `/dashboard/history` and `showAllRecentActivity`/`SHOW LESS` are absent.

- [ ] **Step 2: Run UI contracts and observe failure**

Run: `node --test app/dashboard/history/page.ui.test.mjs components/dashboard/SessionTimelineCard.ui.test.mjs components/ui/AppLoadingSkeletons.ui.test.mjs app/dashboard/page.ui.test.mjs`

Expected: FAIL because the route and revised contracts are absent.

- [ ] **Step 3: Build the touch-friendly date-range calendar**

Use props:

```ts
export interface HistoryDateRangeCalendarProps {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly onChange: (range: { startDate: string; endDate: string | null }) => void;
}
```

Render a seven-column grid, previous/next month buttons, blank leading cells, and day buttons with `aria-pressed`. Endpoints use a teal filled class; dates strictly between them use the teal range-background class. The root uses `w-full` and no fixed pixel transform.

- [ ] **Step 4: Build shared desktop/mobile filter content**

`HistoryFilters` owns draft state. Preset selection updates draft dates immediately; `Custom` shows the calendar. Apply serializes filters, writes `sessionStorage`, updates `router.replace`, and closes the sheet. Desktop wraps the content in `sticky top-20`; mobile renders a `Filters` button and `BottomSheet`.

State checkboxes map `BEHAVIOR_STATES` and preserve at least one selected state. Cat options are All cats, registered cats, and Unattributed. Sort options are `Newest first` and `Oldest first`.

- [ ] **Step 5: Extend the timeline card without breaking Home**

Use optional props:

```ts
export function SessionTimelineCard({
  cat,
  session,
  displayState,
}: {
  readonly cat: Cat | null;
  readonly session: Session;
  readonly displayState?: BehaviorStateId;
})
```

When `cat` is null, render `Unattributed`, a shared cat-icon placeholder, and `Detected Session`; otherwise preserve the current avatar/name and `RFID Session`. Render `BehaviorStateBadge` only when `displayState` is supplied so existing Home behavior changes only where explicitly requested.

- [ ] **Step 6: Build the route and incremental list**

The page reads applied filters from URL/session storage, calls `useSessionHistory`, groups returned records, and renders:

```tsx
<h1>Session History</h1>
<p>
  Showing {sessions.length} sessions from {formatRange(filters.startDate, filters.endDate)}
</p>
```

Date headers use `sticky top-16 z-10`. Each card receives its registered cat or `null` and a state from `getHistorySessionState`. Attach an observer sentinel after the list; call `loadMore` when intersecting and `hasMore` is true. Keep an explicit Load more button when more results exist.

Render first-run guidance when `hasAnySessions === false`. Render `No sessions recorded between [start] and [end].` plus `Reset date range` when sessions exist globally but the filtered result is empty. On errors, preserve cards and render a Retry button.

- [ ] **Step 7: Add route metadata and skeletons**

Set route metadata title to `Session History`. Add `SessionHistorySkeleton` containing a header, filter block, two date headings, and six timeline-shaped cards. `app/dashboard/history/loading.tsx` composes it inside `AppLoadingFrame`.

- [ ] **Step 8: Replace Home expansion with navigation**

Remove `showAllRecentActivity`, the toggle callback, and `SHOW LESS`. Keep the first three visits. Render:

```tsx
<Link
  href="/dashboard/history"
  className="text-sm font-semibold text-litter-primary hover:underline"
>
  VIEW ALL
</Link>
```

- [ ] **Step 9: Run History and regression tests**

Run: `node --test app/dashboard/history/page.ui.test.mjs components/dashboard/SessionTimelineCard.ui.test.mjs components/ui/AppLoadingSkeletons.ui.test.mjs app/dashboard/page.ui.test.mjs lib/presentation/sessionHistory.test.cjs`

Expected: PASS.

- [ ] **Step 10: Review the task diff without committing**

Run: `git diff -- components/history app/dashboard/history components/dashboard/SessionTimelineCard.tsx components/dashboard/SessionTimelineCard.ui.test.mjs components/ui/AppLoadingSkeletons.tsx components/ui/AppLoadingSkeletons.ui.test.mjs app/dashboard/page.tsx app/dashboard/page.ui.test.mjs`

Confirm mobile filters use a sheet, the calendar is full width, and loaded cards remain mounted during subsequent batches.

### Task 9: Handoff synchronization and final verification

**Files:**
- Modify: `HANDOFF.md`
- Modify as needed for headers only: every source file changed in Tasks 1–8

**Interfaces:**
- Consumes: all completed tasks.
- Produces: review-ready documentation and verification evidence; no commit.

- [ ] **Step 1: Add the Firebase deployment blocker to source and Handoff**

Add this exact comment to `storage.rules` beneath its header:

```text
// FIXME(defense): Deploy this reviewed rule file before testing cat-photo uploads
// in the hosted app; local code cannot activate Firebase Storage rules.
```

Add the matching `FIXME(defense)` entry to `HANDOFF.md` with `storage.rules` as the source and Firebase/project owners as the resolver. Update the Handoff “as of” date to September 1, 2026.

- [ ] **Step 2: Audit structured headers**

Run a PowerShell loop over all added/modified `.ts`, `.tsx`, `.cjs`, `.mjs`, `.rules`, and `.md` files and confirm each begins with a purpose/DONE/PLACEHOLDER/NEXT header. Exclude only `firebase.json`, which cannot contain comments.

- [ ] **Step 3: Run focused feature tests**

Run:

```powershell
node --test lib/utils/catPhoto.test.cjs lib/presentation/trendCharts.test.cjs components/charts/MetricTrendChart.ui.test.mjs lib/utils/sessionNormalization.test.cjs lib/presentation/sessionHistory.test.cjs lib/hooks/useSessionHistory.ui.test.mjs app/dashboard/history/page.ui.test.mjs app/dashboard/cats/photo-upload.ui.test.mjs app/dashboard/cats/[catId]/trends.ui.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 4: Run the complete test suite**

Run: `node --test`

Expected: all repository tests PASS with zero failures.

- [ ] **Step 5: Run static and production checks**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: successful Next.js production build, including `/dashboard/history`.

- [ ] **Step 6: Run final invariant searches**

Run:

```powershell
rg -n "Gas Quality|MQ-135 Delta|MQ-136 Delta|Photo URL too long" app components lib
rg -n "ReferenceLine|ReferenceArea|XAxis|YAxis|yAxisTitle" components/charts app/dashboard/reports app/dashboard/cats
rg -n "TODO\(phase0\)|FIXME\(defense\)" app components lib storage.rules HANDOFF.md
git log -1 --oneline
git status --short
```

Expected:

- no owner-facing `Gas Quality` remains;
- chart wiring exposes axes, reference lines, and normal bands;
- every open handoff tag has one matching `HANDOFF.md` entry;
- the latest commit hash is unchanged from before implementation; and
- only intended, uncommitted working-tree files appear.

- [ ] **Step 7: Perform the final manual code review**

Inspect the complete diff and explicitly confirm in the handoff response:

- Firebase Storage was used because this project already configures a bucket;
- Storage rules still require separate deployment;
- no detection or classification logic changed;
- no threshold is hardcoded in a React component;
- zero-data and baseline-building states render correctly;
- metric names match across Home, My Cats, Reports, and owner-facing exports;
- nothing was committed or pushed; and
- `HANDOFF.md` is synchronized with new group guidance.
