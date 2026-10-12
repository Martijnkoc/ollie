import { settleAndClose } from "./dates/core";
import { type Db } from "./db";
import { videoProvider } from "./video/provider";

/** Periodic housekeeping: time-based date transitions, closing rooms, and retention limits. */
export async function sweep(db: Db, now = new Date()) {
  const due = await db.query<{ id: string }>(
    `select id from dates where (status = 'scheduled' and scheduled_at < $1 - interval '15 minutes')
       or (status = 'live' and ends_at <= $1)
       or (status = 'proposed' and scheduled_at < $1)
       or (status in ('ended', 'cancelled', 'declined', 'no_show', 'failed') and video_room is not null and room_closed_at is null)
     limit 200`,
    [now],
  );
  const provider = videoProvider();
  for (const d of due) await settleAndClose(db, d.id, provider, now);
  await db.query(`delete from login_codes where created_at < $1 - interval '1 day'`, [now]);
  await db.query(`delete from sessions where expires_at < $1`, [now]);
  await db.query(`delete from rate_events where created_at < $1 - interval '2 days'`, [now]);
  await db.query(`delete from mail_outbox where created_at < $1 - interval '7 days'`, [now]);
  // Retention: confidential feedback and shared contact details are kept for twelve months.
  await db.query(`delete from feedback where created_at < $1 - interval '12 months'`, [now]);
  await db.query(`delete from contact_shares where shared_at < $1 - interval '12 months'`, [now]);
  return { settled: due.length };
}
