import { MAX_DAYS_AHEAD, MAX_PROPOSED_MOMENTS, MIN_LEAD_MINUTES, MONTHLY_DATE_LIMIT } from "./config";
import { createDate } from "./dates";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { addMinutes } from "./time";
import { isTokenShaped, newInviteCode, newToken } from "./tokens";

export type Invite = {
  id: string;
  code: string;
  host_token: string;
  host_name: string;
  host_email: string;
  match_name: string;
  message: string;
  status: "open" | "alternative" | "scheduled" | "cancelled";
  alt_starts_at: Date | null;
  alt_guest_name: string | null;
  alt_guest_email: string | null;
  alt_guest_token: string | null;
  date_id: string | null;
  created_at: Date;
};

export type InviteInput = {
  hostName: string;
  hostEmail: string;
  matchName: string;
  message: string;
  moments: Date[];
};

export function checkMoment(moment: Date, now = new Date()) {
  if (moment.getTime() < addMinutes(now, MIN_LEAD_MINUTES).getTime()) {
    throw new UserError(`Kies een moment dat minstens ${MIN_LEAD_MINUTES} minuten in de toekomst ligt.`);
  }
  if (moment.getTime() > addMinutes(now, MAX_DAYS_AHEAD * 24 * 60).getTime()) {
    throw new UserError(`Kies een moment binnen de komende ${MAX_DAYS_AHEAD} dagen.`);
  }
}

