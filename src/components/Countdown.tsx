"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function formatLeft(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  if (days > 0) {
    const hours = Math.floor((total % 86_400) / 3600);
    return `${days} ${days === 1 ? "dag" : "dagen"}${hours ? ` en ${hours} uur` : ""}`;
  }
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/**
 * Counts down to `to`, corrected by the difference between server and device clock,
 * and refreshes the page at zero so the server decides what comes next.
 */
export function Countdown({ to, serverNow, className }: { to: string; serverNow: string; className?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const offset = new Date(serverNow).getTime() - Date.now();
    const target = new Date(to).getTime();
    let done = false;
    const tick = () => {
      const ms = target - (Date.now() + offset);
      setLeft(ms);
      if (ms <= 0 && !done) {
        done = true;
        router.refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to, serverNow, router]);
  return (
    <span className={className} suppressHydrationWarning>
      {left === null ? "··:··" : formatLeft(left)}
    </span>
  );
}
