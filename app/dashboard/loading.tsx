/**
 * loading.tsx
 *
 * Route-level Home loading UI.
 *
 * DONE: stable dashboard shell, chart, stat cards, and activity rows
 * PLACEHOLDER: none
 *
 * NEXT: keep aligned with the Home page's major layout regions.
 */

import { AppLoadingFrame, DashboardContentSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function DashboardLoading() {
  return <AppLoadingFrame><DashboardContentSkeleton /></AppLoadingFrame>;
}

