import { type Db, one } from "./db";
import { UserError } from "./errors";
import { removeObjects } from "./storage";

/**
 * Deletion policy: the account, profile, services, portfolio, uploaded files, follows, favourites and
 * messages go. Orders stay for the other party's records and bookkeeping, without a link to this person;
 * reviews they wrote stay without their name. While an order is paid but not finished, deleting waits,
 * so nobody loses money or a delivery.
 */
export async function deleteAccount(db: Db, userId: string, now = new Date()) {
  const running = await one<{ n: number }>(
    db,
    `select count(*)::int as n from orders where (buyer_id = $1 or seller_id = $1) and status in ('in_progress', 'delivered', 'disputed')`,
    [userId],
  );
  if ((running?.n ?? 0) > 0) {
    throw new UserError(
      "Je hebt nog lopende, betaalde opdrachten. Rond die eerst af of annuleer ze; daarna kun je je account verwijderen.",
    );
  }
  const keys = await db.transaction(async (tx) => {
    const open = await tx.query<{ id: string }>(
      `update orders set status = case when seller_id = $1 then 'declined' else 'withdrawn' end, cancelled_at = $2,
         cancel_reason = 'Account verwijderd', updated_at = $2
       where (buyer_id = $1 or seller_id = $1) and status in ('requested', 'quoted', 'awaiting_payment') returning id`,
      [userId, now],
    );
    for (const o of open) await tx.query(`update quotes set status = 'withdrawn' where order_id = $1 and status = 'open'`, [o.id]);
    const media = await tx.query<{ storage_key: string }>(`select storage_key from media where owner_id = $1`, [userId]);
    await tx.query(`delete from users where id = $1`, [userId]);
    return media.map((m) => m.storage_key);
  });
  await removeObjects(keys);
}
