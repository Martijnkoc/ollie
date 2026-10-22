import { type Rights } from "./access";
import { creditSummary } from "./billing/credits";
import { assertNotBlocked } from "./blocks";
import { MAX_PROPOSED_MOMENTS, MATCH_ORIGINS } from "./config";
import { checkMoment, insertDate } from "./dates/core";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { limit } from "./ratelimit";
import { addMinutes } from "./time";
import { hashToken, isTokenShaped, newToken } from "./tokens";

export type Invite = {
  id: string;
  organizer_id: string;
  organizer_name: string;
  match_name: string;
  origin: string;
  message: string;
  status: "open" | "accepted" | "scheduled" | "declined" | "rejected" | "cancelled";
  expires_at: Date;
  guest_id: string | null;
  guest_name: string | null;
  guest_note: string | null;
  chosen_at: Date | null;
  accepted_at: Date | null;
  date_id: string | null;
  created_at: Date;
};

export function inviteState(i: Invite, now = new Date()) {
  if (i.status === "open" && i.expires_at <= now) return "expired" as const;
  return i.status;
}

/**
 * A member invites a match from elsewhere. The link carries a 192-bit bearer token in the URL
 * fragment (never sent to servers or logs); we store only its hash. It invites someone to confirm
 * participation; it never grants video access by itself.
 */
