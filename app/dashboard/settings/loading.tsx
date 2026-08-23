/**
 * loading.tsx
 *
 * Route-level Settings loading UI.
 *
 * DONE: stable grouped settings rows
 * PLACEHOLDER: none
 *
 * NEXT: keep row groups aligned with Settings sections.
 */

import { AppLoadingFrame, SettingsContentSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function SettingsLoading() {
  return <AppLoadingFrame><SettingsContentSkeleton /></AppLoadingFrame>;
}

