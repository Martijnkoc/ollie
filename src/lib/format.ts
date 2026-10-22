import { LOCALE, TIME_ZONE } from "./config";

const date = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const dateShort = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const monthYear = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, month: "long", year: "numeric" });

export const formatDate = (d: Date | string) => date.format(new Date(d));
export const formatShort = (d: Date | string) => dateShort.format(new Date(d));
export const formatDateTime = (d: Date | string) => dateTime.format(new Date(d));
export const formatMonthYear = (d: Date | string) => monthYear.format(new Date(d));

export function days(n: number | null | undefined) {
  if (n == null) return "";
  return n === 1 ? "1 dag" : `${n} dagen`;
}

/** "3 min", "2 u", "gisteren", "12 okt" — for inbox lists. */
export function ago(d: Date | string | null, now = new Date()) {
  if (!d) return "";
  const t = new Date(d);
  const s = (now.getTime() - t.getTime()) / 1000;
  if (s < 60) return "nu";
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86_400) return `${Math.floor(s / 3600)} u`;
  if (s < 172_800) return "gisteren";
  return formatShort(t);
}
