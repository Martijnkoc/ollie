import { type Membership, membershipActive } from "../access";
import { MEMBERSHIP } from "../config";
import { type Db, one } from "../db";
import { UserError } from "../errors";

/**
 * Credit rules (V1):
 * - The organiser pays: whoever created the invite or proposed the videodate. The other person never pays.
 * - A credit is RESERVED when the appointment is confirmed by both sides, against the
 *   organiser's current billing period. It counts towards the quota from that moment.
 * - It is CONSUMED when the conversation actually starts (both present).
 * - It is RELEASED when the appointment is cancelled, declined, a no-show, or the provider fails before the start.
 * Every transition is a conditional update, so retries and repeated events never count twice.
 */
export async function creditSummary(db: Db, userId: string, now = new Date()) {
  const m = await one<Membership>(db, `select * from memberships where user_id = $1`, [userId]);
  const quota = MEMBERSHIP.datesPerPeriod;
  if (!membershipActive(m, now) || !m?.current_period_start) {
    return { active: false, quota, used: 0, available: 0, periodEnd: null as Date | null };
  }
  const row = await one<{ n: number }>(
    db,
    `select count(*)::int as n from dates where organizer_id = $1 and credit_period_start = $2 and credit_status in ('reserved', 'consumed')`,
    [userId, m.current_period_start],
  );
  const used = row?.n ?? 0;
  return { active: true, quota, used, available: Math.max(0, quota - used), periodEnd: m.current_period_end };
}

/** Must run inside the transaction that confirms the appointment. */
export async function reserveCredit(tx: Db, dateId: string, organizerId: string, now = new Date()) {
  // Lock the membership row so two confirmations cannot both take the last credit.
  const m = await one<Membership>(tx, `select * from memberships where user_id = $1 for update`, [organizerId]);
  if (!membershipActive(m, now) || !m?.current_period_start) {
    throw new UserError("Het lidmaatschap van de organisator is niet actief, dus deze videodate kan niet worden ingepland.");
  }
  const used = await one<{ n: number }>(
    tx,
    `select count(*)::int as n from dates where organizer_id = $1 and credit_period_start = $2 and credit_status in ('reserved', 'consumed')`,
    [organizerId, m.current_period_start],
  );
  if ((used?.n ?? 0) >= MEMBERSHIP.datesPerPeriod) {
    throw new UserError(`De ${MEMBERSHIP.datesPerPeriod} videodates van deze periode zijn al gebruikt.`);
  }
  await tx.query(`update dates set credit_status = 'reserved', credit_period_start = $2 where id = $1 and credit_status = 'none'`, [
    dateId,
    m.current_period_start,
  ]);
}

export async function consumeCredit(tx: Db, dateId: string) {
  await tx.query(`update dates set credit_status = 'consumed' where id = $1 and credit_status = 'reserved'`, [dateId]);
}

export async function releaseCredit(tx: Db, dateId: string) {
  await tx.query(`update dates set credit_status = 'released' where id = $1 and credit_status = 'reserved'`, [dateId]);
}
