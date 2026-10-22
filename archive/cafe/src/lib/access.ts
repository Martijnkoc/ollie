import { redirect } from "next/navigation";
import { cache } from "react";
import { type SessionUser, currentUser } from "./auth/session";
import { BILLING_GRACE_HOURS } from "./config";
import { type Db, getDb, one } from "./db";
import { UserError } from "./errors";

export type Profile = {
  user_id: string;
  alias: string;
  birth_date: string;
  region: string;
  intent: string;
  interests: string[];
  bio: string;
  show_age: boolean;
  show_region: boolean;
  listed: boolean;
};

export type Membership = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};

export const PROFILE_COLUMNS = `user_id, alias, birth_date::text as birth_date, region, intent, interests, bio, show_age, show_region, listed`;

/** Stripe statuses that grant access. past_due keeps access while Stripe retries the payment. */
const PAYING = new Set(["active", "trialing", "past_due"]);

export function membershipActive(m: Membership | undefined | null, now = new Date()) {
  if (!m || !PAYING.has(m.status)) return false;
  if (!m.current_period_end) return false;
  return m.current_period_end.getTime() + BILLING_GRACE_HOURS * 3_600_000 > now.getTime();
}

export type Rights = {
  user: SessionUser;
  profile?: Profile;
  membership?: Membership;
  roles: string[];
  member: boolean;
  restricted: boolean;
  /** Lounge, tables, member list, private chat. */
  community: boolean;
  /** Inviting someone and planning videodates (still subject to credits). */
  organise: boolean;
  staff: boolean;
};

export async function loadRights(db: Db, user: SessionUser, now = new Date()): Promise<Rights> {
  const profile = await one<Profile>(db, `select ${PROFILE_COLUMNS} from profiles where user_id = $1`, [user.id]);
  const membership = await one<Membership>(db, `select * from memberships where user_id = $1`, [user.id]);
  const roles = (await db.query<{ role: string }>(`select role from roles where user_id = $1`, [user.id])).map((r) => r.role);
  const restricted = Boolean(user.restricted_at);
  const member = membershipActive(membership, now);
  const community = !restricted && member && Boolean(profile);
  return { user, profile, membership, roles, member, restricted, community, organise: community, staff: roles.length > 0 };
}

export async function rightsFor(db: Db, userId: string, now = new Date()) {
  const user = await one<SessionUser>(db, `select id, email, restricted_at, restricted_reason from users where id = $1`, [userId]);
  if (!user) throw new UserError("Dit account bestaat niet meer.");
  return loadRights(db, user, now);
}

/** Rights of the logged-in visitor, cached per request. */
export const viewer = cache(async (): Promise<Rights | undefined> => {
  const user = await currentUser();
  if (!user) return undefined;
  return loadRights(await getDb(), user);
});

/** For pages: send people to the step they are missing. */
export async function requireCommunity(next: string) {
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=${encodeURIComponent(next)}`);
  if (v.restricted) redirect("/beperkt");
  if (!v.profile) redirect(`/welkom?next=${encodeURIComponent(next)}`);
  if (!v.member) redirect("/lidmaatschap");
  return v;
}

export async function requireStaff(role: "admin" | "moderator" = "moderator") {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/beheer");
  const ok = role === "admin" ? v.roles.includes("admin") : v.staff;
  if (!ok) redirect("/");
  return v;
}

/** For actions and API routes: refuse instead of redirecting. */
export function assertCommunity(r: Rights) {
  if (r.restricted) throw new UserError("Je account is beperkt.");
  if (!r.community) throw new UserError("Hiervoor heb je een actief lidmaatschap nodig.");
}
