import { type Rights, assertCommunity, membershipActive, type Membership, PROFILE_COLUMNS, type Profile } from "../access";
import { hiddenUsers } from "../blocks";
import { type Db, one } from "../db";
import { ageOn } from "../time";

/** What another member may see: only the fields this member chose to show. */
export type PublicProfile = {
  id: string;
  alias: string;
  age: number | null;
  region: string | null;
  intent: string;
  interests: string[];
  bio: string;
};

export function publicView(p: Profile, now = new Date()): PublicProfile {
  return {
    id: p.user_id,
    alias: p.alias,
    age: p.show_age ? ageOn(p.birth_date, now) : null,
    region: p.show_region ? p.region : null,
    intent: p.intent,
    interests: p.interests,
    bio: p.bio,
  };
}

/** Members who are listed, currently paying, not restricted, and not blocked either way. */
export async function searchMembers(db: Db, r: Rights, q: string, now = new Date()) {
  assertCommunity(r);
  const hidden = await hiddenUsers(db, r.user.id);
  const term = `%${q
    .trim()
    .toLowerCase()
    .replace(/[%_\\]/g, "")}%`;
  const rows = await db.query<Profile & Membership>(
    `select p.user_id, p.alias, p.birth_date::text as birth_date, p.region, p.intent, p.interests, p.bio, p.show_age, p.show_region, p.listed,
            m.status, m.current_period_end
     from profiles p
     join users u on u.id = p.user_id and u.restricted_at is null
     join memberships m on m.user_id = p.user_id
     where p.listed and p.user_id <> $1 and not (p.user_id = any($2::uuid[]))
       and (lower(p.alias) like $3 or (p.show_region and lower(p.region) like $3)
            or exists (select 1 from unnest(p.interests) i where lower(i) like $3))
     order by p.updated_at desc limit 60`,
    [r.user.id, hidden, term],
  );
  return rows.filter((p) => membershipActive(p as unknown as Membership, now)).map((p) => publicView(p, now));
}

/** A profile is visible to members only while its owner is an active, unrestricted member. */
export async function memberProfile(db: Db, r: Rights, userId: string, now = new Date()) {
  assertCommunity(r);
  if ((await hiddenUsers(db, r.user.id)).includes(userId)) return undefined;
  const p = await one<Profile>(
    db,
    `select ${PROFILE_COLUMNS} from profiles where user_id = $1 and exists (select 1 from users u where u.id = $1 and u.restricted_at is null)`,
    [userId],
  );
  const m = await one<Membership>(db, `select * from memberships where user_id = $1`, [userId]);
  if (!p || (userId !== r.user.id && !membershipActive(m, now))) return undefined;
  return publicView(p, now);
}
