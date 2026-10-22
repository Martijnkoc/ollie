import { rightsFor } from "../access";
import { consumeCredit } from "../billing/credits";
import { PRESENCE_TTL_SECONDS } from "../config";
import { type Db, one } from "../db";
import { UserError } from "../errors";
import { addMinutes } from "../time";
import type { VideoProvider } from "../video/provider";
import { type DateRow, closeRoom, hardEnd, joinDeadline, lobbyOpens, phaseOf, settleAndClose, viewFor } from "./core";

export type SessionState = {
  phase: ReturnType<typeof phaseOf>;
  serverNow: string;
  startedAt: string | null;
  endsAt: string | null;
  joinDeadline: string;
  otherPresent: boolean;
};

function state(d: DateRow, otherPresentUntil: Date | null, now: Date): SessionState {
  return {
    phase: phaseOf(d, now),
    serverNow: now.toISOString(),
    startedAt: d.started_at?.toISOString() ?? null,
    endsAt: d.ends_at?.toISOString() ?? null,
    joinDeadline: joinDeadline(d).toISOString(),
    otherPresent: Boolean(otherPresentUntil && otherPresentUntil > now),
  };
}

async function participantOrRefuse(db: Db, userId: string, dateId: string, now: Date) {
  const view = await viewFor(db, userId, dateId, now);
  if (!view) throw new UserError("Je hebt geen toegang tot deze videodate.");
  const rights = await rightsFor(db, userId, now);
  if (rights.restricted) throw new UserError("Je account is beperkt.");
  return view;
}

/**
 * Hands out a short-lived provider token for this participant only. Refused for anyone who is not one
 * of the two participants, before the lobby opens, after the join window, and once the date has ended.
 */
export async function joinInfo(db: Db, userId: string, dateId: string, provider: VideoProvider | null, now = new Date()) {
  await settleAndClose(db, dateId, provider, now);
  const view = await participantOrRefuse(db, userId, dateId, now);
  const { date, me } = view;
  if (view.phase !== "lobby" && view.phase !== "live") throw new UserError("De videoruimte is nu niet open.");
  if (!provider) return { mode: "unconfigured" as const };

  let room = date.video_room;
  let url = date.video_url;
  if (!room) {
    const created = await provider.createRoom({ dateId, nbf: lobbyOpens(date), exp: hardEnd(date) });
    const stored = await db.query<{ video_room: string; video_url: string }>(
      `update dates set video_room = $2, video_url = $3 where id = $1 and video_room is null returning video_room, video_url`,
      [dateId, created.room, created.url],
    );
    if (stored.length) ({ video_room: room, video_url: url } = stored[0]);
    else {
      // Someone else created it at the same moment; use theirs and drop ours.
      await provider.closeRoom(created.room).catch(() => {});
      const row = (await one<DateRow>(db, `select * from dates where id = $1`, [dateId]))!;
      room = row.video_room;
      url = row.video_url;
    }
  }
  const token = await provider.token({
    room: room!,
    participantId: me.id,
    name: me.display_name,
    nbf: lobbyOpens(date),
    exp: date.ends_at ?? hardEnd(date),
  });
  return { mode: provider.name, url: url!, token, name: me.display_name };
}

/**
 * Called every few seconds by a participant who is in the call. The twenty minutes start exactly once,
 * on the server, when both are present: started_at and ends_at are written in one conditional update.
 * Refreshing, reconnecting, a second tab or a wrong device clock cannot move ends_at.
 */
export async function heartbeat(
  db: Db,
  userId: string,
  dateId: string,
  provider: VideoProvider | null,
  now = new Date(),
): Promise<SessionState> {
  await settleAndClose(db, dateId, provider, now);
  const view = await participantOrRefuse(db, userId, dateId, now);
  if (view.phase === "lobby" || view.phase === "live") {
    await db.query(`update date_participants set present_until = $2, first_joined_at = coalesce(first_joined_at, $3) where id = $1`, [
      view.me.id,
      new Date(now.getTime() + PRESENCE_TTL_SECONDS * 1000),
      now,
    ]);
  }
  const other = await one<{ present_until: Date | null }>(db, `select present_until from date_participants where id = $1`, [view.other.id]);
  const bothHere = view.phase === "lobby" && Boolean(other?.present_until && other.present_until > now);

  if (bothHere && (await providerConfirms(db, view.date, [view.me.id, view.other.id], provider, now))) {
    const started = await db.transaction(async (tx) => {
      const rows = await tx.query<DateRow>(
        `update dates set status = 'live', started_at = $2, ends_at = $3
         where id = $1 and status = 'scheduled' and started_at is null returning *`,
        [dateId, now, addMinutes(now, view.date.duration_minutes)],
      );
      if (rows.length) await consumeCredit(tx, dateId);
      return rows[0];
    });
    if (started?.video_room && provider) {
      // Tie the provider's hard stop to the one end time.
      await provider.setExpiry(started.video_room, started.ends_at!).catch((err) => {
        console.error(`[video] setting expiry for date ${dateId} failed`, err instanceof Error ? err.message : err);
      });
    }
  }
  const fresh = (await one<DateRow>(db, `select * from dates where id = $1`, [dateId]))!;
  return state(fresh, other?.present_until ?? null, now);
}

/** Daily's presence lags up to ~15 s; we check at most every 10 s and simply start a little later. */
async function providerConfirms(db: Db, date: DateRow, ids: string[], provider: VideoProvider | null, now: Date) {
  if (!provider || !date.video_room) return provider?.name === "fake";
  if (date.presence_checked_at && now.getTime() - date.presence_checked_at.getTime() < 10_000) return false;
  await db.query(`update dates set presence_checked_at = $2 where id = $1`, [date.id, now]);
  try {
    const present = await provider.present(date.video_room);
    return present === null || ids.every((id) => present.includes(id));
  } catch {
    return false;
  }
}

/** Ending early is always possible. It ends the conversation for both and closes the room. */
export async function endNow(db: Db, userId: string, dateId: string, provider: VideoProvider | null, now = new Date()) {
  const view = await viewFor(db, userId, dateId, now);
  if (!view) throw new UserError("Je hebt geen toegang tot deze videodate.");
  await db.query(`update date_participants set present_until = null where id = $1`, [view.me.id]);
  if (view.date.status === "live") {
    await db.query(`update dates set status = 'ended', ended_at = $2 where id = $1 and status = 'live'`, [dateId, now]);
    await closeRoom(db, dateId, view.date.video_room, provider, now);
  }
  await settleAndClose(db, dateId, provider, now);
}

/** A provider failure before the start: nobody is charged. */
export async function markFailed(db: Db, dateId: string) {
  await db.transaction(async (tx) => {
    const rows = await tx.query(`update dates set status = 'failed' where id = $1 and status = 'scheduled' returning id`, [dateId]);
    if (rows.length) await tx.query(`update dates set credit_status = 'released' where id = $1 and credit_status = 'reserved'`, [dateId]);
  });
}
