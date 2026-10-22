import { type Db } from "./db";
import { autoTransitions } from "./orders";
import { releaseFunds } from "./payments";
import { deleteOrphans } from "./storage";

/** Daily housekeeping: time-based order transitions, payouts that still have to go out, and retention. */
export async function sweep(db: Db, now = new Date()) {
  const orders = await autoTransitions(db, now);
  const payouts = await db.query<{ id: string }>(
    `select id from orders where status = 'completed' and payment_status = 'paid' and transfer_status in ('pending', 'failed') limit 100`,
  );
  let sent = 0;
  for (const p of payouts) if ((await releaseFunds(db, p.id, now)) === "sent") sent++;
  const media = await deleteOrphans(db, now);
  await db.query(`delete from login_codes where created_at < $1::timestamptz - interval '1 day'`, [now]);
  await db.query(`delete from sessions where expires_at < $1`, [now]);
  await db.query(`delete from rate_events where created_at < $1::timestamptz - interval '2 days'`, [now]);
  await db.query(`delete from mail_outbox where created_at < $1::timestamptz - interval '7 days'`, [now]);
  await db.query(`delete from stripe_events where received_at < $1::timestamptz - interval '90 days'`, [now]);
  return { ...orders, payoutsSent: sent, payoutsWaiting: payouts.length - sent, mediaRemoved: media };
}
