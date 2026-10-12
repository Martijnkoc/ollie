import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cancelDateAction, respondProposalAction, withdrawContactAction } from "@/app/actions/dates";
import { ActionForm } from "@/components/ActionForm";
import { BlockConfirm } from "@/components/BlockConfirm";
import { CameraPreview } from "@/components/CameraPreview";
import { Countdown } from "@/components/Countdown";
import { Dialog } from "@/components/Dialog";
import { Moment } from "@/components/Moment";
import { SubmitButton } from "@/components/SubmitButton";
import { ContactShareForm } from "@/components/forms/ContactShareForm";
import { FeedbackForm } from "@/components/forms/FeedbackForm";
import { ProposeForm } from "@/components/forms/ProposeForm";
import { ReportForm } from "@/components/forms/ReportForm";
import { viewer } from "@/lib/access";
import { CONTACT_FIELDS, DATE_MINUTES, JOIN_WINDOW_MINUTES, LOBBY_MINUTES, MIN_LEAD_MINUTES, label } from "@/lib/config";
import { type DateView, joinDeadline, lobbyOpens, settleAndClose, viewFor } from "@/lib/dates/core";
import { getDb } from "@/lib/db";
import { contactShares, outcomeFor } from "@/lib/feedback";
import { earliestMomentInput } from "@/lib/time";
import { videoProvider } from "@/lib/video/provider";

export const metadata: Metadata = { title: "Videodate", robots: { index: false } };

