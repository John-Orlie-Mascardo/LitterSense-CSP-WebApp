import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check Email",
};

export default function CheckEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
