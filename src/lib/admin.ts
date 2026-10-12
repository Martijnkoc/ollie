import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Db, one } from "./db";
import { safeEqual, sign } from "./tokens";

const COOKIE = "ollie_admin";
const SESSION_DAYS = 7;

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function secret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

export function checkPassword(password: string) {
  return adminConfigured() && safeEqual(password, process.env.ADMIN_PASSWORD!);
}

export async function startAdminSession() {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  (await cookies()).set(COOKIE, `${expires}.${sign(`admin.${expires}`, secret())}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin() {
  if (!adminConfigured()) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [expires, signature] = value.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(`admin.${expires}`, secret()));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function getStats(db: Db) {
  const n = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(db, sql, params))?.n ?? 0;
  const helped = await db.query<{ helped: string; n: number }>(
    `select helped, count(*)::int as n from participants where helped is not null group by helped`,
  );
  const regions = await db.query<{ region: string; n: number; visible: number }>(
    `select region, count(*)::int as n, count(*) filter (where visible)::int as visible from members group by region order by n desc`,
  );
  return {
    invites: await n(`select count(*)::int as n from invites`),
    invitesAccepted: await n(`select count(*)::int as n from invites where date_id is not null`),
    dates: await n(`select count(*)::int as n from dates where status = 'scheduled'`),
    datesCancelled: await n(`select count(*)::int as n from dates where status = 'cancelled'`),
    datesHeld: await n(
      `select count(*)::int as n from dates d where d.status = 'scheduled' and (select count(*) from participants p where p.date_id = d.id and p.joined_at is not null) = 2`,
    ),
    decisions: await n(`select count(*)::int as n from participants where decision is not null`),
    decisionsYes: await n(`select count(*)::int as n from participants where decision = 'yes'`),
    mutual: await n(
      `select count(*)::int as n from dates d where (select count(*) from participants p where p.date_id = d.id and p.decision = 'yes' and p.blocked_at is null) = 2`,
    ),
    contactShared: await n(`select count(*)::int as n from participants where contact_shared_at is not null`),
    helped: Object.fromEntries(helped.map((r) => [r.helped, r.n])) as Partial<Record<"yes" | "somewhat" | "no", number>>,
    members: await n(`select count(*)::int as n from members`),
    membersVisible: await n(`select count(*)::int as n from members where visible`),
    membersFromDates: await n(`select count(*)::int as n from members where source = 'na-date'`),
    regions,
    cafeWaitlist: await n(`select count(*)::int as n from cafe_waitlist`),
    openReports: await n(`select count(*)::int as n from reports where status = 'open'`),
  };
}

export async function listReports(db: Db) {
  return db.query<{
    id: string;
    reason: string;
    details: string;
    status: string;
    created_at: Date;
    starts_at: Date;
    source: string;
    reporter_name: string;
    reported_name: string;
    reported_email: string | null;
    reported_member_id: string | null;
  }>(
    `select r.id, r.reason, r.details, r.status, r.created_at, d.starts_at, d.source,
       a.first_name as reporter_name, b.first_name as reported_name, b.email as reported_email, b.member_id as reported_member_id
     from reports r
     join dates d on d.id = r.date_id
     join participants a on a.id = r.reporter_id
     join participants b on b.id = r.reported_id
     order by (r.status = 'open') desc, r.created_at desc`,
  );
}

export async function markReportHandled(db: Db, id: string) {
  await db.query(`update reports set status = 'handled', handled_at = now() where id = $1`, [id]);
}

export async function hideMember(db: Db, id: string) {
  await db.query(`update members set visible = false where id = $1`, [id]);
}
