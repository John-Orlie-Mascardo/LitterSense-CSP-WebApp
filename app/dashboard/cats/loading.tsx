/**
 * loading.tsx
 *
 * Route-level My Cats loading UI.
 *
 * DONE: stable app shell and cat-card grid
 * PLACEHOLDER: none
 *
 * NEXT: keep card dimensions aligned with My Cats.
 */

import { AppLoadingFrame, CatGridSkeleton } from "@/components/ui/AppLoadingSkeletons";

export default function CatsLoading() {
  return <AppLoadingFrame><CatGridSkeleton /></AppLoadingFrame>;
}

