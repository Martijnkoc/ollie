import { type Rights, assertActive, isPublic, profileOf } from "./access";
import { assertNotBlocked } from "./blocks";
import { type Db, one } from "./db";
import { UserError } from "./errors";
import { getPortfolioItem } from "./portfolio";
import { limit } from "./ratelimit";
import { getService } from "./services";

export async function follow(db: Db, r: Rights, userId: string, on: boolean, now = new Date()) {
  assertActive(r);
  if (userId === r.user.id) throw new UserError("Je kunt jezelf niet volgen.");
  if (!on) {
    await db.query(`delete from follows where follower_id = $1 and followee_id = $2`, [r.user.id, userId]);
    return false;
  }
  const target = await profileOf(db, userId);
  if (!isPublic(target)) throw new UserError("Dit profiel bestaat niet.");
  await assertNotBlocked(db, r.user.id, userId);
  await limit(db, "follows", r.user.id, now);
  await db.query(`insert into follows (follower_id, followee_id, created_at) values ($1, $2, $3) on conflict do nothing`, [
    r.user.id,
    userId,
    now,
  ]);
  return true;
}

export async function isFollowing(db: Db, followerId: string | undefined, userId: string) {
  if (!followerId) return false;
  return Boolean(await one(db, `select 1 from follows where follower_id = $1 and followee_id = $2`, [followerId, userId]));
}

export type FavoriteTarget = { type: "service" | "portfolio"; id: string };

/** Saving something requires being able to see it, so a hidden or blocked item cannot be saved. */
export async function favorite(db: Db, r: Rights, target: FavoriteTarget, on: boolean, now = new Date()) {
  assertActive(r);
  const column = target.type === "service" ? "service_id" : "portfolio_id";
  if (!on) {
    await db.query(`delete from favorites where user_id = $1 and ${column}::text = $2`, [r.user.id, target.id]);
    return false;
  }
  const visible = target.type === "service" ? await getService(db, target.id, r.user.id) : await getPortfolioItem(db, target.id, r.user.id);
  if (!visible) throw new UserError("Dit kun je niet bewaren.");
  await limit(db, "follows", r.user.id, now);
  await db.query(`insert into favorites (user_id, ${column}, created_at) values ($1, $2, $3) on conflict do nothing`, [
    r.user.id,
    target.id,
    now,
  ]);
  return true;
}

/** Which of these ids the viewer saved; used to render the bookmark state in lists. */
export async function savedIds(db: Db, userId: string | undefined) {
  if (!userId) return new Set<string>();
  const rows = await db.query<{ id: string }>(`select coalesce(service_id, portfolio_id)::text as id from favorites where user_id = $1`, [
    userId,
  ]);
  return new Set(rows.map((r) => r.id));
}

export async function followingIds(db: Db, userId: string | undefined) {
  if (!userId) return new Set<string>();
  const rows = await db.query<{ id: string }>(`select followee_id::text as id from follows where follower_id = $1`, [userId]);
  return new Set(rows.map((r) => r.id));
}
