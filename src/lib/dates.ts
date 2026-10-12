import { DATE_MINUTES } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { type Phase, datePhase, endsAt } from "./time";
import { isTokenShaped, newToken } from "./tokens";

export type DateRow = {
  id: string;
  source: "invite" | "community";
  invite_id: string | null;
  proposal_id: string | null;
  starts_at: Date;
  duration_minutes: number;
  status: "scheduled" | "cancelled";
  video_room: string | null;
  video_url: string | null;
};

export type Participant = {
  id: string;
  date_id: string;
  role: "host" | "guest" | "member";
  token: string;
  first_name: string;
  email: string | null;
  member_id: string | null;
  joined_at: Date | null;
  decision: "yes" | "no" | null;
  decided_at: Date | null;
  helped: "yes" | "somewhat" | "no" | null;
  contact: string | null;
  contact_shared_at: Date | null;
  cancelled_at: Date | null;
  blocked_at: Date | null;
};

/**
 * What one participant may know about the result.
 * A "no" is never shown as such: the other side only ever sees "no-match".
 */
export type Outcome = "undecided" | "waiting" | "mutual" | "no-match";

export type DateView = {
  date: DateRow;
  me: Participant;
  other: Participant;
  phase: Phase | "cancelled";
  outcome: Outcome;
  /** The other person's contact details, only when both chose to continue and they shared them. */
  otherContact: string | null;
};

/** After this many days without an answer from the other side, we stop waiting. */
const DECISION_DAYS = 7;

export type NewParticipant = {
  role: Participant["role"];
  firstName: string;
  email?: string | null;
  memberId?: string | null;
  token?: string;
};

export async function createDate(
  db: Db,
  input: { source: DateRow["source"]; inviteId?: string; proposalId?: string; startsAt: Date; people: [NewParticipant, NewParticipant] },
) {
  const date = await one<{ id: string }>(
    db,
    `insert into dates (source, invite_id, proposal_id, starts_at, duration_minutes) values ($1, $2, $3, $4, $5) returning id`,
    [input.source, input.inviteId ?? null, input.proposalId ?? null, input.startsAt, DATE_MINUTES],
  );
  const tokens: string[] = [];
  for (const p of input.people) {
    const token = p.token ?? newToken();
    tokens.push(token);
    await db.query(
      `insert into participants (date_id, role, token, first_name, email, member_id) values ($1, $2, $3, $4, $5, $6)`,
      [date!.id, p.role, token, p.firstName, p.email ?? null, p.memberId ?? null],
    );
  }
  return { id: date!.id, tokens: tokens as [string, string] };
}

export function outcomeFor(me: Participant, other: Participant, date: DateRow, now = new Date()): Outcome {
  if (me.blocked_at || other.blocked_at) return me.decision ? "no-match" : "undecided";
  if (!me.decision) return "undecided";
  if (!other.decision) {
    const deadline = endsAt(date.starts_at, date.duration_minutes).getTime() + DECISION_DAYS * 86_400_000;
    return now.getTime() > deadline ? "no-match" : "waiting";
  }
  return me.decision === "yes" && other.decision === "yes" ? "mutual" : "no-match";
}

export async function getView(db: Db, token: string, now = new Date()): Promise<DateView | null> {
  if (!isTokenShaped(token)) return null;
  const me = await one<Participant>(db, `select * from participants where token = $1`, [token]);
  if (!me) return null;
  const date = await one<DateRow>(db, `select * from dates where id = $1`, [me.date_id]);
  const other = await one<Participant>(db, `select * from participants where date_id = $1 and id <> $2`, [me.date_id, me.id]);
  if (!date || !other) return null;
  const outcome = outcomeFor(me, other, date, now);
  return {
    date,
    me,
    other,
    phase: date.status === "cancelled" ? "cancelled" : datePhase(date.starts_at, now, date.duration_minutes),
    outcome,
    otherContact: outcome === "mutual" && other.contact_shared_at ? other.contact : null,
  };
}

