import { CONTACT_FIELDS, type ContactField, FEEDBACK_DAYS } from "./config";
import { blockedEitherWay } from "./blocks";
import { viewFor } from "./dates/core";
import { type Db, one } from "./db";
import { UserError } from "./errors";

export type Answer = "yes" | "somewhat" | "no";
export type Next = "meet" | "call" | "no";
export type Feedback = { comfort: Answer; helped: Answer; next: Next };

/**
 * What a participant may learn. Raw answers of the other person are never part of this:
 * only "waiting", "mutual" (with the cautious combined next step) or "none".
 */
export type Outcome =
  | { state: "not-applicable" }
  | { state: "form" }
  | { state: "waiting"; mine: Feedback }
  | { state: "none"; mine: Feedback }
  | { state: "mutual"; mine: Feedback; kind: "meet" | "call" };

const wantsMore = (n: Next) => n === "meet" || n === "call";

export async function submitFeedback(db: Db, userId: string, dateId: string, input: Feedback, now = new Date()) {
  const view = await viewFor(db, userId, dateId, now);
  if (!view || !view.me.user_id) throw new UserError("Deze afspraak bestaat niet.");
  if (!view.date.started_at || view.phase !== "ended") throw new UserError("Feedback geef je na afloop van een gesprek.");
  const answers = ["yes", "somewhat", "no"];
  if (!answers.includes(input.comfort) || !answers.includes(input.helped) || !["meet", "call", "no"].includes(input.next)) {
    throw new UserError("Beantwoord alle drie de vragen.");
  }
  const rows = await db.query(
    `insert into feedback (date_id, user_id, comfort, helped, next, created_at) values ($1, $2, $3, $4, $5, $6)
     on conflict (date_id, user_id) do nothing returning date_id`,
    [dateId, userId, input.comfort, input.helped, input.next, now],
  );
  if (rows.length === 0) throw new UserError("Je hebt je feedback al gegeven.");
}

export async function outcomeFor(db: Db, userId: string, dateId: string, now = new Date()): Promise<Outcome> {
  const view = await viewFor(db, userId, dateId, now);
  if (!view || !view.date.started_at || view.phase !== "ended") return { state: "not-applicable" };
  const mine = await one<Feedback>(db, `select comfort, helped, next from feedback where date_id = $1 and user_id = $2`, [dateId, userId]);
  if (!mine) return { state: "form" };
  const theirs = view.other.user_id
    ? await one<{ next: Next }>(db, `select next from feedback where date_id = $1 and user_id = $2`, [dateId, view.other.user_id])
    : undefined;
  const blocked = view.other.user_id ? await blockedEitherWay(db, userId, view.other.user_id) : true;
  if (blocked) return { state: "none", mine };
  if (!theirs) {
    // Missing feedback is never consent; after the deadline it simply means no follow-up.
    const deadline = (view.date.ended_at ?? view.date.ends_at!).getTime() + FEEDBACK_DAYS * 86_400_000;
    return now.getTime() > deadline ? { state: "none", mine } : { state: "waiting", mine };
  }
  if (!wantsMore(mine.next) || !wantsMore(theirs.next)) return { state: "none", mine };
  // The more cautious wish wins: nobody is pushed into a physical date.
  const kind = mine.next === "meet" && theirs.next === "meet" ? "meet" : "call";
  return { state: "mutual", mine, kind };
}

export async function followUpOpen(db: Db, userId: string, dateId: string, now = new Date()) {
  return (await outcomeFor(db, userId, dateId, now)).state === "mutual";
}

export const CONSENT_TEXT =
  "Ik deel dit gegeven bewust met deze persoon. Ik begrijp dat de ander het kan bewaren en dat intrekken het niet bij de ander terughaalt.";

function checkValue(field: ContactField, value: string) {
  const v = value.trim();
  if (v.length < 3 || v.length > 120) throw new UserError("Vul een geldig gegeven in.");
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new UserError("Dit lijkt geen e-mailadres.");
  if (field === "phone" && !/^[+()\d\s-]{6,20}$/.test(v)) throw new UserError("Dit lijkt geen telefoonnummer.");
  return v;
}

/** One deliberate choice per detail. Mutual interest alone never shares anything. */
export async function shareContact(
  db: Db,
  userId: string,
  dateId: string,
  field: string,
  value: string,
  consent: boolean,
  now = new Date(),
) {
  if (!CONTACT_FIELDS.some((f) => f.key === field)) throw new UserError("Onbekend gegeven.");
  if (!consent) throw new UserError("Bevestig dat je dit wilt delen.");
  if (!(await followUpOpen(db, userId, dateId, now)))
    throw new UserError("Je deelt contactgegevens alleen als jullie allebei verder willen.");
  const view = (await viewFor(db, userId, dateId, now))!;
  const v = checkValue(field as ContactField, value);
  await db.transaction(async (tx) => {
    await tx.query(
      `update contact_shares set withdrawn_at = $4 where date_id = $1 and from_id = $2 and field = $3 and withdrawn_at is null`,
      [dateId, userId, field, now],
    );
    await tx.query(
      `insert into contact_shares (date_id, from_id, to_id, field, value, consent_text, shared_at) values ($1, $2, $3, $4, $5, $6, $7)`,
      [dateId, userId, view.other.user_id, field, v, CONSENT_TEXT, now],
    );
  });
}

export async function withdrawContact(db: Db, userId: string, shareId: string, now = new Date()) {
  await db.query(`update contact_shares set withdrawn_at = $3 where id = $1 and from_id = $2 and withdrawn_at is null`, [
    shareId,
    userId,
    now,
  ]);
}

export async function contactShares(db: Db, userId: string, dateId: string, now = new Date()) {
  const open = await followUpOpen(db, userId, dateId, now);
  const rows = await db.query<{ id: string; from_id: string; field: string; value: string; shared_at: Date }>(
    `select id, from_id, field, value, shared_at from contact_shares where date_id = $1 and withdrawn_at is null and (from_id = $2 or to_id = $2)`,
    [dateId, userId],
  );
  return {
    mine: rows.filter((r) => r.from_id === userId),
    // What the other person shared is only visible while the follow-up is open (it closes on a block).
    theirs: open ? rows.filter((r) => r.from_id !== userId) : [],
  };
}
