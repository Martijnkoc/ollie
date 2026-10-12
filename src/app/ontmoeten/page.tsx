import type { Metadata } from "next";
import { connection } from "next/server";
import { signUpAction } from "@/app/actions/community";
import { MemberForm } from "@/components/forms/MemberForm";
import { DATE_MINUTES, LAUNCH_REGIONS, REGIONS, SLOTS, label } from "@/lib/config";
import { listEvenings } from "@/lib/community";
import { getDb } from "@/lib/db";
import { formatMoment } from "@/lib/time";

export const metadata: Metadata = { title: "Iemand ontmoeten" };

export default async function MeetPage(props: PageProps<"/ontmoeten">) {
  await connection();
  const query = await props.searchParams;
  const fromDate = query.van === "date";
  const name = typeof query.naam === "string" ? query.naam.slice(0, 40) : undefined;
  const evenings = await listEvenings(await getDb(), { from: new Date(), status: "open" });
  const launchLabel = LAUNCH_REGIONS.map((r) => label(REGIONS, r)).join(", ");
  const slotText = SLOTS.map((s) => s.label.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " en $1");

  return (
    <div className="container narrow section stack-lg">
      <div className="stack">
        <p className="eyebrow">Ik wil iemand ontmoeten</p>
        <h1>{fromDate && name ? `Leuk dat je er weer bent, ${name}` : "Een kennismaking op een vast moment"}</h1>
        <p className="muted">
          Geen eindeloos swipen of berichten bijhouden. Jij geeft aan wanneer je tijd hebt, wij stellen je voor aan iemand die
          bij je past. {DATE_MINUTES} minuten video, en daarna kiest ieder privé of die verder wil.
        </p>
      </div>

      <ol className="steps">
        <li>
          <strong>Aanmelden</strong>
          <span className="muted">Een paar voorkeuren, meer niet.</span>
        </li>
        <li>
          <strong>Voorstel</strong>
          <span className="muted">We kijken naar wederzijdse voorkeuren, regio en wat je zoekt.</span>
        </li>
        <li>
          <strong>Allebei ja</strong>
          <span className="muted">Pas als jullie allebei accepteren, staat de date.</span>
        </li>
        <li>
          <strong>Kennismaken</strong>
          <span className="muted">{DATE_MINUTES} minuten video op de afgesproken avond.</span>
        </li>
      </ol>

      <div className="notice accent">
        We beginnen in <strong>{launchLabel}</strong> op {slotText}. Een kennismakingsavond gaat pas open als er genoeg mensen
        zijn die bij elkaar passen. Zo zit je nooit in een lege zaal.
      </div>

      {evenings.length > 0 && (
        <div className="card flat">
          <h2>Komende kennismakingsavonden</h2>
          <ul>
            {evenings.map((e) => (
              <li key={e.id}>
                {formatMoment(e.starts_at)} · {label(REGIONS, e.region)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <MemberForm mode="signup" action={signUpAction} defaults={{ firstName: name }} source={fromDate ? "date" : undefined} launchLabel={launchLabel} />
      <p className="muted small">
        Meedoen is gratis tijdens de proefperiode. Je profiel is alleen zichtbaar voor de mensen aan wie we je voorstellen;
        er is geen openbare lijst of feed.
      </p>
    </div>
  );
}