async function load(db: Db, token: string, now: Date) {
  const view = await getView(db, token, now);
  if (!view) throw new UserError("Deze link klopt niet (meer).");
  return view;
}

export async function markJoined(db: Db, token: string, now = new Date()) {
  await db.query(`update participants set joined_at = coalesce(joined_at, $2) where token = $1`, [token, now]);
}

export async function cancelDate(db: Db, token: string, now = new Date()) {
  const view = await load(db, token, now);
  if (view.phase !== "upcoming" && view.phase !== "lobby") {
    throw new UserError("Deze videodate kan niet meer worden afgezegd.");
  }
  await db.transaction(async (tx) => {
    await tx.query(`update dates set status = 'cancelled' where id = $1`, [view.date.id]);
    await tx.query(`update participants set cancelled_at = $2 where id = $1`, [view.me.id, now]);
    if (view.date.invite_id) await tx.query(`update invites set status = 'cancelled' where id = $1`, [view.date.invite_id]);
  });
  return view;
}

export async function decide(db: Db, token: string, decision: "yes" | "no", now = new Date()) {
  const view = await load(db, token, now);
  if (view.phase !== "live" && view.phase !== "ended") throw new UserError("Je kunt pas kiezen als jullie elkaar gesproken hebben.");
  if (view.me.decision) throw new UserError("Je hebt je keuze al gemaakt.");
  await db.query(`update participants set decision = $2, decided_at = $3 where id = $1 and decision is null`, [view.me.id, decision, now]);
  return (await getView(db, token, now))!;
}

export async function setHelped(db: Db, token: string, helped: "yes" | "somewhat" | "no", now = new Date()) {
  const view = await load(db, token, now);
  if (view.phase !== "live" && view.phase !== "ended") throw new UserError("Deze vraag stellen we na afloop.");
  await db.query(`update participants set helped = $2 where id = $1`, [view.me.id, helped]);
}

export async function shareContact(db: Db, token: string, contact: string, now = new Date()) {
  const view = await load(db, token, now);
  if (view.outcome !== "mutual") throw new UserError("Contactgegevens deel je alleen als jullie allebei verder willen.");
  const value = contact.trim();
  if (value.length < 3 || value.length > 200) throw new UserError("Vul iets in tussen 3 en 200 tekens.");
  await db.query(`update participants set contact = $2, contact_shared_at = $3 where id = $1`, [view.me.id, value, now]);
  return view;
}

export async function withdrawContact(db: Db, token: string, now = new Date()) {
  const view = await load(db, token, now);
  await db.query(`update participants set contact = null, contact_shared_at = null where id = $1`, [view.me.id]);
}

export async function blockOther(db: Db, token: string, now = new Date()) {
  const view = await load(db, token, now);
  await db.transaction(async (tx) => {
    await tx.query(`update participants set blocked_at = coalesce(blocked_at, $2), contact = null, contact_shared_at = null where id = $1`, [view.me.id, now]);
    if (view.date.status === "scheduled" && (view.phase === "upcoming" || view.phase === "lobby")) {
      await tx.query(`update dates set status = 'cancelled' where id = $1`, [view.date.id]);
      if (view.date.invite_id) await tx.query(`update invites set status = 'cancelled' where id = $1`, [view.date.invite_id]);
    }
    if (view.me.member_id && view.other.member_id) {
      await tx.query(`insert into member_blocks (member_id, blocked_member_id) values ($1, $2) on conflict do nothing`, [
        view.me.member_id,
        view.other.member_id,
      ]);
    }
  });
}

export async function reportOther(db: Db, token: string, input: { reason: string; details: string; block: boolean }, now = new Date()) {
  const view = await load(db, token, now);
  await db.query(`insert into reports (date_id, reporter_id, reported_id, reason, details) values ($1, $2, $3, $4, $5)`, [
    view.date.id,
    view.me.id,
    view.other.id,
    input.reason,
    input.details.trim().slice(0, 2000),
  ]);
  if (input.block) await blockOther(db, token, now);
}
