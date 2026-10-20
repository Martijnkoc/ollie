import Link from "next/link";
import { PRICE } from "@/config/site";

/**
 * Free versus the complete report, side by side. Only what really works is listed; what the report does not do
 * is said too, so nobody pays for something it cannot deliver.
 */
export const FREE_FEATURES = [
  "Adres met officiële gegevens uit de BAG (bouwjaar, gebruiksoppervlakte)",
  "Plattegrond uitlezen: kamers opgemeten langs de wanden, jij controleert",
  "Vloeroppervlakte per ruimte en totaal, met je eigen selectie",
  "Vloerhoeveelheid met snijverlies en hele pakken",
  "Verfcalculator voor je muren",
  "Ramen scannen met je telefoon (status zichtbaar, maten in het rapport)",
];

export const PAID_FEATURES = [
  "Plinten per wand, met deuren, obstakels en marge",
  "Laminaat, PVC, tegels, ondervloer, profielen, primer en behang, met status per categorie",
  "Raamregister: per raam de gemeten opening in mm, met foutmarge, bron en status",
  "Bestelmaat raamdecoratie waar de meetregel van de leverancier gecontroleerd is",
  "PDF-rapport met bestellijst, aannames en bronnen, plus CSV",
];

export const PAID_NOT = [
  "Geen bestelmaat uit een niet-gecontroleerde leveranciersregel of een niet-gevalideerde scan: dan staat er waarom niet.",
  "Geen garantie dat een bestelling past; controleer kritieke maten in de woning.",
];

export function PricingBlock() {
  return (
    <div className="pricing">
      <article className="plan-card" aria-labelledby="plan-gratis">
        <p className="plan-name" id="plan-gratis">
          Gratis
        </p>
        <div className="plan-price">
          € 0<small>altijd</small>
        </div>
        <ul className="ticks">
          {FREE_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <Link href="/project/nieuw" className="btn" style={{ marginTop: "auto" }}>
          Gratis beginnen
        </Link>
      </article>
      <article className="plan-card featured framed" aria-labelledby="plan-compleet">
        <p className="plan-name" id="plan-compleet">
          Compleet woningrapport
        </p>
        <div className="plan-price">
          {PRICE.label}
          <small>{PRICE.period} · per woning · geen abonnement</small>
        </div>
        <p className="small" style={{ margin: 0 }}>
          Alles van gratis, plus:
        </p>
        <ul className="ticks">
          {PAID_FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <div className="plan-not">
          <strong>Wat het rapport niet doet</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {PAID_NOT.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <Link href="/project/nieuw" className="btn btn-primary" style={{ marginTop: "auto" }}>
          Breng mijn woning in kaart
        </Link>
        <p className="tiny muted" style={{ margin: 0 }}>
          {PRICE.vatNote}
          {PRICE.vatNoteVerified ? "" : " (concept: de btw-behandeling wordt vóór de lancering bevestigd)"} Betalen met iDEAL en andere
          methoden via Mollie. Je betaalt pas als je het rapport wilt.
        </p>
      </article>
    </div>
  );
}