export async function createInvite(db: Db, input: InviteInput, now = new Date()) {
  const moments = [...new Map(input.moments.map((m) => [m.getTime(), m])).values()].sort((a, b) => a.getTime() - b.getTime());
  if (moments.length === 0) throw new UserError("Stel minstens één moment voor.");
  if (moments.length > MAX_PROPOSED_MOMENTS) throw new UserError(`Stel maximaal ${MAX_PROPOSED_MOMENTS} momenten voor.`);
  moments.forEach((m) => checkMoment(m, now));

  const email = input.hostEmail.trim().toLowerCase();
  const used = await one<{ n: number }>(
    db,
    `select count(*)::int as n from invites where host_email = $1 and created_at > $2 and status <> 'cancelled'`,
    [email, addMinutes(now, -30 * 24 * 60)],
  );
  if ((used?.n ?? 0) >= MONTHLY_DATE_LIMIT) {
    throw new UserError(`Je hebt deze maand al ${MONTHLY_DATE_LIMIT} uitnodigingen verstuurd. Dat is het maximum in de proefperiode.`);
  }

  const code = newInviteCode();
  const hostToken = newToken();
  await db.transaction(async (tx) => {
    const invite = await one<{ id: string }>(
      tx,
      `insert into invites (code, host_token, host_name, host_email, match_name, message, created_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [code, hostToken, input.hostName.trim(), email, input.matchName.trim(), input.message.trim(), now],
    );
    for (const m of moments) {
      await tx.query(`insert into invite_moments (invite_id, starts_at) values ($1, $2)`, [invite!.id, m]);
    }
  });
  return { code, hostToken };
}

export async function getInviteByCode(db: Db, code: string) {
  if (!isTokenShaped(code)) return undefined;
  return one<Invite>(db, `select * from invites where code = $1`, [code]);
}

export async function getInviteByHostToken(db: Db, hostToken: string) {
  if (!isTokenShaped(hostToken)) return undefined;
  return one<Invite>(db, `select * from invites where host_token = $1`, [hostToken]);
}

export async function getMoments(db: Db, inviteId: string) {
  const rows = await db.query<{ starts_at: Date }>(`select starts_at from invite_moments where invite_id = $1 order by starts_at`, [inviteId]);
  return rows.map((r) => r.starts_at);
}

/** Moments the guest can still pick: not too close to now. */
export function selectableMoments(moments: Date[], now = new Date()) {
  return moments.filter((m) => m.getTime() > addMinutes(now, 2).getTime());
}

export async function hostParticipantToken(db: Db, invite: Invite) {
  if (!invite.date_id) return undefined;
  const row = await one<{ token: string }>(db, `select token from participants where date_id = $1 and role = 'host'`, [invite.date_id]);
  return row?.token;
}

type GuestInput = { code: string; guestName: string; guestEmail?: string | null; guestToken?: string };

async function scheduleFromInvite(tx: Db, invite: Invite, startsAt: Date, guest: { name: string; email: string | null; token?: string }) {
  const { id, tokens } = await createDate(tx, {
    source: "invite",
    inviteId: invite.id,
    startsAt,
    people: [
      { role: "host", firstName: invite.host_name, email: invite.host_email },
      { role: "guest", firstName: guest.name, email: guest.email, token: guest.token },
    ],
  });
  await tx.query(
    `update invites set status = 'scheduled', date_id = $2, alt_starts_at = null, alt_guest_token = null where id = $1`,
    [invite.id, id],
  );
  return { dateId: id, hostToken: tokens[0], guestToken: tokens[1] };
}

export async function acceptMoment(db: Db, input: GuestInput & { startsAt: Date }, now = new Date()) {
  return db.transaction(async (tx) => {
    const invite = await one<Invite>(tx, `select * from invites where code = $1 for update`, [input.code]);
    if (!invite) throw new UserError("Deze uitnodiging bestaat niet (meer).");
    if (invite.status === "scheduled") throw new UserError("Deze uitnodiging is al aangenomen.");
    if (invite.status === "cancelled") throw new UserError("Deze uitnodiging is ingetrokken.");
    const moments = selectableMoments(await getMoments(tx, invite.id), now);
    if (!moments.some((m) => m.getTime() === input.startsAt.getTime())) {
      throw new UserError("Dit moment is niet (meer) beschikbaar. Kies een ander moment.");
    }
    return scheduleFromInvite(tx, invite, input.startsAt, {
      name: input.guestName.trim(),
      email: input.guestEmail?.trim().toLowerCase() || null,
      token: input.guestToken,
    });
  });
}

/** None of the moments work: the guest suggests one, the host confirms. */
export async function proposeAlternative(db: Db, input: GuestInput & { startsAt: Date }, now = new Date()) {
  checkMoment(input.startsAt, now);
  const guestToken = input.guestToken ?? newToken();
  const updated = await db.query(
    `update invites set status = 'alternative', alt_starts_at = $2, alt_guest_name = $3, alt_guest_email = $4, alt_guest_token = $5
     where code = $1 and status in ('open', 'alternative') returning id`,
    [input.code, input.startsAt, input.guestName.trim(), input.guestEmail?.trim().toLowerCase() || null, guestToken],
  );
  if (updated.length === 0) throw new UserError("Deze uitnodiging is niet meer open.");
  return { guestToken };
}

export async function acceptAlternative(db: Db, hostToken: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const invite = await one<Invite>(tx, `select * from invites where host_token = $1 for update`, [hostToken]);
    if (!invite || invite.status !== "alternative" || !invite.alt_starts_at || !invite.alt_guest_token) {
      throw new UserError("Er staat geen voorstel open.");
    }
    if (invite.alt_starts_at.getTime() < addMinutes(now, 2).getTime()) {
      throw new UserError("Het voorgestelde moment is al voorbij.");
    }
    const result = await scheduleFromInvite(tx, invite, invite.alt_starts_at, {
      name: invite.alt_guest_name ?? "Je match",
      email: invite.alt_guest_email,
      token: invite.alt_guest_token,
    });
    return { ...result, invite };
  });
}

export async function declineAlternative(db: Db, hostToken: string) {
  const rows = await db.query<Invite>(
    `update invites set status = 'open', alt_starts_at = null, alt_guest_name = null, alt_guest_email = null, alt_guest_token = null
     where host_token = $1 and status = 'alternative' returning *`,
    [hostToken],
  );
  if (rows.length === 0) throw new UserError("Er staat geen voorstel open.");
}

export async function addMoment(db: Db, hostToken: string, moment: Date, now = new Date()) {
  checkMoment(moment, now);
  const invite = await getInviteByHostToken(db, hostToken);
  if (!invite || (invite.status !== "open" && invite.status !== "alternative")) throw new UserError("Deze uitnodiging is niet meer open.");
  const moments = selectableMoments(await getMoments(db, invite.id), now);
  if (moments.length >= MAX_PROPOSED_MOMENTS) throw new UserError(`Er staan al ${MAX_PROPOSED_MOMENTS} momenten open.`);
  await db.query(`insert into invite_moments (invite_id, starts_at) values ($1, $2) on conflict do nothing`, [invite.id, moment]);
}

export async function cancelInvite(db: Db, hostToken: string) {
  const rows = await db.query(
    `update invites set status = 'cancelled' where host_token = $1 and status in ('open', 'alternative') returning id`,
    [hostToken],
  );
  if (rows.length === 0) throw new UserError("Deze uitnodiging kan niet meer worden ingetrokken.");
}
