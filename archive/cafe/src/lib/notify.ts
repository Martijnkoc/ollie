import "server-only";
import { DATE_MINUTES, LOBBY_MINUTES } from "./config";
import { getDb, one } from "./db";
import { outcomeFor } from "./feedback";
import { sendMail } from "./mail";
import { formatMoment } from "./time";
import { baseUrl } from "./url";

// E-mails only ever link to pages that require logging in; they never carry access tokens.

async function emailOf(userId: string | null) {
  if (!userId) return undefined;
  return (await one<{ email: string }>(await getDb(), `select email from users where id = $1`, [userId]))?.email;
}

export async function inviteAccepted(organizerId: string, guestName: string, moment: Date) {
  const to = await emailOf(organizerId);
  if (!to) return;
  await sendMail({
    to,
    subject: `${guestName} heeft je uitnodiging aangenomen`,
    text: `${guestName} heeft gekozen voor ${formatMoment(moment)}.\nBevestig in Cafe dat dit je match is; pas dan staat de videodate vast:\n${await baseUrl()}/afspraken`,
  });
}

async function participants(dateId: string) {
  const db = await getDb();
  const date = await one<{ scheduled_at: Date; proposed_by: string | null }>(
    db,
    `select scheduled_at, proposed_by from dates where id = $1`,
    [dateId],
  );
  const people = await db.query<{ user_id: string | null; display_name: string }>(
    `select user_id, display_name from date_participants where date_id = $1`,
    [dateId],
  );
  return { date, people };
}

export async function dateScheduled(dateId: string) {
  const { date, people } = await participants(dateId);
  if (!date) return;
  const base = await baseUrl();
  for (const p of people) {
    const to = await emailOf(p.user_id);
    const other = people.find((x) => x !== p)?.display_name ?? "je match";
    if (!to) continue;
    await sendMail({
      to,
      subject: `Videodate met ${other}: ${formatMoment(date.scheduled_at)}`,
      text: `Je videodate met ${other} staat vast: ${formatMoment(date.scheduled_at)}.\nDe lobby gaat ${LOBBY_MINUTES} minuten van tevoren open. De ${DATE_MINUTES} minuten beginnen zodra jullie er allebei zijn.\n${base}/afspraken/${dateId}`,
    });
  }
}

export async function proposalReceived(dateId: string) {
  const { date, people } = await participants(dateId);
  if (!date) return;
  const proposer = people.find((p) => p.user_id === date.proposed_by);
  const recipient = people.find((p) => p.user_id !== date.proposed_by);
  const to = await emailOf(recipient?.user_id ?? null);
  if (!to) return;
  await sendMail({
    to,
    subject: `${proposer?.display_name ?? "Iemand"} stelt een videodate voor`,
    text: `${proposer?.display_name ?? "Iemand"} wil graag ${formatMoment(date.scheduled_at)} twintig minuten met je videobellen.\nAccepteer of wijs af:\n${await baseUrl()}/afspraken/${dateId}`,
  });
}

export async function dateCancelled(userId: string, byName: string, when: Date) {
  const to = await emailOf(userId);
  if (!to) return;
  await sendMail({
    to,
    subject: "Je videodate gaat niet door",
    text: `${byName} heeft de videodate van ${formatMoment(when)} afgezegd. Jammer, maar zo weet je het op tijd.`,
  });
}

/** Mail both only when the interest is mutual. One-sided interest is never announced. */
export async function mutualIfAny(dateId: string) {
  const db = await getDb();
  const { people } = await participants(dateId);
  const first = people.find((p) => p.user_id);
  if (!first?.user_id || (await outcomeFor(db, first.user_id, dateId)).state !== "mutual") return;
  const base = await baseUrl();
  for (const p of people) {
    const to = await emailOf(p.user_id);
    if (!to) continue;
    await sendMail({
      to,
      subject: "Jullie willen allebei verder",
      text: `Goed nieuws: na jullie videodate willen jullie elkaar allebei verder leren kennen.\nWat je deelt, kies je zelf per gegeven:\n${base}/afspraken/${dateId}`,
    });
  }
}
