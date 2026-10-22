"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function InboxLink({ href, children }: { href: string; children: React.ReactNode }) {
  const current = usePathname() === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
