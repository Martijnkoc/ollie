import type { Metadata } from "next";
import { CompanyField, DraftBanner } from "@/components/Legal";
import { BRAND } from "@/config/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="container section-tight legal">
      <DraftBanner checklist={["Contactgegevens invullen in src/config/site.ts (COMPANY)", "Reactietermijn voor vragen en verzoeken bepalen"]} />
      <h1>Contact</h1>
      <p>Vragen over {BRAND.name}, je betaling of je gegevens?</p>
      <dl className="dl">
        <dt>E-mail</dt>
        <dd>
          <CompanyField field="email" label="e-mailadres" />
        </dd>
        <dt>Bedrijf</dt>
        <dd>
          <CompanyField field="legalName" label="bedrijfsnaam" />
        </dd>
        <dt>Adres</dt>
        <dd>
          <CompanyField field="address" label="adres" />
        </dd>
        <dt>KvK</dt>
        <dd>
          <CompanyField field="kvkNumber" label="KvK-nummer" />
        </dd>
      </dl>
      <p className="small muted" style={{ marginTop: 20 }}>
        Noem bij vragen over een betaling je betaalreferentie (begint met ord_). Je plattegrond hebben wij niet; die staat alleen op je eigen apparaat.
      </p>
    </div>
  );
}
