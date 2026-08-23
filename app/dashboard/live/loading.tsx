/**
 * loading.tsx
 *
 * Route-level Live view loading UI.
 *
 * DONE: stable video and stat-card blocks
 * PLACEHOLDER: none
 *
 * NEXT: keep the video aspect ratio aligned with the live feed.
 */

import { AppLoadingFrame, LiveContentSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function LiveLoading() {
  return <AppLoadingFrame><LiveContentSkeleton /></AppLoadingFrame>;
}

