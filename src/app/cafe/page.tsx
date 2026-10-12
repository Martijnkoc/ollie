import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "@/components/forms/SmallForms";
import { CAFE, DATE_MINUTES } from "@/lib/config";

export const metadata: Metadata = {
  title: "Cafe",
  description: "Een ontmoetingsplek: binnenlopen, praten en elkaar uitnodigen voor een videodate van twintig minuten.",
};

const rooms = [
  { title: "De lounge", text: "Een gezamenlijke chat waar je laagdrempelig aansluit en eerst wat sfeer proeft." },
  { title: "Tafels", text: "Kleinere gesprekken rond je regio, leeftijdsgroep of interesses." },
  { title: "Privégesprekken", text: "Iemand nodigt je uit; jij kiest of je accepteert." },
  { title: "“Even samen zitten?”", text: "Vanuit de chat stuur je een videolink, voor nu of voor een afgesproken moment." },
  { title: `Na ${DATE_MINUTES} minuten`, text: "De videoruimte sluit en ieder kiest privé of die verder wil kennismaken." },
];

export default function CafePage() {
  return (
    <div className="container section stack-lg">
      <div className="stack" style={{ maxWidth: 680 }}>
        <p className="eyebrow">{CAFE.open ? "Nu open" : "Binnenkort"}</p>
        <h1>Cafe</h1>
        <p className="lead muted" style={{ fontSize: "1.2rem" }}>
          Een ontmoetingsplek zoals een echt café: je komt binnen, praat met mensen en nodigt elkaar uit voor een besloten
          videodate van {DATE_MINUTES} minuten. Zo proef je eerst de sfeer, voordat je tijd vrijmaakt voor een date in het
          echt.
        </p>
        <p className="moment" style={{ fontSize: "1.3rem" }}>
          &lsquo;Vanavond heb ik even tijd. Wie zit er in Cafe?&rsquo;
        </p>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {rooms.map((r) => (
          <div key={r.title} className="card flat">
            <h3>{r.title}</h3>
            <p className="muted">{r.text}</p>
          </div>
        ))}
      </div>

      <section className="stack">
        <h2>Toegang</h2>
        <div className="grid-2">
          <div className="card stack">
            <h3>Cafe-lidmaatschap</h3>
            <p className="price">
              {CAFE.priceLabel} <small>per maand</small>
            </p>
            <ul className="checks">
              <li>De community: lounge, tafels en privégesprekken</li>
              <li>{CAFE.datesPerMonth} videodates van {DATE_MINUTES} minuten per maand</li>
              <li>Ook voor matches van andere apps, via een uitnodigingslink</li>
              <li>Maandelijks opzegbaar</li>
            </ul>
          </div>
          <div className="card stack">
            <h3>Uitgenodigde gast</h3>
            <p className="price">Gratis</p>
            <ul className="checks">
              <li>Toegang tot de afgesproken videodate</li>
              <li>Geen account, download of betaalgegevens</li>
              <li>Voor de community is een eigen lidmaatschap nodig</li>
            </ul>
          </div>
        </div>
        <p className="muted small">
          Blokkeren, melden en controle over het delen van je contactgegevens horen er altijd standaard bij.
        </p>
      </section>

      <div className="grid-2">
        <div className="stack">
          <h2>Waarom nog niet open?</h2>
          <p className="muted">
            Bij binnenkomst moet je daadwerkelijk iemand kunnen ontmoeten. Daarom openen we Cafe pas als de eerste groep groot
            genoeg is. Tot die tijd verzamelen we aanmeldingen en organiseren we proefavonden.
          </p>
          <p className="muted">
            Wil je nu al iemand leren kennen? <Link href="/ontmoeten">Meld je aan voor een kennismakingsavond</Link>, of{" "}
            <Link href="/uitnodigen">nodig je match uit</Link>.
          </p>
        </div>
        <div className="card">
          <h3>Laat me weten wanneer Cafe opengaat</h3>
          <WaitlistForm />
        </div>
      </div>
    </div>
  );
}
