/**
 * loading.tsx
 *
 * Route-level Notifications loading UI.
 *
 * DONE: stable notification-list rows
 * PLACEHOLDER: none
 *
 * NEXT: keep row height aligned with notification cards.
 */

import { AppLoadingFrame, NotificationsContentSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function NotificationsLoading() {
  return <AppLoadingFrame><NotificationsContentSkeleton /></AppLoadingFrame>;
}

