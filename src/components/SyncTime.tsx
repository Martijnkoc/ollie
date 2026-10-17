"use client";

import { useEffect, useState } from "react";
import { formatRelative, formatTimeSeconds } from "@/lib/time";

/** "14:32:05 (12 seconden geleden)". The relative part appears after hydration to avoid mismatches. */
export function SyncTime({ iso, prefix = "Laatst bijgewerkt" }: { iso: string | null; prefix?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return <span>{prefix}: nog nooit</span>;
  return (
    <span>
      {prefix}: <time dateTime={iso}>{formatTimeSeconds(iso)}</time>
      {now && <span className="dim"> ({formatRelative(iso, now)})</span>}
    </span>
  );
}
