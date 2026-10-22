import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Contact" };

export default function Contact() {
  const email = process.env.CONTACT_EMAIL;
  return (
    <div className="container narrow page legal">
      <p className="eyebrow">Contact</p>
      <h1>We horen het graag</h1>
      <p className="lead">Vragen over een opdracht stel je het snelst aan de maker of koper, via berichten bij de opdracht.</p>
      <h2>Contact met Sell Yourself</h2>
      {email ? (
        <p>
          Mail ons op <a href={`mailto:${email}`}>{email}</a>. We reageren op werkdagen.
        </p>
      ) : (
        <p className="notice warn">Het contactadres is nog niet ingesteld (CONTACT_EMAIL). Dit vullen we in vóór de lancering.</p>
      )}
      <h2 id="misbruik">Misbruik melden</h2>
      <p>
        Zie je iets dat niet klopt? Gebruik &lsquo;Melden&rsquo; bij een profiel, dienst, werk, review, bericht of opdracht. Een moderator
        bekijkt elke melding. Je kunt iemand ook direct blokkeren. Bij een acute dreiging: bel 112.
      </p>
      <h2>Een probleem met een opdracht</h2>
      <p>
        Dien bij de opdracht een klacht in. Lees hoe dat werkt op <Link href="/hoe-het-werkt#klachten">hoe het werkt</Link>.
      </p>
    </div>
  );
}