export default async function DatePage(props: PageProps<"/afspraken/[id]">) {
  const { id } = await props.params;
  const v = await viewer();
  if (!v) redirect(`/inloggen?next=/afspraken/${id}`);
  const db = await getDb();
  await settleAndClose(db, id, videoProvider()).catch(() => {});
  const view = await viewFor(db, v.user.id, id);
  // Not a participant: the same "not found" as for an id that does not exist.
  if (!view) notFound();
  const now = new Date();
  const { phase, other, date } = view;
  const otherName = other.display_name;

  return (
    <div className="container narrow page stack-lg">
      <Link href="/afspraken">← Afspraken</Link>

      {phase === "proposed" && <Proposed view={view} mine={date.proposed_by === v.user.id} />}

      {(phase === "upcoming" || phase === "lobby" || phase === "live") && (
        <>
          <div className="stack">
            <p className="eyebrow">Videodate van {DATE_MINUTES} minuten</p>
            <h1>Met {otherName}</h1>
            <Moment at={date.scheduled_at.toISOString()} className="moment" />
          </div>
          <div className="card stack" aria-live="polite">
            {phase === "upcoming" && (
              <>
                <p style={{ margin: 0 }}>De lobby gaat open over</p>
                <Countdown to={lobbyOpens(date).toISOString()} serverNow={now.toISOString()} className="big-time" />
                <p className="muted">
                  Je kunt {LOBBY_MINUTES} minuten van tevoren naar binnen voor een camera-check. De twintig minuten beginnen pas als jullie
                  er allebei zijn. Is iemand er na {JOIN_WINDOW_MINUTES} minuten nog niet, dan gaat het niet door en telt het niet mee.
                </p>
                <a className="btn secondary" href={`/afspraken/${id}/agenda`}>
                  Zet in je agenda
                </a>
              </>
            )}
            {(phase === "lobby" || phase === "live") && (
              <>
                <p className="eyebrow">{phase === "live" ? "Jullie gesprek loopt" : "De lobby is open"}</p>
                <p style={{ margin: 0 }}>
                  {phase === "live" ? "Nog" : "Binnenkomen kan nog"}{" "}
                  <Countdown to={(phase === "live" ? date.ends_at! : joinDeadline(date)).toISOString()} serverNow={now.toISOString()} />
                </p>
                <Link className="btn lime large block" href={`/afspraken/${id}/kamer`}>
                  {phase === "live" ? "Terug naar het gesprek" : "Naar de videodate"}
                </Link>
              </>
            )}
          </div>
          {phase === "upcoming" && (
            <div className="grid-2">
              <div className="stack">
                <h2>Camera en geluid</h2>
                <p className="muted">Alleen jij ziet dit. Er wordt niets opgenomen of verstuurd.</p>
                <CameraPreview name={view.me.display_name} />
              </div>
              <div className="card soft stack">
                <h3>Een paar tips</h3>
                <ul className="checks">
                  <li>Een rustige plek met licht van voren.</li>
                  <li>Oortjes helpen tegen echo.</li>
                  <li>Het hoeft niet perfect: twintig minuten is genoeg voor een eerste indruk.</li>
                  <li>Stoppen kan altijd, ook halverwege.</li>
                </ul>
              </div>
            </div>
          )}
          {phase !== "live" && (
            <details>
              <summary>Kun je toch niet?</summary>
              <ActionForm action={cancelDateAction.bind(null, id)} className="stack">
                <p className="muted">We laten het {otherName} weten. Je tegoed komt terug.</p>
                <SubmitButton className="btn danger">Videodate afzeggen</SubmitButton>
              </ActionForm>
            </details>
          )}
        </>
      )}

      {phase === "ended" && date.started_at && <After view={view} userId={v.user.id} isMember={v.organise} />}

      {(phase === "ended" && !date.started_at) || phase === "no_show" ? (
        <div className="card stack">
          <h1>Er is geen gesprek geweest</h1>
          <p className="muted">Jullie waren niet tegelijk aanwezig. Er is geen videodate van het tegoed gebruikt.</p>
        </div>
      ) : null}
      {phase === "cancelled" && (
        <div className="card stack">
          <h1>Deze videodate gaat niet door</h1>
          <p className="muted">
            {date.cancelled_by === v.user.id ? "Je hebt hem afgezegd." : `${otherName} kan helaas niet.`} Het tegoed is teruggezet.
          </p>
        </div>
      )}
      {phase === "declined" && (
        <div className="card stack">
          <h1>Dit voorstel gaat niet door</h1>
          <p className="muted">Er is niets van het tegoed gebruikt.</p>
        </div>
      )}
      {phase === "failed" && (
        <div className="card stack">
          <h1>Dit gesprek kon niet doorgaan</h1>
          <p className="muted">Er was een storing bij de videodienst. Er is niets van het tegoed gebruikt.</p>
        </div>
      )}

      <div className="row">
        <Dialog trigger="Melden" triggerClassName="btn ghost" title={`${otherName} melden`}>
          <ReportForm context="date" contextId={id} name={otherName} />
        </Dialog>
        {other.user_id && (
          <Dialog trigger="Blokkeren" triggerClassName="btn ghost" title={`${otherName} blokkeren?`}>
            <BlockConfirm userId={other.user_id} name={otherName} back={`/afspraken/${id}`} />
          </Dialog>
        )}
      </div>
    </div>
  );
}

function Proposed({ view, mine }: { view: DateView; mine: boolean }) {
  const id = view.date.id;
  return (
    <div className="card stack">
      <p className="eyebrow">Voorstel</p>
      <h1>{mine ? `Wacht op ${view.other.display_name}` : `${view.other.display_name} stelt een videodate voor`}</h1>
      <Moment at={view.date.scheduled_at.toISOString()} className="moment" />
      {mine ? (
        <ActionForm action={cancelDateAction.bind(null, id)}>
          <SubmitButton className="btn ghost">Voorstel intrekken</SubmitButton>
        </ActionForm>
      ) : (
        <div className="row">
          <ActionForm action={respondProposalAction.bind(null, id, true)}>
            <SubmitButton>Ja, dat past</SubmitButton>
          </ActionForm>
          <ActionForm action={respondProposalAction.bind(null, id, false)}>
            <SubmitButton className="btn secondary">Liever niet</SubmitButton>
          </ActionForm>
        </div>
      )}
      <p className="muted small">Pas als jullie allebei bevestigen, staat de afspraak vast.</p>
    </div>
  );
}

