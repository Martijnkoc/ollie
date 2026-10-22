import { type Rights, rightsFor } from "../access";
import { creditSummary, releaseCredit, reserveCredit } from "../billing/credits";
import { assertNotBlocked } from "../blocks";
import { DATE_MINUTES, JOIN_WINDOW_MINUTES, LOBBY_MINUTES, MAX_DAYS_AHEAD, MIN_LEAD_MINUTES } from "../config";
import { type Db, one } from "../db";
import { UserError } from "../errors";
import { limit } from "../ratelimit";
import { addMinutes } from "../time";
import type { VideoProvider } from "../video/provider";

export type DateStatus = "proposed" | "scheduled" | "live" | "ended" | "cancelled" | "declined" | "no_show" | "failed";

export type DateRow = {
  id: string;
  source: "invite" | "community" | "followup";
  invite_id: string | null;
  parent_date_id: string | null;
  organizer_id: string | null;
  proposed_by: string | null;
  scheduled_at: Date;
  duration_minutes: number;
  status: DateStatus;
  started_at: Date | null;
  ends_at: Date | null;
  ended_at: Date | null;
  cancelled_by: string | null;
  credit_status: "none" | "reserved" | "consumed" | "released";
  video_room: string | null;
  video_url: string | null;
  room_closed_at: Date | null;
  presence_checked_at: Date | null;
};

export type Participant = {
  id: string;
  date_id: string;
  user_id: string | null;
  role: "organizer" | "guest" | "member";
  display_name: string;
  present_until: Date | null;
  first_joined_at: Date | null;
};

/** What the page shows. "upcoming" and "lobby" are both status=scheduled, split by time. */
export type Phase = "proposed" | "upcoming" | "lobby" | "live" | "ended" | "cancelled" | "declined" | "no_show" | "failed";

export function joinDeadline(d: Pick<DateRow, "scheduled_at">) {
  return addMinutes(d.scheduled_at, JOIN_WINDOW_MINUTES);
}

export function lobbyOpens(d: Pick<DateRow, "scheduled_at">) {
  return addMinutes(d.scheduled_at, -LOBBY_MINUTES);
}

/** The latest moment the provider room may exist: last possible start plus the full duration. */
export function hardEnd(d: Pick<DateRow, "scheduled_at" | "duration_minutes">) {
  return addMinutes(joinDeadline(d), d.duration_minutes);
}

export function phaseOf(d: DateRow, now = new Date()): Phase {
  switch (d.status) {
    case "scheduled":
      if (now < lobbyOpens(d)) return "upcoming";
      return now < joinDeadline(d) ? "lobby" : "no_show";
    case "live":
      return d.ends_at && now < d.ends_at ? "live" : "ended";
    default:
      return d.status;
  }
}

export function checkMoment(moment: Date, now = new Date()) {
  if (Number.isNaN(moment.getTime())) throw new UserError("Kies een geldige datum en tijd.");
  if (moment < addMinutes(now, MIN_LEAD_MINUTES))
    throw new UserError(`Kies een moment dat minstens ${MIN_LEAD_MINUTES} minuten in de toekomst ligt.`);
  if (moment > addMinutes(now, MAX_DAYS_AHEAD * 24 * 60)) throw new UserError(`Kies een moment binnen de komende ${MAX_DAYS_AHEAD} dagen.`);
}

type NewDate = {
  source: DateRow["source"];
  inviteId?: string;
  parentDateId?: string;
  organizerId: string;
  proposedBy: string;
  scheduledAt: Date;
  status: "proposed" | "scheduled";
  people: { userId: string; role: Participant["role"]; name: string }[];
};

