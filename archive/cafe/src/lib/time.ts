import { DATE_MINUTES, LOBBY_MINUTES, TIME_ZONE } from "./config";

const MINUTE = 60_000;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date): Parts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function offsetAt(ts: number) {
  const p = zonedParts(new Date(ts));
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(ts / MINUTE) * MINUTE;
}

/** Interpret "2026-10-15T20:00" (what <input type="datetime-local"> sends) as Dutch wall-clock time. */
export function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let ts = wall - offsetAt(wall);
  ts = wall - offsetAt(ts);
  const result = new Date(ts);
  const check = zonedParts(result);
  // Times that don't exist (the hour skipped when clocks go forward) are rejected.
  if (check.day !== day || check.hour !== hour || check.minute !== minute) return null;
  return result;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalInput(date: Date) {
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function localDay(date: Date) {
  return toLocalInput(date).slice(0, 10);
}

const dayFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const shortFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("nl-NL", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function formatTime(date: Date) {
  return timeFormatter.format(date);
}

/** "donderdag 15 oktober om 20:00" */
export function formatMoment(date: Date) {
  return `${dayFormatter.format(date)} om ${formatTime(date)}`;
}

/** "do 15 okt, 20:00" */
export function formatShort(date: Date) {
  return `${shortFormatter.format(date)}, ${formatTime(date)}`;
}

const relative = new Intl.RelativeTimeFormat("nl-NL", { numeric: "auto" });

export function formatRelative(date: Date, now = new Date()) {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60 * MINUTE) return relative.format(Math.round(diff / MINUTE), "minute");
  if (abs < 36 * 60 * MINUTE) return relative.format(Math.round(diff / (60 * MINUTE)), "hour");
  return relative.format(Math.round(diff / (24 * 60 * MINUTE)), "day");
}

export type Phase = "upcoming" | "lobby" | "live" | "ended";

export function endsAt(startsAt: Date, minutes = DATE_MINUTES) {
  return new Date(startsAt.getTime() + minutes * MINUTE);
}

export function opensAt(startsAt: Date) {
  return new Date(startsAt.getTime() - LOBBY_MINUTES * MINUTE);
}

export function datePhase(startsAt: Date, now = new Date(), minutes = DATE_MINUTES): Phase {
  const t = now.getTime();
  if (t < opensAt(startsAt).getTime()) return "upcoming";
  if (t < startsAt.getTime()) return "lobby";
  if (t < endsAt(startsAt, minutes).getTime()) return "live";
  return "ended";
}

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * MINUTE);
}

export function ageOn(birthDate: string | Date, now = new Date()) {
  const b = typeof birthDate === "string" ? birthDate : localDay(birthDate);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  const p = zonedParts(now);
  let age = p.year - by;
  if (p.month < bm || (p.month === bm && p.day < bd)) age -= 1;
  return age;
}

/** Combine a calendar day ("2026-10-15") with a wall-clock time ("20:00") in Dutch time. */
export function atLocalTime(day: string, time: string) {
  return parseLocal(`${day}T${time}`);
}

/**
 * Earliest value for a datetime-local picker with step=900. Browsers count steps
 * from `min`, so it must sit on a quarter hour or 20:00 would be rejected.
 */
export function earliestMomentInput(leadMinutes: number, now = new Date()) {
  const quarter = 15 * MINUTE;
  return toLocalInput(new Date(Math.ceil((now.getTime() + leadMinutes * MINUTE) / quarter) * quarter));
}
