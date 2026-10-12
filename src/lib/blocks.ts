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
 * Blocking stops new requests, messages, invitations and proposals in both directions,
 * cancels appointments between the two that have not started and releases their credits.
 */
export async function block(db: Db, blockerId: string, blockedId: string, now = new Date()) {
  if (blockerId === blockedId) throw new UserError("Je kunt jezelf niet blokkeren.");
  await db.transaction(async (tx) => {
    await tx.query(`insert into blocks (blocker_id, blocked_id, created_at) values ($1, $2, $3) on conflict do nothing`, [
      blockerId,
      blockedId,
      now,
    ]);
    await tx.query(
      `update contact_requests set status = 'declined', responded_at = $3
       where status = 'pending' and ((from_id = $1 and to_id = $2) or (from_id = $2 and to_id = $1))`,
      [blockerId, blockedId, now],
    );
    const shared = await tx.query<{ id: string }>(
      `select d.id from dates d
       where d.status in ('proposed', 'scheduled')
         and exists (select 1 from date_participants p where p.date_id = d.id and p.user_id = $1)
         and exists (select 1 from date_participants p where p.date_id = d.id and p.user_id = $2)`,
      [blockerId, blockedId],
    );
    for (const d of shared) {
      await tx.query(
        `update dates set status = case when status = 'proposed' then 'declined' else 'cancelled' end, cancelled_by = $2,
           credit_status = case when credit_status = 'reserved' then 'released' else credit_status end
         where id = $1`,
        [d.id, blockerId],
      );
    }
    await tx.query(
      `update invites set status = 'cancelled' where status in ('open', 'accepted')
       and ((organizer_id = $1 and guest_id = $2) or (organizer_id = $2 and guest_id = $1))`,
      [blockerId, blockedId],
    );
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
