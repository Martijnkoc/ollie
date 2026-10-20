import type { Metadata } from "next";

/** Personal projects live on the user's device and are never for search engines. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
