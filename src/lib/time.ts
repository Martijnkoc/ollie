/**
 * Everything is stored in UTC. Calendar days ("wedstrijden van vandaag") and displayed times are
 * Dutch wall-clock time, including the switch to and from summer time.
 */
export const TIME_ZONE = "Europe/Amsterdam";

const MINUTE = 60_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** Offset of Dutch time from UTC at instant `ts`, in milliseconds. */
function offsetAt(ts: number) {
  const p = zonedParts(new Date(ts));
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ts / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-17" for the Dutch calendar day that contains `date`. */
export function localDay(date: Date): string {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function isValidDay(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d && y >= 2000 && y <= 2100;
}

/** The UTC instant at which Dutch local midnight of `day` begins. */
export function startOfLocalDay(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day: ${day}`);
  const [y, mo, d] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, 0, 0, 0);
  let ts = wall - offsetAt(wall);
  ts = wall - offsetAt(ts);
  return new Date(ts);
}

/** [start, end) of a Dutch calendar day in UTC. Days are 23 or 25 hours long around DST changes. */
export function localDayRange(day: string): { start: Date; end: Date } {
  return { start: startOfLocalDay(day), end: startOfLocalDay(addDays(day, 1)) };
}

export function addDays(day: string, n: number): string {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Invalid day: ${day}`);
  const [y, mo, d] = m.slice(1).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE);
}

const timeFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const timeSecondsFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const longDayFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const longDayYearFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDayFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const dateFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });

/** "20:45" in Dutch time. */
export function formatTime(date: Date | string) {
  return timeFormatter.format(new Date(date));
}

export function formatTimeSeconds(date: Date | string) {
  return timeSecondsFormatter.format(new Date(date));
}

/** "zaterdag 17 oktober" for a calendar day string. */
export function formatDayLong(day: string, withYear = false) {
  // Noon avoids any DST edge when formatting a calendar day.
  const noon = new Date(startOfLocalDay(day).getTime() + 12 * 60 * MINUTE);
  return (withYear ? longDayYearFormatter : longDayFormatter).format(noon);
}

/** "za 17 okt" */
export function formatDayShort(day: string) {
  const noon = new Date(startOfLocalDay(day).getTime() + 12 * 60 * MINUTE);
  return shortDayFormatter.format(noon);
}

/** "17 okt 2026" */
export function formatDate(date: Date | string) {
  return dateFormatter.format(new Date(date));
}

const relative = new Intl.RelativeTimeFormat("nl-NL", { numeric: "auto" });

/** "12 seconden geleden", "over 3 uur". */
export function formatRelative(date: Date | string, now = new Date()) {
  const diff = new Date(date).getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return relative.format(Math.round(diff / 1000), "second");
  if (abs < 60 * MINUTE) return relative.format(Math.round(diff / MINUTE), "minute");
  if (abs < 36 * 60 * MINUTE) return relative.format(Math.round(diff / (60 * MINUTE)), "hour");
  return relative.format(Math.round(diff / (24 * 60 * MINUTE)), "day");
}

/** Season label "2026/27" from a provider name such as "2026/2027". */
export function shortSeasonName(name: string) {
  const m = /^(\d{4})\s*[/-]\s*(\d{2,4})$/.exec(name.trim());
  if (!m) return name;
  return `${m[1]}/${m[2].slice(-2)}`;
}
