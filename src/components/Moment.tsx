"use client";

import { useEffect, useState } from "react";

const ZONE = "Europe/Amsterdam";
const fmt = (zone: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: zone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** The agreed moment in Dutch time with its IANA zone, plus the viewer's own time when that differs. */
export function Moment({ at, className }: { at: string; className?: string }) {
  const date = new Date(at);
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && zone !== ZONE) setLocal(`${fmt(zone).format(date)} (${zone})`);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={className}>
      <time dateTime={date.toISOString()}>{fmt(ZONE).format(date)}</time>
      <span className="muted small" style={{ display: "block", fontWeight: 400 }}>
        Tijdzone {ZONE}
        {local ? ` · bij jou: ${local}` : ""}
      </span>
    </span>
  );
}
