import Link from "next/link";
import { addDays, formatDayLong, formatDayShort } from "@/lib/time";
import { ChevronIcon } from "./Icons";

export const dayPath = (day: string, today: string) => (day === today ? "/" : `/wedstrijden/${day}`);

export function DayNav({ day, today }: { day: string; today: string }) {
  const prev = addDays(day, -1);
  const next = addDays(day, 1);
  const label = day === today ? "Vandaag" : day === addDays(today, -1) ? "Gisteren" : day === addDays(today, 1) ? "Morgen" : null;
  return (
    <nav className="day-nav" aria-label="Andere dag">
      <Link className="btn" href={dayPath(prev, today)} aria-label={`Vorige dag, ${formatDayLong(prev)}`}>
        <ChevronIcon dir="left" />
        <span className="small">{formatDayShort(prev)}</span>
      </Link>
      <div>
        <h1>{label ?? formatDayLong(day)}</h1>
        <div className="day-sub">{label ? formatDayLong(day, true) : day.slice(0, 4)}</div>
      </div>
      <Link className="btn" href={dayPath(next, today)} aria-label={`Volgende dag, ${formatDayLong(next)}`}>
        <span className="small">{formatDayShort(next)}</span>
        <ChevronIcon dir="right" />
      </Link>
    </nav>
  );
}
