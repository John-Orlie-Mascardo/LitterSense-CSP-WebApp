/**
 * loading.tsx
 *
 * Route-level Reports loading UI.
 *
 * DONE: stable controls, accordion rows, and chart block
 * PLACEHOLDER: none
 *
 * NEXT: keep aligned with the generated-report structure.
 */

import { AppLoadingFrame, ReportsContentSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function ReportsLoading() {
  return <AppLoadingFrame><ReportsContentSkeleton /></AppLoadingFrame>;
}

