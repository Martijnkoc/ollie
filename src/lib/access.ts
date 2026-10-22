import { redirect } from "next/navigation";
import { cache } from "react";
import { type SessionUser, currentUser } from "./auth/session";
import { type Db, getDb, one } from "./db";
import { UserError } from "./errors";
import { mediaUrl } from "./storage";

export type Profile = {
  user_id: string;
  username: string;
  display_name: string;
  headline: string;
  bio: string;
  categories: string[];
  skills: string[];
  avatar_id: string | null;
  cover_id: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  city: string;
  region: string | null;
  works_remote: boolean;
  travel_km: number | null;
  availability: string;
  availability_note: string;
  seller_type: "private" | "business";
  kvk_number: string | null;
  website: string | null;
  published: boolean;
  hidden_at: Date | null;
  hidden_reason: string | null;
  created_at: Date;
};

/** Every profile query selects these, so media keys turn into URLs in one place. */
export const PROFILE_SELECT = `p.user_id, p.username, p.display_name, p.headline, p.bio, p.categories, p.skills, p.avatar_id, p.cover_id,
  av.storage_key as avatar_key, cv.storage_key as cover_key, p.city, p.region, p.works_remote, p.travel_km, p.availability,
  p.availability_note, p.seller_type, p.kvk_number, p.website, p.published, p.hidden_at, p.hidden_reason, p.created_at`;
export const PROFILE_JOINS = `left join media av on av.id = p.avatar_id left join media cv on cv.id = p.cover_id`;

type ProfileRow = Omit<Profile, "avatar_url" | "cover_url"> & { avatar_key: string | null; cover_key: string | null };

export function toProfile({ avatar_key, cover_key, ...row }: ProfileRow): Profile {
  return { ...row, avatar_url: mediaUrl(avatar_key), cover_url: mediaUrl(cover_key) };
}

export async function profileOf(db: Db, userId: string) {
  const row = await one<ProfileRow>(db, `select ${PROFILE_SELECT} from profiles p ${PROFILE_JOINS} where p.user_id = $1`, [userId]);
  return row && toProfile(row);
}

/** A profile anyone may see: published, not hidden by moderation. */
export function isPublic(p: Pick<Profile, "published" | "hidden_at"> | undefined | null) {
  return Boolean(p && p.published && !p.hidden_at);
}

export type Rights = {
  user: SessionUser;
  profile?: Profile;
  roles: string[];
  restricted: boolean;
  staff: boolean;
  /** Onboarded and not restricted: may message, follow, save, order and request. */
  active: boolean;
};

export async function loadRights(db: Db, user: SessionUser): Promise<Rights> {
  const profile = await profileOf(db, user.id);
  const roles = (await db.query<{ role: string }>(`select role from roles where user_id = $1`, [user.id])).map((r) => r.role);
  const restricted = Boolean(user.restricted_at);
  return { user, profile, roles, restricted, staff: roles.length > 0, active: !restricted && Boolean(profile) };
}

export async function rightsFor(db: Db, userId: string) {
  const user = await one<SessionUser>(db, `select id, email, restricted_at, restricted_reason from users where id = $1`, [userId]);
  if (!user) throw new UserError("Dit account bestaat niet meer.");
  return loadRights(db, user);
}

/** Rights of the logged-in visitor, cached per request. */
export const viewer = cache(async (): Promise<Rights | undefined> => {
  const user = await currentUser();
  if (!user) return undefined;
  return loadRights(await getDb(), user);
});

/** For pages: send people to the step they are missing. */
export async function requireActive(next: string) {
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=${encodeURIComponent(next)}`);
  if (v.restricted) redirect("/beperkt");
  if (!v.profile) redirect(`/welkom?next=${encodeURIComponent(next)}`);
  return v as Rights & { profile: Profile };
}

export async function requireStaff(role: "admin" | "moderator" = "moderator") {
  const v = await viewer();
  if (!v) redirect("/inloggen?next=/beheer");
  const ok = role === "admin" ? v.roles.includes("admin") : v.staff;
  if (!ok) redirect("/");
  return v;
}

/** For actions and API routes: refuse instead of redirecting. */
export function assertActive(r: Rights): asserts r is Rights & { profile: Profile } {
  if (r.restricted) throw new UserError("Je account is beperkt. Je kunt dit nu niet doen.");
  if (!r.profile) throw new UserError("Maak eerst je profiel af.");
}
