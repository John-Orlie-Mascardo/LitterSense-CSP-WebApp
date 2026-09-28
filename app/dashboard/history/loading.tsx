/**
 * Session History route loading state.
 *
 * DONE: stable filter and grouped-card placeholders
 * PLACEHOLDER: none; these are intentional loading shapes
 *
 * NEXT: keep this composition aligned with the route's major layout.
 */

import {
  AppLoadingFrame,
  SessionHistorySkeleton,
} from "@/components/ui/AppLoadingSkeletons";

export default function SessionHistoryLoading() {
  return (
    <AppLoadingFrame>
      <SessionHistorySkeleton />
    </AppLoadingFrame>
  );
}
