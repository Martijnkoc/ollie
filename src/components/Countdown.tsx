"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  if (days > 0) {
    const hours = Math.floor((total % 86_400) / 3600);
    return `${days} ${days === 1 ? "dag" : "dagen"}${hours ? ` en ${hours} uur` : ""}`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live countdown; when it reaches zero it refreshes the page or navigates. */
export function Countdown({ to, className, doneHref }: { to: string; className?: string; doneHref?: string }) {
  const router = useRouter();
  const target = new Date(to).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const ms = target - Date.now();
      setLeft(ms);
      if (ms <= 0 && !fired) {
        fired = true;
        if (doneHref) router.push(doneHref);
        else router.refresh();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, doneHref, router]);

  return (
    <span className={className} suppressHydrationWarning>
      {left === null ? "··:··" : format(left)}
    </span>
  );
}
