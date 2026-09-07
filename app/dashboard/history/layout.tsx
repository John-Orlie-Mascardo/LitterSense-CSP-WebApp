/**
 * Session History route metadata.
 *
 * DONE: behavior-focused browser title
 * PLACEHOLDER: none
 *
 * NEXT: route owners should update metadata with any approved page rename.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Session History",
};

export default function SessionHistoryLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return children;
}