/** Inserts the appointment; a confirmed one reserves the organiser's credit in the same transaction. */
export async function insertDate(tx: Db, input: NewDate, now = new Date()) {
  const date = await one<{ id: string }>(
    tx,
    `insert into dates (source, invite_id, parent_date_id, organizer_id, proposed_by, scheduled_at, duration_minutes, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      input.source,
      input.inviteId ?? null,
      input.parentDateId ?? null,
      input.organizerId,
      input.proposedBy,
      input.scheduledAt,
      DATE_MINUTES,
      input.status,
      now,
    ],
  );
  for (const p of input.people) {
    await tx.query(`insert into date_participants (date_id, user_id, role, display_name) values ($1, $2, $3, $4)`, [
      date!.id,
      p.userId,
      p.role,
      p.name,
    ]);
  }
  if (input.status === "scheduled") await reserveCredit(tx, date!.id, input.organizerId, now);
  return date!.id;
}

export async function participantsOf(db: Db, dateId: string) {
  return db.query<Participant>(`select * from date_participants where date_id = $1 order by role`, [dateId]);
}

export type DateView = { date: DateRow; me: Participant; other: Participant; phase: Phase };

/** Only the two participants ever get a view; anyone else gets undefined, whatever the id. */
export async function viewFor(db: Db, userId: string, dateId: string, now = new Date()): Promise<DateView | undefined> {
  if (!/^[0-9a-f-]{36}$/.test(dateId)) return undefined;
  const date = await one<DateRow>(db, `select * from dates where id = $1`, [dateId]);
  if (!date) return undefined;
  const people = await participantsOf(db, dateId);
  const me = people.find((p) => p.user_id === userId);
  const other = people.find((p) => p !== me);
  if (!me || !other) return undefined;
  return { date, me, other, phase: phaseOf(date, now) };
}

/**
 * Applies transitions that depend only on time: a no-show after the join window, the end after
 * the twenty minutes. Credits are released for a no-show. Returns rooms that must be closed.
 */
export async function settle(db: Db, dateId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const d = await one<DateRow>(tx, `select * from dates where id = $1 for update`, [dateId]);
    if (!d) return null;
    const phase = phaseOf(d, now);
    if (d.status === "scheduled" && phase === "no_show") {
      await tx.query(`update dates set status = 'no_show' where id = $1`, [dateId]);
      await releaseCredit(tx, dateId);
    } else if (d.status === "live" && phase === "ended") {
      await tx.query(`update dates set status = 'ended', ended_at = ends_at where id = $1`, [dateId]);
    } else if (d.status === "proposed" && d.scheduled_at < now) {
      await tx.query(`update dates set status = 'declined' where id = $1`, [dateId]);
    }
    const after = (await one<DateRow>(tx, `select * from dates where id = $1`, [dateId]))!;
    const terminal = ["ended", "cancelled", "declined", "no_show", "failed"].includes(after.status);
    return terminal && after.video_room && !after.room_closed_at ? after.video_room : null;
  });
}

export async function closeRoom(db: Db, dateId: string, room: string | null, provider: VideoProvider | null, now = new Date()) {
  if (!room || !provider) return;
  try {
    await provider.closeRoom(room);
    await db.query(`update dates set room_closed_at = $2 where id = $1 and room_closed_at is null`, [dateId, now]);
  } catch (err) {
    console.error(`[video] closing room for date ${dateId} failed`, err instanceof Error ? err.message : err);
  }
}

export async function settleAndClose(db: Db, dateId: string, provider: VideoProvider | null, now = new Date()) {
  const room = await settle(db, dateId, now);
  await closeRoom(db, dateId, room, provider, now);
}

/** Either participant can cancel until the conversation has started. */
export async function cancelDate(db: Db, userId: string, dateId: string, provider: VideoProvider | null, now = new Date()) {
  const view = await viewFor(db, userId, dateId, now);
  if (!view) throw new UserError("Deze afspraak bestaat niet.");
  const room = await db.transaction(async (tx) => {
    const d = await one<DateRow>(tx, `select * from dates where id = $1 for update`, [dateId]);
    if (!d || (d.status !== "scheduled" && d.status !== "proposed")) throw new UserError("Deze afspraak kan niet meer worden afgezegd.");
    await tx.query(`update dates set status = $2, cancelled_by = $3 where id = $1`, [
      dateId,
      d.status === "proposed" ? "declined" : "cancelled",
      userId,
    ]);
    await releaseCredit(tx, dateId);
    if (d.invite_id) await tx.query(`update invites set status = 'cancelled' where id = $1`, [d.invite_id]);
    return d.video_room;
  });
  await closeRoom(db, dateId, room, provider, now);
  return view;
}

/**
 * A member proposes a videodate to someone they already know here: an accepted private chat
 * (community) or a conversation with mutual interest (follow-up). The proposer is the organiser and pays.
 */
export async function proposeDate(
  db: Db,
  r: Rights,
  input: { otherId: string; scheduledAt: Date; source: "community" | "followup"; parentDateId?: string },
  now = new Date(),
) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  if (!r.organise) throw new UserError("Om een videodate te plannen heb je een actief lidmaatschap nodig.");
  checkMoment(input.scheduledAt, now);
  await assertNotBlocked(db, r.user.id, input.otherId);
  const other = await rightsFor(db, input.otherId, now);
  if (other.restricted) throw new UserError("Deze persoon is nu niet bereikbaar.");
  let otherName: string;
  if (input.source === "community") {
    const { threadBetween } = await import("../community/contacts");
    if (!other.community || !(await threadBetween(db, r.user.id, input.otherId))) {
      throw new UserError("Je kunt een videodate voorstellen aan iemand met wie je een privégesprek hebt.");
    }
    otherName = other.profile!.alias;
  } else {
    const { followUpOpen } = await import("../feedback");
    if (!input.parentDateId || !(await followUpOpen(db, r.user.id, input.parentDateId, now))) {
      throw new UserError("Een vervolg plan je pas als jullie allebei verder willen.");
    }
    const parent = (await viewFor(db, r.user.id, input.parentDateId, now))!;
    otherName = parent.other.display_name;
  }
  const credits = await creditSummary(db, r.user.id, now);
  if (credits.available < 1) throw new UserError("Je videodates voor deze periode zijn op.");
  await limit(db, "proposals", r.user.id, now);
  const myName = r.profile?.alias ?? "Lid";
  return db.transaction((tx) =>
    insertDate(
      tx,
      {
        source: input.source,
        parentDateId: input.parentDateId,
        organizerId: r.user.id,
        proposedBy: r.user.id,
        scheduledAt: input.scheduledAt,
        status: "proposed",
        people: [
          { userId: r.user.id, role: "organizer", name: myName },
          { userId: input.otherId, role: input.source === "community" ? "member" : "guest", name: otherName },
        ],
      },
      now,
    ),
  );
}

/** The other person confirms (or declines). Only then is it an appointment and is a credit reserved. */
export async function respondToProposal(db: Db, userId: string, dateId: string, accept: boolean, now = new Date()) {
  const view = await viewFor(db, userId, dateId, now);
  if (!view || view.date.proposed_by === userId) throw new UserError("Dit voorstel bestaat niet.");
  const responder = await rightsFor(db, userId, now);
  if (responder.restricted) throw new UserError("Je account is beperkt.");
  return db.transaction(async (tx) => {
    const d = await one<DateRow>(tx, `select * from dates where id = $1 for update`, [dateId]);
    if (!d || d.status !== "proposed") throw new UserError("Op dit voorstel is al gereageerd.");
    if (!accept) {
      await tx.query(`update dates set status = 'declined' where id = $1`, [dateId]);
      return "declined" as const;
    }
    if (d.scheduled_at < addMinutes(now, 2)) throw new UserError("Dit moment is al voorbij.");
    await assertNotBlocked(tx, userId, d.organizer_id!);
    await reserveCredit(tx, dateId, d.organizer_id!, now);
    await tx.query(`update dates set status = 'scheduled' where id = $1`, [dateId]);
    return "scheduled" as const;
  });
}

export async function datesFor(db: Db, userId: string) {
  return db.query<DateRow & { other_name: string; my_role: string }>(
    `select d.*, o.display_name as other_name, me.role as my_role
     from date_participants me
     join dates d on d.id = me.date_id
     join date_participants o on o.date_id = d.id and o.id <> me.id
     where me.user_id = $1
     order by d.scheduled_at desc limit 100`,
    [userId],
  );
}
