import { type Rights, assertCommunity } from "./access";
import { REPORT_REASONS } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { limit } from "./ratelimit";

type Context = "message" | "thread_message" | "date" | "profile" | "invite";

/** The reporter must be able to see what they report; target and excerpt are taken from our data, not from the form. */
async function resolveContext(db: Db, r: Rights, context: Context, id: string) {
  switch (context) {
    case "message": {
      assertCommunity(r);
      const m = await one<{ author_id: string; body: string }>(db, `select author_id, body from messages where id::text = $1`, [id]);
      return m && { target: m.author_id, excerpt: m.body };
    }
    case "thread_message": {
      const m = await one<{ author_id: string; body: string; user_a: string; user_b: string }>(
        db,
        `select tm.author_id, tm.body, t.user_a, t.user_b from thread_messages tm join threads t on t.id = tm.thread_id where tm.id::text = $1`,
        [id],
      );
      return m && (m.user_a === r.user.id || m.user_b === r.user.id) ? { target: m.author_id, excerpt: m.body } : undefined;
    }
    case "date": {
      const p = await db.query<{ user_id: string }>(`select user_id from date_participants where date_id::text = $1`, [id]);
      if (!p.some((x) => x.user_id === r.user.id)) return undefined;
      const other = p.find((x) => x.user_id !== r.user.id);
      return other?.user_id ? { target: other.user_id, excerpt: "" } : undefined;
    }
    case "profile": {
      assertCommunity(r);
      const p = await one<{ user_id: string; alias: string; bio: string }>(
        db,
        `select user_id, alias, bio from profiles where user_id::text = $1`,
        [id],
      );
      return p && { target: p.user_id, excerpt: `${p.alias}: ${p.bio}` };
    }
    case "invite": {
      const i = await one<{ organizer_id: string; message: string; guest_id: string | null }>(
        db,
        `select organizer_id, message, guest_id from invites where id::text = $1`,
        [id],
      );
      return i && i.guest_id === r.user.id ? { target: i.organizer_id, excerpt: i.message } : undefined;
    }
  }
}

