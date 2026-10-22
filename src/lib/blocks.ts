import { type Db, one } from "./db";
import { UserError } from "./errors";

export async function blockedEitherWay(db: Db, a: string, b: string) {
  const row = await one(db, `select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`, [
    a,
    b,
  ]);
  return Boolean(row);
}

export async function assertNotBlocked(db: Db, a: string, b: string) {
  if (await blockedEitherWay(db, a, b)) throw new UserError("Dit is niet mogelijk met deze persoon.");
}

/**
 * Blocking hides both people from each other, stops messages and follows in both directions and ends
 * requests and quotes between them that have not been paid. A paid order keeps running so money is never
 * stuck: it can still be delivered, completed, cancelled with a refund or brought to a moderator.
 */
export async function block(db: Db, blockerId: string, blockedId: string, now = new Date()) {
  if (blockerId === blockedId) throw new UserError("Je kunt jezelf niet blokkeren.");
  await db.transaction(async (tx) => {
    await tx.query(`insert into blocks (blocker_id, blocked_id, created_at) values ($1, $2, $3) on conflict do nothing`, [
      blockerId,
      blockedId,
      now,
    ]);
    await tx.query(`delete from follows where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)`, [
      blockerId,
      blockedId,
    ]);
    const open = await tx.query<{ id: string }>(
      `update orders set status = 'cancelled', cancelled_at = $3, cancelled_by = $1, cancel_reason = 'Geblokkeerd', updated_at = $3
       where status in ('requested', 'quoted', 'awaiting_payment') and payment_status = 'none'
         and ((buyer_id = $1 and seller_id = $2) or (buyer_id = $2 and seller_id = $1))
       returning id`,
      [blockerId, blockedId, now],
    );
    for (const o of open) {
      await tx.query(`update quotes set status = 'withdrawn', responded_at = $2 where order_id = $1 and status = 'open'`, [o.id, now]);
      await tx.query(`insert into order_events (order_id, actor_id, kind, created_at) values ($1, null, 'cancelled_block', $2)`, [
        o.id,
        now,
      ]);
    }
  });
}

export async function unblock(db: Db, blockerId: string, blockedId: string) {
  await db.query(`delete from blocks where blocker_id = $1 and blocked_id = $2`, [blockerId, blockedId]);
}

/** Everyone the user should not see: people they blocked and people who blocked them. */
export async function hiddenUsers(db: Db, userId: string) {
  const rows = await db.query<{ id: string }>(
    `select blocked_id as id from blocks where blocker_id = $1 union select blocker_id as id from blocks where blocked_id = $1`,
    [userId],
  );
  return rows.map((r) => r.id);
}
