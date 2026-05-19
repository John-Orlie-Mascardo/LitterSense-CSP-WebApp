import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "My Cats",
    template: "%s | LitterSense",
  },
};

export default function CatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