export async function createReport(
  db: Db,
  r: Rights,
  input: { context: Context; contextId: string; reason: string; details: string },
  now = new Date(),
) {
  if (!REPORT_REASONS.some((x) => x.key === input.reason)) throw new UserError("Kies een reden.");
  if (input.details.length > 2000) throw new UserError("Houd je toelichting onder de 2000 tekens.");
  const ctx = await resolveContext(db, r, input.context, input.contextId);
  if (!ctx || ctx.target === r.user.id) throw new UserError("Dit kun je niet melden.");
  await limit(db, "reports", r.user.id, now);
  await db.query(
    `insert into reports (reporter_id, target_id, context, context_id, excerpt, reason, details, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [r.user.id, ctx.target, input.context, input.contextId, ctx.excerpt.slice(0, 1000), input.reason, input.details.trim(), now],
  );
  return ctx.target;
}

function requireStaff(r: Rights) {
  if (!r.staff) throw new UserError("Alleen voor moderatoren.");
}

function requireReason(reason: string) {
  if (reason.trim().length < 5) throw new UserError("Geef een reden op (minstens 5 tekens); die leggen we vast.");
  return reason.trim();
}

async function logAction(db: Db, r: Rights, target: string | null, action: string, reason: string, reportId?: string) {
  await db.query(`insert into moderation_actions (actor_id, target_id, action, reason, report_id) values ($1, $2, $3, $4, $5)`, [
    r.user.id,
    target,
    action,
    reason,
    reportId ?? null,
  ]);
}

export async function resolveReport(
  db: Db,
  r: Rights,
  reportId: string,
  outcome: "actioned" | "dismissed",
  resolution: string,
  now = new Date(),
) {
  requireStaff(r);
  const reason = requireReason(resolution);
  const rows = await db.query<{ target_id: string | null }>(
    `update reports set status = $2, resolution = $3, handled_by = $4, handled_at = $5 where id = $1 and status = 'open' returning target_id`,
    [reportId, outcome, reason, r.user.id, now],
  );
  if (!rows.length) throw new UserError("Deze melding is al afgehandeld.");
  await logAction(db, r, rows[0].target_id, `report_${outcome}`, reason, reportId);
}

/**
 * A restriction always comes from a human decision with a recorded reason. Nothing is restricted
 * automatically, and declined dates, no clicks or dislikes are never a reason.
 */
export async function restrictUser(db: Db, r: Rights, targetId: string, reason: string, reportId?: string, now = new Date()) {
  requireStaff(r);
  const why = requireReason(reason);
  if (targetId === r.user.id) throw new UserError("Je kunt jezelf niet beperken.");
  await db.transaction(async (tx) => {
    await tx.query(`update users set restricted_at = $2, restricted_reason = $3 where id = $1`, [targetId, now, why]);
    // Appointments that have not started stop; the organiser's credit returns.
    await tx.query(
      `update dates set status = case when status = 'proposed' then 'declined' else 'cancelled' end,
         credit_status = case when credit_status = 'reserved' then 'released' else credit_status end
       where status in ('proposed', 'scheduled') and id in (select date_id from date_participants where user_id = $1)`,
      [targetId],
    );
    await tx.query(`update invites set status = 'cancelled' where organizer_id = $1 and status in ('open', 'accepted')`, [targetId]);
    await logAction(tx, r, targetId, "restrict", why, reportId);
  });
}

export async function liftRestriction(db: Db, r: Rights, targetId: string, reason: string) {
  requireStaff(r);
  const why = requireReason(reason);
  await db.query(`update users set restricted_at = null, restricted_reason = null where id = $1`, [targetId]);
  await logAction(db, r, targetId, "unrestrict", why);
}

export async function submitAppeal(db: Db, r: Rights, body: string, now = new Date()) {
  if (!r.restricted) throw new UserError("Er is niets om bezwaar tegen te maken.");
  const text = body.trim();
  if (text.length < 10 || text.length > 2000) throw new UserError("Leg in 10 tot 2000 tekens uit waarom je bezwaar maakt.");
  const open = await one(db, `select 1 from appeals where user_id = $1 and status = 'open'`, [r.user.id]);
  if (open) throw new UserError("Je bezwaar wordt al beoordeeld.");
  await db.query(`insert into appeals (user_id, body, created_at) values ($1, $2, $3)`, [r.user.id, text, now]);
}

export async function decideAppeal(db: Db, r: Rights, appealId: string, grant: boolean, response: string, now = new Date()) {
  requireStaff(r);
  const why = requireReason(response);
  const rows = await db.query<{ user_id: string }>(
    `update appeals set status = $2, response = $3, handled_by = $4, handled_at = $5 where id = $1 and status = 'open' returning user_id`,
    [appealId, grant ? "granted" : "rejected", why, r.user.id, now],
  );
  if (!rows.length) throw new UserError("Dit bezwaar is al beoordeeld.");
  if (grant) await db.query(`update users set restricted_at = null, restricted_reason = null where id = $1`, [rows[0].user_id]);
  await logAction(db, r, rows[0].user_id, grant ? "appeal_granted" : "appeal_rejected", why);
}

export async function grantRole(db: Db, r: Rights, email: string, role: "admin" | "moderator") {
  if (!r.roles.includes("admin")) throw new UserError("Alleen beheerders kunnen rollen toekennen.");
  const user = await one<{ id: string }>(db, `select id from users where email = $1`, [email.trim().toLowerCase()]);
  if (!user) throw new UserError("Er is geen account met dit e-mailadres.");
  await db.query(`insert into roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing`, [user.id, role, r.user.id]);
  await logAction(db, r, user.id, `grant_${role}`, "rol toegekend");
}

export async function revokeRole(db: Db, r: Rights, userId: string, role: "admin" | "moderator") {
  if (!r.roles.includes("admin")) throw new UserError("Alleen beheerders kunnen rollen intrekken.");
  if (userId === r.user.id && role === "admin") throw new UserError("Je kunt je eigen beheerdersrol niet intrekken.");
  await db.query(`delete from roles where user_id = $1 and role = $2`, [userId, role]);
  await logAction(db, r, userId, `revoke_${role}`, "rol ingetrokken");
}
