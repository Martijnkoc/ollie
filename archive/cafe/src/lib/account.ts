import { type Db, one } from "./db";

/**
 * Deletion policy: the account, profile, sessions, messages, feedback and shared contact details go.
 * Appointments that have not started are cancelled (credits released). Past appointments keep only
 * operational metadata without a link to the person. Reports about others stay for moderation, without
 * the reporter's identity.
 */
export async function deleteAccount(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    const m = await one<{ stripe_subscription_id: string | null; status: string }>(
      tx,
      `select stripe_subscription_id, status from memberships where user_id = $1`,
      [userId],
    );
    await tx.query(
      `update dates set status = case when status = 'proposed' then 'declined' else 'cancelled' end,
         credit_status = case when credit_status = 'reserved' then 'released' else credit_status end
       where status in ('proposed', 'scheduled') and id in (select date_id from date_participants where user_id = $1)`,
      [userId],
    );
    await tx.query(`update date_participants set display_name = 'Verwijderd account' where user_id = $1`, [userId]);
    await tx.query(`delete from users where id = $1`, [userId]);
    return m?.stripe_subscription_id && m.status !== "canceled" ? m.stripe_subscription_id : null;
  });
}
