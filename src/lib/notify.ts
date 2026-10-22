import "server-only";
import { getDb, one } from "./db";
import { sendMail } from "./mail";
import { formatEuro } from "./money";
import { baseUrl } from "./url";

// E-mails only link to pages that require logging in; they never carry access tokens or message content.

type OrderInfo = { ref: number; title: string; buyer_id: string | null; seller_id: string | null; price_cents: number | null };

async function info(orderId: string) {
  const db = await getDb();
  const o = await one<OrderInfo & { buyer_email: string | null; seller_email: string | null; buyer_name: string; seller_name: string }>(
    db,
    `select o.ref::int as ref, o.title, o.buyer_id, o.seller_id, o.price_cents, bu.email as buyer_email, su.email as seller_email,
       coalesce(bp.display_name, 'De koper') as buyer_name, coalesce(sp.display_name, 'De maker') as seller_name
     from orders o left join users bu on bu.id = o.buyer_id left join users su on su.id = o.seller_id
     left join profiles bp on bp.user_id = o.buyer_id left join profiles sp on sp.user_id = o.seller_id where o.id = $1`,
    [orderId],
  );
  return o;
}

const TEXT: Record<
  string,
  { to: "buyer" | "seller" | "both"; subject: (o: OrderInfo & { buyer_name: string; seller_name: string }) => string; body: string }
> = {
  ordered: {
    to: "seller",
    subject: (o) => `Nieuwe bestelling: ${o.title}`,
    body: "Er is een bestelling geplaatst. Zodra de betaling binnen is, kun je beginnen.",
  },
  requested: {
    to: "seller",
    subject: (o) => `${o.buyer_name} vraagt een offerte: ${o.title}`,
    body: "Je hebt een nieuwe aanvraag voor maatwerk. Stel vragen of stuur een offerte.",
  },
  quoted: {
    to: "buyer",
    subject: (o) => `Offerte van ${o.seller_name}: ${o.title}`,
    body: "Je hebt een offerte ontvangen. Bekijk de prijs en de levertijd en beslis of je akkoord gaat.",
  },
  quote_accepted: {
    to: "seller",
    subject: (o) => `Offerte geaccepteerd: ${o.title}`,
    body: "Je offerte is geaccepteerd. Zodra de betaling binnen is, kun je beginnen.",
  },
  paid: {
    to: "both",
    subject: (o) => `Betaling ontvangen voor SY-${o.ref}`,
    body: "De betaling is binnen. De opdracht staat op 'in uitvoering'.",
  },
  delivered: {
    to: "buyer",
    subject: (o) => `Opgeleverd: ${o.title}`,
    body: "De maker heeft de opdracht opgeleverd. Bekijk het resultaat en rond af, of vraag om aanpassingen.",
  },
  changes_requested: {
    to: "seller",
    subject: (o) => `Aanpassingen gevraagd: ${o.title}`,
    body: "De koper vraagt om aanpassingen. Lees de toelichting bij de opdracht.",
  },
  completed: {
    to: "seller",
    subject: (o) => `Afgerond: ${o.title}`,
    body: "De koper heeft de opdracht afgerond. De uitbetaling wordt klaargezet.",
  },
  declined: {
    to: "buyer",
    subject: (o) => `Niet aangenomen: ${o.title}`,
    body: "De maker kan deze opdracht helaas niet aannemen. Er is niets betaald.",
  },
  withdrawn: { to: "seller", subject: (o) => `Ingetrokken: ${o.title}`, body: "De koper heeft de aanvraag ingetrokken." },
  cancel_requested: {
    to: "seller",
    subject: (o) => `Verzoek om te annuleren: ${o.title}`,
    body: "De koper wil de opdracht annuleren. Ga akkoord (de koper krijgt het bedrag terug) of reageer via een bericht.",
  },
  refunded: {
    to: "both",
    subject: (o) => `Geannuleerd en terugbetaald: SY-${o.ref}`,
    body: "De opdracht is geannuleerd. Het volledige bedrag gaat terug naar de koper.",
  },
  disputed: {
    to: "both",
    subject: (o) => `Klacht over SY-${o.ref}`,
    body: "Er is een klacht ingediend. Een moderator bekijkt de opdracht en jullie berichten en neemt een besluit.",
  },
};

export async function orderMail(orderId: string, kind: keyof typeof TEXT | string) {
  const t = TEXT[kind];
  if (!t) return;
  const o = await info(orderId);
  if (!o) return;
  const link = `${await baseUrl()}/opdrachten/${orderId}`;
  const recipients = [t.to !== "seller" ? o.buyer_email : null, t.to !== "buyer" ? o.seller_email : null].filter(Boolean) as string[];
  const amount = o.price_cents ? `\nBedrag: ${formatEuro(o.price_cents)}` : "";
  for (const to of recipients) {
    await sendMail({ to, subject: t.subject(o), text: `${t.body}\n\nOpdracht SY-${o.ref}: ${o.title}${amount}\n${link}` });
  }
}

export async function newMessageMail(toUserId: string, fromName: string, threadId: string) {
  const db = await getDb();
  const u = await one<{ email: string }>(db, `select email from users where id = $1`, [toUserId]);
  if (!u) return;
  await sendMail({
    to: u.email,
    subject: `Nieuw bericht van ${fromName}`,
    text: `${fromName} heeft je een bericht gestuurd.\nLees en beantwoord het hier:\n${await baseUrl()}/berichten/${threadId}`,
  });
}
