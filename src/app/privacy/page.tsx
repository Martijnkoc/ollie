import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <div className="container narrow page legal">
      <p className="eyebrow">Privacy</p>
      <h1>Privacyverklaring</h1>
      <p className="notice warn">
        Concept. Vóór de lancering vullen we de gegevens van de verwerkingsverantwoordelijke aan en laten we deze tekst toetsen.
      </p>
      <h2>Wat we bewaren</h2>
      <ul>
        <li>Je e-mailadres, om in te loggen en je te informeren over je opdrachten. Anderen zien het nooit.</li>
        <li>Je profiel, werk en diensten: wat je zelf openbaar maakt, is openbaar.</li>
        <li>
          Berichten, opdrachten, offertes en de tijdlijn van opdrachten, voor jou en de andere partij, en bij een klacht voor een moderator.
        </li>
        <li>Betaalgegevens verwerkt Stripe; wij bewaren alleen verwijzingen (zoals een betalings-id), geen kaart- of bankgegevens.</li>
        <li>Meldingen en moderatiebesluiten, voor de veiligheid van het platform.</li>
      </ul>
      <h2>Met wie we delen</h2>
      <ul>
        <li>Stripe, voor betalingen, uitbetalingen en de wettelijk verplichte identiteitscontrole van verkopers.</li>
        <li>Onze hosting- en opslagpartijen (Vercel, Supabase) en e-maildienst, als verwerkers.</li>
        <li>De andere partij in een opdracht ziet je naam, je bericht en wat je bij de opdracht opgeeft (zoals een locatie).</li>
      </ul>
      <h2>Bewaartermijnen</h2>
      <ul>
        <li>Inlogcodes: één dag. Sessies: tot ze verlopen (30 dagen) of je uitlogt.</li>
        <li>Bestanden die nergens meer gebruikt worden: na één dag verwijderd.</li>
        <li>Opdrachten blijven bewaard zolang de wettelijke bewaarplicht voor de administratie dat vraagt.</li>
      </ul>
      <h2>Je rechten</h2>
      <p>
        Je kunt je gegevens inzien en aanpassen in je dashboard, en je account verwijderen in je{" "}
        <Link href="/account">accountinstellingen</Link>. Wat er dan gebeurt, staat daar precies beschreven. Voor andere verzoeken: zie{" "}
        <Link href="/contact">contact</Link>.
      </p>
      <h2>Cookies</h2>
      <p>We gebruiken alleen een noodzakelijke cookie om je ingelogd te houden. Geen advertentie- of trackingcookies.</p>
    </div>
  );
}
