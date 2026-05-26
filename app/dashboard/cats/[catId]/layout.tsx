import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cat Details",
};

export default function CatDetailsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