async function After({ view, userId, isMember }: { view: DateView; userId: string; isMember: boolean }) {
  const db = await getDb();
  const id = view.date.id;
  const otherName = view.other.display_name;
  const outcome = await outcomeFor(db, userId, id);
  if (outcome.state === "form") return <FeedbackForm dateId={id} otherName={otherName} />;
  if (outcome.state === "not-applicable") return null;

  if (outcome.state === "waiting") {
    return (
      <div className="card stack" role="status">
        <p className="eyebrow">Je antwoorden zijn bewaard</p>
        <h1>Nu is {otherName} aan de beurt</h1>
        <p className="muted">Je hoort alleen iets als jullie allebei verder willen. Zo blijft een &lsquo;nee&rsquo; voor iedereen privé.</p>
      </div>
    );
  }
  if (outcome.state === "none") {
    return (
      <div className="card stack">
        <p className="eyebrow">Na jullie videodate</p>
        <h1>Deze keer geen vervolg</h1>
        <p className="muted">
          Ook dat is een goed resultaat: je weet het nu, zonder dat je er een hele avond voor vrijmaakte. Wie wat heeft gekozen, blijft
          privé.
        </p>
      </div>
    );
  }

  const shares = await contactShares(db, userId, id);
  return (
    <div className="stack-lg">
      <div className="card lime stack">
        <p className="eyebrow">Wederzijdse interesse</p>
        <h1>Jullie willen allebei verder</h1>
        <p>
          {outcome.kind === "meet"
            ? "Jullie willen allebei afspreken. Hoe en wanneer bepalen jullie samen; er wordt niets automatisch gedeeld."
            : "Jullie willen allebei verder, en minstens één van jullie eerst nog een keer videobellen. Dat is de volgende stap."}
        </p>
      </div>

      {isMember && view.other.user_id && (
        <div className="card flat stack">
          <h2>{outcome.kind === "call" ? "Plan een tweede videodate" : "Nog een keer bellen?"}</h2>
          <ProposeForm
            otherId={view.other.user_id}
            otherName={otherName}
            source="followup"
            parentDateId={id}
            min={earliestMomentInput(MIN_LEAD_MINUTES)}
          />
        </div>
      )}
      {!isMember && <p className="muted">Wil je nog een keer videobellen? {otherName} kan een nieuwe videodate voorstellen.</p>}

      <section className="stack" id="contact" aria-labelledby="contact-title">
        <h2 id="contact-title">Contactgegevens</h2>
        <p className="muted">
          Niets wordt automatisch gedeeld. Je kiest per gegeven wat {otherName} mag zien. Je kunt ook alleen een tweede videodate plannen en
          je nummer privé houden.
        </p>
        {shares.theirs.length > 0 ? (
          <div className="notice good">
            <p className="small" style={{ marginBottom: 4 }}>
              {otherName} deelt met jou:
            </p>
            <ul className="list">
              {shares.theirs.map((s) => (
                <li key={s.id}>
                  <span className="muted small">{label(CONTACT_FIELDS, s.field)}:</span>{" "}
                  <strong style={{ overflowWrap: "anywhere" }}>{s.value}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="notice">{otherName} heeft nog niets gedeeld.</p>
        )}
        {CONTACT_FIELDS.map((f) => {
          const mine = shares.mine.find((s) => s.field === f.key);
          return mine ? (
            <div key={f.key} className="card flat row between">
              <span>
                <span className="muted small">{f.label} gedeeld:</span> <strong>{mine.value}</strong>
              </span>
              <ActionForm action={withdrawContactAction.bind(null, id, mine.id)}>
                <SubmitButton className="btn ghost small">Niet meer tonen</SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <ContactShareForm key={f.key} dateId={id} field={f.key} label={f.label} placeholder={f.placeholder} otherName={otherName} />
          );
        })}
        <p className="muted small">
          &lsquo;Niet meer tonen&rsquo; verbergt het gegeven hier. Wat {otherName} al heeft gezien of bewaard, kunnen we niet terughalen.
        </p>
        <p className="muted small">
          Spreek je echt af? Kies een openbare plek, regel je eigen vervoer en laat iemand weten waar je bent. Meer in de{" "}
          <Link href="/huisregels">huisregels</Link>.
        </p>
      </section>
    </div>
  );
}
