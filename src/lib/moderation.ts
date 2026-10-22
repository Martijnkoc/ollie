import { type Rights } from "./access";
import { REPORT_REASONS } from "./config";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { limit } from "./ratelimit";

export type ReportContext = "profile" | "service" | "portfolio" | "review" | "message" | "order";

/** The reporter must be able to see what they report; target and excerpt come from our data, never from the form. */
async function resolveContext(db: Db, r: Rights, context: ReportContext, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) && context !== "message") return undefined;
  switch (context) {
    case "profile": {
      const p = await one<{ user_id: string; display_name: string; headline: string; bio: string }>(
        db,
        `select user_id, display_name, headline, bio from profiles where user_id::text = $1 and published and hidden_at is null`,
        [id],
      );
      return p && { target: p.user_id, excerpt: `${p.display_name}: ${p.headline}\n${p.bio}` };
    }
    case "service": {
      const s = await one<{ owner_id: string; title: string; description: string }>(
        db,
        `select owner_id, title, description from services where id::text = $1 and status = 'published' and hidden_at is null`,
        [id],
      );
      return s && { target: s.owner_id, excerpt: `${s.title}\n${s.description}` };
    }
    case "portfolio": {
      const i = await one<{ owner_id: string; title: string; description: string }>(
        db,
        `select owner_id, title, description from portfolio_items where id::text = $1 and published and hidden_at is null`,
        [id],
      );
      return i && { target: i.owner_id, excerpt: `${i.title}\n${i.description}` };
    }
    case "review": {
      const v = await one<{ author_id: string | null; seller_id: string; body: string; reply: string | null }>(
        db,
        `select author_id, seller_id, body, reply from reviews where id::text = $1 and hidden_at is null`,
        [id],
      );
      if (!v) return undefined;
      // The maker reports the review about them; anyone else reports the maker's public reply.
      return v.seller_id === r.user.id
        ? v.author_id && { target: v.author_id, excerpt: v.body }
        : { target: v.seller_id, excerpt: `${v.body}${v.reply ? `\n— reactie: ${v.reply}` : ""}` };
    }
    case "message": {
      const m = await one<{ author_id: string; body: string; user_a: string; user_b: string }>(
        db,
        `select tm.author_id, tm.body, t.user_a, t.user_b from thread_messages tm join threads t on t.id = tm.thread_id where tm.id::text = $1`,
        [id],
      );
      return m && (m.user_a === r.user.id || m.user_b === r.user.id) ? { target: m.author_id, excerpt: m.body } : undefined;
    }
    case "order": {
      const o = await one<{ buyer_id: string | null; seller_id: string | null; title: string; brief: string }>(
        db,
        `select buyer_id, seller_id, title, brief from orders where id::text = $1`,
        [id],
      );
      if (!o || (o.buyer_id !== r.user.id && o.seller_id !== r.user.id)) return undefined;
      const other = o.buyer_id === r.user.id ? o.seller_id : o.buyer_id;
      return other ? { target: other, excerpt: `${o.title}\n${o.brief}` } : undefined;
    }
  }
}

export async function createReport(
  db: Db,
  r: Rights,
  input: { context: ReportContext; contextId: string; reason: string; details: string },
  now = new Date(),
) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  if (!REPORT_REASONS.some((x) => x.key === input.reason)) throw new UserError("Kies een reden.");
  if (input.details.length > 2000) throw new UserError("Houd je toelichting onder de 2000 tekens.");
  const ctx = await resolveContext(db, r, input.context, input.contextId);
  if (!ctx || !ctx.target || ctx.target === r.user.id) throw new UserError("Dit kun je niet melden.");
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
 * automatically. The person's public content disappears from the platform, unpaid orders stop, and paid
 * orders keep running so buyers can still be refunded or receive their delivery.
 */
export async function restrictUser(db: Db, r: Rights, targetId: string, reason: string, reportId?: string, now = new Date()) {
  requireStaff(r);
  const why = requireReason(reason);
  if (targetId === r.user.id) throw new UserError("Je kunt jezelf niet beperken.");
  await db.transaction(async (tx) => {
    await tx.query(`update users set restricted_at = $2, restricted_reason = $3 where id = $1`, [targetId, now, why]);
    const open = await tx.query<{ id: string }>(
      `update orders set status = 'cancelled', cancelled_at = $2, cancel_reason = 'Account beperkt door moderatie', updated_at = $2
       where (buyer_id = $1 or seller_id = $1) and status in ('requested', 'quoted', 'awaiting_payment') and payment_status = 'none' returning id`,
      [targetId, now],
    );
    for (const o of open) {
      await tx.query(`update quotes set status = 'withdrawn', responded_at = $2 where order_id = $1 and status = 'open'`, [o.id, now]);
      await tx.query(`insert into order_events (order_id, actor_id, kind, created_at) values ($1, null, 'cancelled_moderation', $2)`, [
        o.id,
        now,
      ]);
    }
    await logAction(tx, r, targetId, "restrict", why, reportId);
  });
}

const HIDEABLE = { profile: "profiles", service: "services", portfolio: "portfolio_items", review: "reviews" } as const;

/** Hides one piece of content with a reason the owner can read. Reversible. */
export async function hideContent(
  db: Db,
  r: Rights,
  context: keyof typeof HIDEABLE,
  id: string,
  reason: string,
  reportId?: string,
  now = new Date(),
) {
  requireStaff(r);
  const why = requireReason(reason);
  const table = HIDEABLE[context];
  const key = context === "profile" ? "user_id" : "id";
  const owner = context === "profile" ? "user_id" : context === "review" ? "author_id" : "owner_id";
  const rows = await db.query<{ owner: string | null }>(
    `update ${table} set hidden_at = $2, hidden_reason = $3 where ${key}::text = $1 returning ${owner} as owner`,
    [id, now, why],
  );
  if (!rows.length) throw new UserError("Deze inhoud bestaat niet meer.");
  await logAction(db, r, rows[0].owner, `hide_${context}`, why, reportId);
}

export async function unhideContent(db: Db, r: Rights, context: keyof typeof HIDEABLE, id: string, reason: string) {
  requireStaff(r);
  const why = requireReason(reason);
  const table = HIDEABLE[context];
  const key = context === "profile" ? "user_id" : "id";
  const owner = context === "profile" ? "user_id" : context === "review" ? "author_id" : "owner_id";
  const rows = await db.query<{ owner: string | null }>(
    `update ${table} set hidden_at = null, hidden_reason = null where ${key}::text = $1 returning ${owner} as owner`,
    [id],
  );
  if (rows.length) await logAction(db, r, rows[0].owner, `unhide_${context}`, why);
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
