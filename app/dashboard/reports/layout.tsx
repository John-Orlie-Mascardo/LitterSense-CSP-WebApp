/**
 * Reports route layout.
 *
 * Supplies behavior-focused browser metadata for activity reports.
 *
 * DONE: route title naming
 * PLACEHOLDER: none
 *
 * NEXT: report owners update metadata alongside any approved report rename.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Litter Box Activity Reports",
};

export default function ReportsLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
