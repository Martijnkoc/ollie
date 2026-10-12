import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProfileAction, respondAction, setVisibleAction, updateProfileAction } from "@/app/actions/community";
import { ActionForm } from "@/components/ActionForm";
import { MemberForm } from "@/components/forms/MemberForm";
import { SubmitButton } from "@/components/SubmitButton";
import { INTENTS, LAUNCH_REGIONS, REGIONS, label } from "@/lib/config";
import { getMemberByToken, inLaunchRegion, memberDates, memberProposals, proposalState } from "@/lib/community";
import { getDb } from "@/lib/db";
import { mailConfigured } from "@/lib/mail";
import { ageOn, formatMoment, formatShort } from "@/lib/time";
import { paths } from "@/lib/url";

export const metadata: Metadata = { title: "Jouw profiel", robots: { index: false } };

export default async function ProfilePage(props: PageProps<"/profiel/[token]">) {
  const { token } = await props.params;
  const query = await props.searchParams;
  const db = await getDb();
  const member = await getMemberByToken(db, token);
  if (!member) notFound();

  const now = new Date();
  const proposals = await memberProposals(db, member.id);
  const active = proposals.filter((p) => ["open", "waiting"].includes(proposalState(p, now)));
  const dates = await memberDates(db, member.id);
  const launchLabel = LAUNCH_REGIONS.map((r) => label(REGIONS, r)).join(", ");

  return (
    <div className="container narrow section stack-lg">
      {query.welkom !== undefined && (
        <div className="notice good">
          <strong>Welkom, {member.first_name}!</strong> Je aanmelding is binnen. Dit is jouw persoonlijke pagina: bewaar de
          link goed.{mailConfigured() ? ` We hebben hem ook naar ${member.email} gestuurd.` : ""}
        </div>
      )}
      {query.opgeslagen !== undefined && <div className="notice good">Je voorkeuren zijn opgeslagen.</div>}

      <div className="stack">
        <p className="eyebrow">Jouw profiel</p>
        <h1>Hoi {member.first_name}</h1>
        {!inLaunchRegion(member.region) ? (
          <p className="notice">
            We zijn nog niet actief in {label(REGIONS, member.region)}. Je staat op de lijst en we laten het je weten zodra we
            daar kennismakingsavonden organiseren.
          </p>
        ) : member.visible ? (
          <p className="muted">
            Je staat aan voor voorstellen. Zodra er een kennismakingsavond is die bij je past, stellen we je voor aan iemand en
            mailen we je.
          </p>
        ) : (
          <p className="notice">Je staat op pauze. We stellen je niet voor aan anderen tot je dit weer aanzet.</p>
        )}
        <ActionForm action={setVisibleAction.bind(null, token, !member.visible)}>
          <SubmitButton className="btn secondary">{member.visible ? "Even pauzeren" : "Weer meedoen"}</SubmitButton>
        </ActionForm>
      </div>

      {active.length > 0 && (
        <section className="stack">
          <h2>Voorstellen</h2>
          {active.map((p) => {
            const state = proposalState(p, now);
            return (
              <div key={p.id} className="card stack">
                <p className="eyebrow">{formatMoment(p.starts_at)}</p>
                <h3 style={{ margin: 0 }}>
                  {p.other_first_name}, {ageOn(p.other_birth_date, now)}
                </h3>
                <p className="muted" style={{ margin: 0 }}>
                  {label(INTENTS, p.other_intent)} · {label(REGIONS, p.other_region)}
                </p>
                {p.other_about && <p style={{ fontFamily: "var(--serif)", fontSize: "1.1rem" }}>&ldquo;{p.other_about}&rdquo;</p>}
                {state === "open" ? (
                  <div className="row">
                    <ActionForm action={respondAction.bind(null, token, p.id, "accepted")}>
                      <SubmitButton className="btn good">Ja, ik doe mee</SubmitButton>
                    </ActionForm>
                    <ActionForm action={respondAction.bind(null, token, p.id, "declined")}>
                      <SubmitButton className="btn secondary">Deze keer niet</SubmitButton>
                    </ActionForm>
                  </div>
                ) : (
                  <p className="badge accent">Je hebt ja gezegd. We wachten op {p.other_first_name}.</p>
                )}
                <p className="muted small">Alleen als jullie allebei ja zeggen, gaat de videodate door. Een nee blijft privé.</p>
              </div>
            );
          })}
        </section>
      )}

      {dates.length > 0 && (
        <section className="stack">
          <h2>Jouw videodates</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {dates.map((d) => (
                  <tr key={d.token}>
                    <td>{formatShort(d.starts_at)}</td>
                    <td>{d.other_first_name}</td>
                    <td>
                      {d.status === "cancelled" ? (
                        <span className="badge">Gaat niet door</span>
                      ) : (
                        <Link href={paths.date(d.token)}>{d.starts_at > now ? "Bekijken" : d.decision ? "Uitkomst" : "Maak je keuze"}</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Voorkeuren</h2>
        <MemberForm
          mode="edit"
          action={updateProfileAction.bind(null, token)}
          launchLabel={launchLabel}
          defaults={{
            firstName: member.first_name,
            gender: member.gender,
            lookingFor: member.looking_for,
            ageMin: member.age_min,
            ageMax: member.age_max,
            region: member.region,
            intent: member.intent,
            about: member.about,
            slots: member.slots,
            visible: member.visible,
          }}
        />
      </section>

      <div className="card soft stack">
        <h3>Heb je al een match ergens anders?</h3>
        <p className="muted">Nodig die persoon uit voor een videodate van twintig minuten.</p>
        <Link className="btn secondary" href="/uitnodigen">
          Match uitnodigen
        </Link>
      </div>

      <details>
        <summary>Mijn gegevens verwijderen</summary>
        <ActionForm action={deleteProfileAction.bind(null, token)} className="stack">
          <p className="muted">
            We verwijderen je profiel, voorkeuren en openstaande voorstellen. Dit kan niet ongedaan worden gemaakt.
          </p>
          <SubmitButton className="btn danger">Ja, verwijder alles</SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}