export async function createInvite(
  db: Db,
  r: Rights,
  input: { matchName: string; origin: string; message: string; moments: Date[] },
  now = new Date(),
) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  if (!r.organise || !r.profile) throw new UserError("Om iemand uit te nodigen heb je een actief lidmaatschap nodig.");
  const moments = [...new Map(input.moments.map((m) => [m.getTime(), m])).values()].sort((a, b) => a.getTime() - b.getTime());
  if (moments.length === 0) throw new UserError("Kies minstens één moment.");
  if (moments.length > MAX_PROPOSED_MOMENTS) throw new UserError(`Kies maximaal ${MAX_PROPOSED_MOMENTS} momenten.`);
  moments.forEach((m) => checkMoment(m, now));
  if (input.origin && !(MATCH_ORIGINS as readonly string[]).includes(input.origin)) throw new UserError("Kies waar jullie matchten.");
  if (input.matchName.trim().length > 30 || input.message.trim().length > 280) throw new UserError("Houd naam en bericht kort.");
  const credits = await creditSummary(db, r.user.id, now);
  if (credits.available < 1) throw new UserError("Je videodates voor deze periode zijn op.");
  await limit(db, "invites", r.user.id, now);

  const token = newToken(24);
  const id = await db.transaction(async (tx) => {
    const invite = await one<{ id: string }>(
      tx,
      `insert into invites (token_hash, organizer_id, organizer_name, match_name, origin, message, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [hashToken(token), r.user.id, r.profile!.alias, input.matchName.trim(), input.origin, input.message.trim(), moments.at(-1), now],
    );
    for (const m of moments) await tx.query(`insert into invite_moments (invite_id, starts_at) values ($1, $2)`, [invite!.id, m]);
    return invite!.id;
  });
  return { id, token };
}

export async function inviteByToken(db: Db, token: string | undefined) {
  if (!isTokenShaped(token)) return undefined;
  return one<Invite>(db, `select * from invites where token_hash = $1`, [hashToken(token)]);
}

export async function momentsOf(db: Db, inviteId: string, now = new Date()) {
  const rows = await db.query<{ starts_at: Date }>(`select starts_at from invite_moments where invite_id = $1 order by starts_at`, [
    inviteId,
  ]);
  return rows.map((r) => r.starts_at).filter((m) => m > addMinutes(now, 5));
}

/** The guest confirms with their own (logged-in) account; the organiser then confirms it is the right person. */
export async function acceptInvite(
  db: Db,
  guestId: string,
  token: string,
  input: { moment: Date; name: string; note: string },
  now = new Date(),
) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 30) throw new UserError("Vul je voornaam in.");
  if (input.note.trim().length > 200) throw new UserError("Houd je berichtje onder de 200 tekens.");
  return db.transaction(async (tx) => {
    const invite = await one<Invite>(tx, `select * from invites where token_hash = $1 for update`, [hashToken(token)]);
    if (!invite) throw new UserError("Deze uitnodiging bestaat niet.");
    const state = inviteState(invite, now);
    if (state === "expired") throw new UserError("Deze uitnodiging is verlopen.");
    if (state !== "open") throw new UserError("Deze uitnodiging is al beantwoord of ingetrokken.");
    if (invite.organizer_id === guestId) throw new UserError("Je kunt je eigen uitnodiging niet aannemen.");
    await assertNotBlocked(tx, invite.organizer_id, guestId);
    const moments = await momentsOf(tx, invite.id, now);
    if (!moments.some((m) => m.getTime() === input.moment.getTime())) throw new UserError("Dit moment is niet (meer) beschikbaar.");
    await tx.query(
      `update invites set status = 'accepted', guest_id = $2, guest_name = $3, guest_note = $4, chosen_at = $5, accepted_at = $6 where id = $1`,
      [invite.id, guestId, name, input.note.trim(), input.moment, now],
    );
    return invite;
  });
}

export async function declineInvite(db: Db, token: string) {
  const rows = await db.query(`update invites set status = 'declined' where token_hash = $1 and status = 'open' returning id`, [
    hashToken(token),
  ]);
  if (rows.length === 0) throw new UserError("Deze uitnodiging is al beantwoord of ingetrokken.");
}

async function ownInvite(tx: Db, organizerId: string, inviteId: string) {
  if (!/^[0-9a-f-]{36}$/.test(inviteId)) throw new UserError("Deze uitnodiging bestaat niet.");
  const invite = await one<Invite>(tx, `select * from invites where id = $1 for update`, [inviteId]);
  if (!invite || invite.organizer_id !== organizerId) throw new UserError("Deze uitnodiging bestaat niet.");
  return invite;
}

/** Organiser recognises the person who accepted: now it is an appointment and a credit is reserved. */
export async function confirmGuest(db: Db, r: Rights, inviteId: string, now = new Date()) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  return db.transaction(async (tx) => {
    const invite = await ownInvite(tx, r.user.id, inviteId);
    if (invite.status !== "accepted" || !invite.guest_id || !invite.chosen_at) throw new UserError("Er is niets om te bevestigen.");
    if (invite.chosen_at < addMinutes(now, 2)) throw new UserError("Het gekozen moment is al voorbij.");
    const dateId = await insertDate(
      tx,
      {
        source: "invite",
        inviteId,
        organizerId: r.user.id,
        proposedBy: r.user.id,
        scheduledAt: invite.chosen_at,
        status: "scheduled",
        people: [
          { userId: r.user.id, role: "organizer", name: invite.organizer_name },
          { userId: invite.guest_id, role: "guest", name: invite.guest_name ?? "Gast" },
        ],
      },
      now,
    );
    await tx.query(`update invites set status = 'scheduled', date_id = $2 where id = $1`, [inviteId, dateId]);
    return { dateId, invite };
  });
}

/** "This is not my match": the link is spent, nobody gets access. */
export async function rejectGuest(db: Db, r: Rights, inviteId: string) {
  await db.transaction(async (tx) => {
    const invite = await ownInvite(tx, r.user.id, inviteId);
    if (invite.status !== "accepted") throw new UserError("Er is niets om af te wijzen.");
    await tx.query(`update invites set status = 'rejected' where id = $1`, [inviteId]);
  });
}

export async function revokeInvite(db: Db, r: Rights, inviteId: string) {
  await db.transaction(async (tx) => {
    const invite = await ownInvite(tx, r.user.id, inviteId);
    if (invite.status !== "open" && invite.status !== "accepted") throw new UserError("Deze uitnodiging kan niet meer worden ingetrokken.");
    await tx.query(`update invites set status = 'cancelled' where id = $1`, [inviteId]);
  });
}

export async function invitesFor(db: Db, organizerId: string) {
  return db.query<Invite>(`select * from invites where organizer_id = $1 order by created_at desc limit 50`, [organizerId]);
}

export async function inviteForOrganizer(db: Db, organizerId: string, inviteId: string) {
  if (!/^[0-9a-f-]{36}$/.test(inviteId)) return undefined;
  const invite = await one<Invite>(db, `select * from invites where id = $1 and organizer_id = $2`, [inviteId, organizerId]);
  return invite;
}
