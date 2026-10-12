import { type Gender, type Intent, LAUNCH_REGIONS, MIN_AGE, SLOTS } from "./config";
import { createDate } from "./dates";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { type Candidate, compatible, pairKey } from "./matching";
import { addMinutes, ageOn, atLocalTime } from "./time";
import { hashToken, isTokenShaped, newToken } from "./tokens";

export type Member = {
  id: string;
  first_name: string;
  email: string;
  birth_date: string;
  gender: Gender;
  looking_for: Gender[];
  age_min: number;
  age_max: number;
  region: string;
  intent: Intent;
  about: string;
  slots: string[];
  visible: boolean;
  source: string;
  created_at: Date;
};

export type MemberInput = {
  firstName: string;
  email: string;
  birthDate: string;
  gender: Gender;
  lookingFor: Gender[];
  ageMin: number;
  ageMax: number;
  region: string;
  intent: Intent;
  about: string;
  slots: string[];
  visible: boolean;
};

const MEMBER_COLUMNS = `id, first_name, email, birth_date::text as birth_date, gender, looking_for, age_min, age_max, region, intent, about, slots, visible, source, created_at`;

export function inLaunchRegion(region: string) {
  return LAUNCH_REGIONS.includes(region);
}

function checkMember(input: MemberInput, now: Date) {
  if (ageOn(input.birthDate, now) < MIN_AGE) throw new UserError(`Je moet minstens ${MIN_AGE} jaar zijn om mee te doen.`);
  if (input.lookingFor.length === 0) throw new UserError("Kies wie je wilt leren kennen.");
  if (input.ageMin < MIN_AGE || input.ageMax < input.ageMin) throw new UserError("Controleer de leeftijden die je zoekt.");
}

/** A new personal link for a member; we hand one out with every e-mail. */
export async function newMemberLink(db: Db, memberId: string) {
  const token = newToken();
  await db.query(`insert into member_links (token_hash, member_id) values ($1, $2)`, [hashToken(token), memberId]);
  return token;
}

export async function linkForEmail(db: Db, email: string) {
  const member = await one<{ id: string; first_name: string }>(db, `select id, first_name from members where email = $1`, [email.trim().toLowerCase()]);
  if (!member) return undefined;
  return { firstName: member.first_name, token: await newMemberLink(db, member.id) };
}

/** Signing up again with a known e-mail sends a fresh personal link instead of creating a duplicate. */
export async function signUp(db: Db, input: MemberInput & { source?: string }, now = new Date()) {
  checkMember(input, now);
  const email = input.email.trim().toLowerCase();
  const existing = await one<{ id: string }>(db, `select id from members where email = $1`, [email]);
  if (existing) return { status: "exists" as const, token: await newMemberLink(db, existing.id), email };
  const created = await one<{ id: string }>(
    db,
    `insert into members (first_name, email, birth_date, gender, looking_for, age_min, age_max, region, intent, about, slots, visible, source, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14) returning id`,
    [
      input.firstName.trim(),
      email,
      input.birthDate,
      input.gender,
      input.lookingFor,
      input.ageMin,
      input.ageMax,
      input.region,
      input.intent,
      input.about.trim(),
      input.slots,
      input.visible,
      input.source ?? "direct",
      now,
    ],
  );
  return { status: "created" as const, token: await newMemberLink(db, created!.id), email };
}

export async function getMemberByToken(db: Db, token: string) {
  if (!isTokenShaped(token)) return undefined;
  return one<Member>(
    db,
    `select ${MEMBER_COLUMNS} from members where id = (select member_id from member_links where token_hash = $1)`,
    [hashToken(token)],
  );
}

export async function updateMember(db: Db, memberId: string, input: Omit<MemberInput, "email" | "birthDate">, now = new Date()) {
  const current = await one<Member>(db, `select ${MEMBER_COLUMNS} from members where id = $1`, [memberId]);
  if (!current) throw new UserError("Dit profiel bestaat niet meer.");
  checkMember({ ...input, email: current.email, birthDate: current.birth_date }, now);
  await db.query(
    `update members set first_name = $2, gender = $3, looking_for = $4, age_min = $5, age_max = $6, region = $7, intent = $8, about = $9, slots = $10, visible = $11, updated_at = $12 where id = $1`,
    [memberId, input.firstName.trim(), input.gender, input.lookingFor, input.ageMin, input.ageMax, input.region, input.intent, input.about.trim(), input.slots, input.visible, now],
  );
}

export async function setVisible(db: Db, memberId: string, visible: boolean) {
  await db.query(`update members set visible = $2, updated_at = now() where id = $1`, [memberId, visible]);
}

