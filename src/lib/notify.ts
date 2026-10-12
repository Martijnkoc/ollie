import { DATE_MINUTES, LOBBY_MINUTES } from "./config";
import { sendMail } from "./mail";
import { formatMoment } from "./time";
import { baseUrl, paths } from "./url";

const dateLines = (startsAt: Date) =>
  `Wanneer: ${formatMoment(startsAt)} (${DATE_MINUTES} minuten).\nDe videoruimte gaat ${LOBBY_MINUTES} minuten van tevoren open en sluit daarna vanzelf.`;

export async function inviteCreated(to: string, name: string, hostToken: string, code: string) {
  const base = await baseUrl();
  await sendMail({
    to,
    subject: "Je uitnodiging staat klaar",
    text: `Hoi ${name},\n\nJe uitnodiging voor een videodate staat klaar. Stuur deze link naar je match:\n${base}${paths.invite(code)}\n\nVia jouw persoonlijke link volg je de uitnodiging en kom je straks in de videodate. Deel die link met niemand:\n${base}${paths.manage(hostToken)}`,
  });
}

export async function dateScheduled(people: { email: string | null; name: string; otherName: string; token: string }[], startsAt: Date) {
  const base = await baseUrl();
  for (const p of people) {
    if (!p.email) continue;
    await sendMail({
      to: p.email,
      subject: `Videodate met ${p.otherName}: ${formatMoment(startsAt)}`,
      text: `Hoi ${p.name},\n\nJe videodate met ${p.otherName} staat gepland.\n${dateLines(startsAt)}\n\nJouw persoonlijke link (deel deze met niemand):\n${base}${paths.date(p.token)}\n\nGeen download nodig: de link opent in je browser.`,
    });
  }
}

export async function alternativeProposed(to: string, hostName: string, guestName: string, startsAt: Date, hostToken: string) {
  const base = await baseUrl();
  await sendMail({
    to,
    subject: `${guestName} stelt een ander moment voor`,
    text: `Hoi ${hostName},\n\n${guestName} kan niet op de momenten die je voorstelde en stelt ${formatMoment(startsAt)} voor.\nBevestig of kies opnieuw via jouw link:\n${base}${paths.manage(hostToken)}`,
  });
}

export async function dateCancelled(to: string | null, name: string, otherName: string, startsAt: Date) {
  if (!to) return;
  await sendMail({
    to,
    subject: "Je videodate gaat niet door",
    text: `Hoi ${name},\n\n${otherName} heeft de videodate van ${formatMoment(startsAt)} afgezegd. Jammer, maar zo weet je het op tijd.`,
  });
}

export async function mutualInterest(people: { email: string | null; name: string; otherName: string; token: string }[]) {
  const base = await baseUrl();
  for (const p of people) {
    if (!p.email) continue;
    await sendMail({
      to: p.email,
      subject: `Jij en ${p.otherName} willen allebei verder`,
      text: `Hoi ${p.name},\n\nGoed nieuws: jullie willen elkaar allebei verder leren kennen.\nJe contactgegevens blijven verborgen tot je ze zelf deelt. Dat doe je hier:\n${base}${paths.date(p.token)}`,
    });
  }
}

export async function memberLink(to: string, name: string, token: string, isNew: boolean) {
  const base = await baseUrl();
  await sendMail({
    to,
    subject: isNew ? "Welkom! Je aanmelding is binnen" : "Je persoonlijke link",
    text: `Hoi ${name},\n\n${
      isNew
        ? "Fijn dat je meedoet. We stellen je voor aan iemand zodra er een kennismakingsavond is die bij jou past. Je hoeft niets bij te houden: wij melden ons."
        : "Hier is je persoonlijke link."
    }\n\nVia deze link bekijk je voorstellen en pas je je voorkeuren aan (deel hem met niemand):\n${base}${paths.profile(token)}`,
  });
}

export async function proposalCreated(to: string, name: string, otherName: string, startsAt: Date, token: string) {
  const base = await baseUrl();
  await sendMail({
    to,
    subject: `Kennismaking op ${formatMoment(startsAt)}?`,
    text: `Hoi ${name},\n\nWe denken dat jij en ${otherName} het leuk kunnen hebben. Zin in twintig minuten videodate op ${formatMoment(startsAt)}?\n\nBekijk het voorstel en geef aan of je meedoet:\n${base}${paths.profile(token)}\n\nAlleen als jullie allebei ja zeggen, gaat het door.`,
  });
}
