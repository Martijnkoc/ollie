import type { Metadata } from "next";
import { LostLinkForm } from "@/components/forms/SmallForms";

export const metadata: Metadata = { title: "Link kwijt" };

export default function LostLinkPage() {
  return (
    <div className="container narrow section stack-lg">
      <div>
        <h1>Link kwijt?</h1>
        <p className="muted">
          Je komt bij je uitnodiging, videodate of profiel via een persoonlijke link. Vul je e-mailadres in, dan sturen we je
          links opnieuw.
        </p>
      </div>
      <LostLinkForm />
      <p className="muted small">
        Gaf je bij een uitnodiging geen e-mailadres op? Open dan de uitnodigingslink opnieuw op hetzelfde apparaat; dan kom je
        vanzelf bij je videodate.
      </p>
    </div>
  );
}