/** Removes the profile. Past dates keep only the first name the other person already knew. */
export async function deleteMember(db: Db, memberId: string) {
  await db.transaction(async (tx) => {
    await tx.query(`update participants set email = null, contact = null, contact_shared_at = null where member_id = $1`, [memberId]);
    await tx.query(`delete from members where id = $1`, [memberId]);
  });
}

// --- Kennismakingsavonden -------------------------------------------------

export type Evening = { id: string; region: string; slot: string; starts_at: Date; status: "planned" | "open" | "closed" };

export async function createEvening(db: Db, input: { region: string; slot: string; day: string }, now = new Date()) {
  const slot = SLOTS.find((s) => s.key === input.slot);
  if (!slot) throw new UserError("Onbekend tijdslot.");
  const startsAt = atLocalTime(input.day, slot.time);
  if (!startsAt) throw new UserError("Ongeldige datum.");
  if (startsAt.getTime() < now.getTime()) throw new UserError("Deze datum ligt in het verleden.");
  if (new Date(`${input.day}T12:00:00Z`).getUTCDay() !== slot.weekday) {
    throw new UserError(`${slot.label} valt niet op deze datum.`);
  }
  return one<Evening>(db, `insert into evenings (region, slot, starts_at) values ($1, $2, $3) returning *`, [input.region, input.slot, startsAt]);
}

export async function listEvenings(db: Db, opts: { from?: Date; status?: Evening["status"]; region?: string } = {}) {
  return db.query<Evening & { proposals: number; confirmed: number }>(
    `select e.*,
       (select count(*)::int from proposals p where p.evening_id = e.id) as proposals,
       (select count(*)::int from proposals p where p.evening_id = e.id and p.date_id is not null) as confirmed
     from evenings e
     where ($1::timestamptz is null or e.starts_at >= $1) and ($2::text is null or e.status = $2) and ($3::text is null or e.region = $3)
     order by e.starts_at`,
    [opts.from ?? null, opts.status ?? null, opts.region ?? null],
  );
}

export async function getEvening(db: Db, id: string) {
  return one<Evening>(db, `select * from evenings where id = $1`, [id]);
}

export async function setEveningStatus(db: Db, id: string, status: Evening["status"]) {
  await db.query(`update evenings set status = $2 where id = $1`, [id, status]);
}

export function toCandidate(m: Member, now = new Date()): Candidate {
  return {
    id: m.id,
    age: ageOn(m.birth_date, now),
    gender: m.gender,
    lookingFor: m.looking_for,
    ageMin: m.age_min,
    ageMax: m.age_max,
    region: m.region,
    intent: m.intent,
  };
}

/** Everyone who said this weekly moment suits them, plus the pairs we must never suggest. */
export async function eveningPool(db: Db, evening: Evening) {
  const members = await db.query<Member>(
    `select ${MEMBER_COLUMNS} from members where visible and region = $1 and $2 = any(slots) order by created_at`,
    [evening.region, evening.slot],
  );
  const excluded = new Set<string>();
  // Never the same pair twice, never someone who blocked the other.
  const earlier = await db.query<{ a: string; b: string }>(`select member_a as a, member_b as b from proposals`);
  const blocks = await db.query<{ a: string; b: string }>(`select member_id as a, blocked_member_id as b from member_blocks`);
  for (const r of [...earlier, ...blocks]) excluded.add(pairKey(r.a, r.b));
  // People already in a live proposal this evening are not available again.
  const busy = await db.query<{ a: string; b: string }>(
    `select member_a as a, member_b as b from proposals where evening_id = $1 and response_a <> 'declined' and response_b <> 'declined'`,
    [evening.id],
  );
  const busyIds = new Set(busy.flatMap((r) => [r.a, r.b]));
  return { members, excluded, busyIds };
}

export async function createProposal(db: Db, eveningId: string, a: string, b: string, now = new Date()) {
  const evening = await getEvening(db, eveningId);
  if (!evening || evening.status === "closed") throw new UserError("Deze avond is gesloten.");
  const { members, excluded, busyIds } = await eveningPool(db, evening);
  const ma = members.find((m) => m.id === a);
  const mb = members.find((m) => m.id === b);
  if (!ma || !mb) throw new UserError("Een van beiden doet niet (meer) mee op deze avond.");
  if (busyIds.has(a) || busyIds.has(b)) throw new UserError("Een van beiden heeft al een voorstel voor deze avond.");
  if (excluded.has(pairKey(a, b))) throw new UserError("Deze twee zijn al eerder aan elkaar voorgesteld of hebben elkaar geblokkeerd.");
  if (!compatible(toCandidate(ma, now), toCandidate(mb, now))) throw new UserError("Hun voorkeuren passen niet bij elkaar.");
  return one<{ id: string }>(db, `insert into proposals (evening_id, member_a, member_b, created_at) values ($1, $2, $3, $4) returning id`, [
    eveningId,
    a,
    b,
    now,
  ]);
}

