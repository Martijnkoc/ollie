import type { DateRow } from "./dates";
import type { Db } from "./db";
import { endsAt, opensAt } from "./time";

const DAILY_API = "https://api.daily.co/v1";

export function videoConfigured() {
  return Boolean(process.env.DAILY_API_KEY);
}

async function daily<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${DAILY_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Daily ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * A private two-person room that only exists for this date's window.
 * Daily ejects everyone at `exp`, so the twenty minutes are enforced server-side
 * and not just by the countdown in the browser.
 */
async function ensureRoom(db: Db, date: DateRow) {
  if (date.video_room && date.video_url) return { room: date.video_room, url: date.video_url };
  const created = await daily<{ name: string; url: string }>("/rooms", {
    name: `ollie-${date.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
    privacy: "private",
    properties: {
      nbf: unix(opensAt(date.starts_at)),
      exp: unix(endsAt(date.starts_at, date.duration_minutes)),
      eject_at_room_exp: true,
      max_participants: 2,
      enable_chat: false,
      enable_screenshare: false,
      enable_knocking: false,
      enable_prejoin_ui: true,
      lang: "nl",
    },
  });
  // Two people can arrive at once; whoever stores a room first wins.
  const stored = await db.query<{ video_room: string; video_url: string }>(
    `update dates set video_room = $2, video_url = $3 where id = $1 and video_room is null returning video_room, video_url`,
    [date.id, created.name, created.url],
  );
  if (stored.length) return { room: created.name, url: created.url };
  const [row] = await db.query<{ video_room: string; video_url: string }>(`select video_room, video_url from dates where id = $1`, [date.id]);
  return { room: row.video_room, url: row.video_url };
}

export type VideoJoin = { mode: "daily"; url: string } | { mode: "demo" };

export async function joinInfo(db: Db, date: DateRow, firstName: string): Promise<VideoJoin> {
  if (!videoConfigured()) return { mode: "demo" };
  const { room, url } = await ensureRoom(db, date);
  const { token } = await daily<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: room,
      user_name: firstName,
      exp: unix(endsAt(date.starts_at, date.duration_minutes)),
      eject_at_token_exp: true,
    },
  });
  return { mode: "daily", url: `${url}?t=${encodeURIComponent(token)}` };
}
