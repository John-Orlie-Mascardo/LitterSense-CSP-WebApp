import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Playback",
};

export default function PlaybackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