export type ProposalForMember = {
  id: string;
  evening_id: string;
  starts_at: Date;
  my_response: "pending" | "accepted" | "declined";
  their_response: "pending" | "accepted" | "declined";
  date_id: string | null;
  my_token: string | null;
  other_first_name: string;
  other_birth_date: string;
  other_intent: Intent;
  other_about: string;
  other_region: string;
};

/** Both must accept at least this long before the evening starts. */
export const RESPONSE_CUTOFF_MINUTES = 30;

export async function memberProposals(db: Db, memberId: string) {
  return db.query<ProposalForMember>(
    `select p.id, p.evening_id, e.starts_at, p.date_id,
       case when p.member_a = $1 then p.response_a else p.response_b end as my_response,
       case when p.member_a = $1 then p.response_b else p.response_a end as their_response,
       o.first_name as other_first_name, o.birth_date::text as other_birth_date, o.intent as other_intent, o.about as other_about, o.region as other_region,
       (select token from participants pt where pt.date_id = p.date_id and pt.member_id = $1) as my_token
     from proposals p
     join evenings e on e.id = p.evening_id
     join members o on o.id = case when p.member_a = $1 then p.member_b else p.member_a end
     where p.member_a = $1 or p.member_b = $1
     order by e.starts_at desc`,
    [memberId],
  );
}

export async function respondToProposal(db: Db, memberId: string, proposalId: string, response: "accepted" | "declined", now = new Date()) {
  return db.transaction(async (tx) => {
    const p = await one<{ id: string; member_a: string; member_b: string; response_a: string; response_b: string; date_id: string | null; starts_at: Date }>(
      tx,
      `select p.*, e.starts_at from proposals p join evenings e on e.id = p.evening_id where p.id = $1 for update of p`,
      [proposalId],
    );
    if (!p || (p.member_a !== memberId && p.member_b !== memberId)) throw new UserError("Dit voorstel bestaat niet.");
    if (p.date_id) throw new UserError("Jullie videodate staat al gepland.");
    if (p.starts_at.getTime() - RESPONSE_CUTOFF_MINUTES * 60_000 < now.getTime()) throw new UserError("Dit voorstel is verlopen.");
    const mine = p.member_a === memberId ? "response_a" : "response_b";
    await tx.query(`update proposals set ${mine} = $2 where id = $1`, [proposalId, response]);
    const a = mine === "response_a" ? response : p.response_a;
    const b = mine === "response_b" ? response : p.response_b;
    if (a !== "accepted" || b !== "accepted") return { scheduled: false as const };

    const people = await tx.query<{ id: string; first_name: string; email: string }>(
      `select id, first_name, email from members where id in ($1, $2)`,
      [p.member_a, p.member_b],
    );
    const ma = people.find((m) => m.id === p.member_a)!;
    const mb = people.find((m) => m.id === p.member_b)!;
    const { id } = await createDate(tx, {
      source: "community",
      proposalId,
      startsAt: p.starts_at,
      people: [
        { role: "member", firstName: ma.first_name, email: ma.email, memberId: ma.id },
        { role: "member", firstName: mb.first_name, email: mb.email, memberId: mb.id },
      ],
    });
    await tx.query(`update proposals set date_id = $2 where id = $1`, [proposalId, id]);
    const participants = await tx.query<{ token: string; email: string; first_name: string }>(
      `select token, email, first_name from participants where date_id = $1`,
      [id],
    );
    return { scheduled: true as const, dateId: id, startsAt: p.starts_at, participants };
  });
}

export function proposalState(p: ProposalForMember, now = new Date()) {
  if (p.date_id) return "scheduled" as const;
  if (p.my_response === "declined" || p.their_response === "declined") return "closed" as const;
  if (addMinutes(p.starts_at, -RESPONSE_CUTOFF_MINUTES).getTime() < now.getTime()) return "expired" as const;
  if (p.my_response === "accepted") return "waiting" as const;
  return "open" as const;
}

export async function memberDates(db: Db, memberId: string) {
  return db.query<{ token: string; starts_at: Date; status: string; other_first_name: string; decision: string | null }>(
    `select me.token, d.starts_at, d.status, o.first_name as other_first_name, me.decision
     from participants me
     join dates d on d.id = me.date_id
     join participants o on o.date_id = me.date_id and o.id <> me.id
     where me.member_id = $1
     order by d.starts_at desc`,
    [memberId],
  );
}

export async function joinCafeWaitlist(db: Db, input: { firstName: string; email: string; region: string }) {
  await db.query(
    `insert into cafe_waitlist (first_name, email, region) values ($1, $2, $3)
     on conflict (email) do update set first_name = excluded.first_name, region = excluded.region`,
    [input.firstName.trim(), input.email.trim().toLowerCase(), input.region],
  );
}
