import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  blockAction,
  cancelDateAction,
  decideAction,
  helpedAction,
  withdrawContactAction,
} from "@/app/actions/date";
import { ActionForm } from "@/components/ActionForm";
import { CameraPreview } from "@/components/CameraPreview";
import { Countdown } from "@/components/Countdown";
import { ContactForm, ReportForm } from "@/components/forms/DateForms";
import { SubmitButton } from "@/components/SubmitButton";
import { DATE_MINUTES, LOBBY_MINUTES } from "@/lib/config";
import { type DateView, getView } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { endsAt, formatMoment, opensAt } from "@/lib/time";
import { paths } from "@/lib/url";

export const metadata: Metadata = { title: "Jullie videodate", robots: { index: false } };

export default async function DatePage(props: PageProps<"/d/[token]">) {
  const { token } = await props.params;
  const query = await props.searchParams;
  const view = await getView(await getDb(), token);
  if (!view) notFound();

  const { me, other, phase } = view;
  const showChoice = phase === "ended" || (phase === "live" && query.keuze !== undefined);

  return (
    <div className="container narrow section stack-lg">
      {query.nieuw !== undefined && phase !== "cancelled" && (
        <div className="notice good">
          <strong>Gelukt, jullie videodate staat gepland.</strong> Bewaar deze pagina: dit is jouw persoonlijke link naar de
          videodate.{me.email ? " We hebben hem ook naar je gemaild." : ""}
        </div>
      )}
      {query.gemeld !== undefined && (
        <div className="notice good">Dank je voor je melding. We bekijken hem zo snel mogelijk en behandelen hem vertrouwelijk.</div>
      )}

      {me.blocked_at ? (
        <Blocked view={view} />
      ) : phase === "cancelled" ? (
        <Cancelled view={view} />
      ) : showChoice ? (
        <After view={view} />
      ) : (
        <Before view={view} token={token} />
      )}

      {!me.blocked_at && <Safety view={view} />}
    </div>
  );
}

function Before({ view, token }: { view: DateView; token: string }) {
  const { date, other, phase } = view;
  const start = date.starts_at;
  return (
    <>
      <div className="stack">
        <p className="eyebrow">Jullie videodate</p>
        <h1>Met {other.first_name}</h1>
        <p className="moment">{formatMoment(start)}</p>
      </div>

      {phase === "upcoming" && (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            De ruimte gaat open over
          </p>
          <Countdown to={opensAt(start).toISOString()} className="big-time" />
          <p className="muted">
            Je kunt {LOBBY_MINUTES} minuten van tevoren naar binnen om je camera te testen. Het gesprek duurt {DATE_MINUTES}{" "}
            minuten en stopt daarna vanzelf.
          </p>
          <div className="row">
            <a className="btn secondary" href={`${paths.date(token)}/agenda`}>
              Zet in je agenda
            </a>
          </div>
        </div>
      )}

      {phase === "lobby" && (
        <div className="card stack">
          <p className="eyebrow">De ruimte is open</p>
          <p style={{ margin: 0 }}>Jullie beginnen over</p>
          <Countdown to={start.toISOString()} className="big-time" />
          <Link className="btn large block" href={paths.room(token)}>
            Naar binnen
          </Link>
        </div>
      )}

      {phase === "live" && (
        <div className="card stack">
          <p className="eyebrow">Jullie videodate loopt</p>
          <p style={{ margin: 0 }}>Nog</p>
          <Countdown to={endsAt(start, date.duration_minutes).toISOString()} className="big-time" doneHref={`${paths.date(token)}?keuze=1`} />
          <Link className="btn large block" href={paths.room(token)}>
            Naar binnen
          </Link>
          <p className="muted small">
            Al uitgepraat? <Link href={`${paths.date(token)}?keuze=1`}>Maak je keuze</Link>.
          </p>
        </div>
      )}

      {phase !== "live" && (
        <div className="grid-2">
          <div className="stack">
            <h2>Camera en geluid</h2>
            <p className="muted">Test vast even of alles werkt. Je hebt alleen je browser nodig, geen app.</p>
            <CameraPreview />
          </div>
          <div className="card soft">
            <h3>Een paar tips</h3>
            <ul className="checks">
              <li>Zoek een rustige plek met licht van voren.</li>
              <li>Oortjes helpen tegen echo.</li>
              <li>Het hoeft niet perfect. Twintig minuten is precies genoeg om een gevoel te krijgen.</li>
              <li>Na afloop kies je in alle rust. Niemand ziet jouw &lsquo;nee&rsquo;.</li>
            </ul>
          </div>
        </div>
      )}

      {(phase === "upcoming" || phase === "lobby") && (
        <details>
          <summary>Kun je toch niet?</summary>
          <ActionForm action={cancelDateAction.bind(null, token)} className="stack">
            <p className="muted">Zeg de videodate af, dan laten we het {other.first_name} weten.</p>
            <SubmitButton className="btn danger">Videodate afzeggen</SubmitButton>
          </ActionForm>
        </details>
      )}
    </>
  );
}

function After({ view }: { view: DateView }) {
  const { me, other, outcome, otherContact } = view;
  const token = me.token;
  return (
    <>
      {outcome === "undecided" ? (
        <div className="card stack">
          <p className="eyebrow">Na jullie videodate</p>
          <h1>Hoe was het?</h1>
          <p style={{ fontSize: "1.15rem" }}>Wil je {other.first_name} verder leren kennen?</p>
          <div className="grid-2">
            <ActionForm action={decideAction.bind(null, token, "yes")}>
              <SubmitButton className="btn large block good">Ja, graag</SubmitButton>
            </ActionForm>
            <ActionForm action={decideAction.bind(null, token, "no")}>
              <SubmitButton className="btn large block secondary">Nee, dank je</SubmitButton>
            </ActionForm>
          </div>
          <p className="muted small">
            Je keuze is privé. {other.first_name} hoort alleen iets als jullie allebei ja zeggen.
          </p>
          {view.phase === "ended" && me.joined_at && !other.joined_at && (
            <p className="notice small">
              Het lijkt erop dat {other.first_name} niet binnen is gekomen. Was dat niet in orde? Je kunt het hieronder melden.
            </p>
          )}
        </div>
      ) : (
        <>
          {outcome === "waiting" && (
            <div className="card stack">
              <p className="eyebrow">Je keuze is bewaard</p>
              <h1>Nu is {other.first_name} aan de beurt</h1>
              <p className="muted">
                Zodra {other.first_name} ook gekozen heeft, zie je hier de uitkomst.
                {me.email && me.decision === "yes" ? " Willen jullie allebei verder, dan mailen we je meteen." : ""}
              </p>
            </div>
          )}

          {outcome === "mutual" && (
            <div className="card stack">
              <p className="eyebrow">Wederzijdse interesse</p>
              <h1>Jullie willen allebei verder</h1>
              <p className="muted">
                Je contactgegevens blijven verborgen tot je ze zelf deelt. Kies hieronder wat je met {other.first_name} wilt
                delen.
              </p>
              {otherContact ? (
                <div className="notice good">
                  <span className="small muted">{other.first_name} deelt met jou:</span>
                  <p style={{ fontSize: "1.2rem", fontWeight: 600, margin: "4px 0 0", overflowWrap: "anywhere" }}>{otherContact}</p>
                </div>
              ) : (
                <div className="notice">{other.first_name} heeft nog niets gedeeld. Je ziet het hier zodra dat gebeurt.</div>
              )}
              {me.contact_shared_at ? (
                <div className="stack">
                  <p>
                    Jij deelt: <strong style={{ overflowWrap: "anywhere" }}>{me.contact}</strong>
                  </p>
                  <ActionForm action={withdrawContactAction.bind(null, token)}>
                    <SubmitButton className="btn ghost">Intrekken</SubmitButton>
                  </ActionForm>
                </div>
              ) : (
                <ContactForm token={token} otherName={other.first_name} />
              )}
              <p className="muted small">
                Spreek je echt af? Kies een openbare plek en laat iemand weten waar je bent. Lees meer in de{" "}
                <Link href="/huisregels">huisregels</Link>.
              </p>
            </div>
          )}

          {outcome === "no-match" && (
            <div className="card stack">
              <p className="eyebrow">Na jullie videodate</p>
              <h1>Deze keer geen vervolg</h1>
              <p className="muted">
                Dat is ook een uitkomst. Je weet het nu, zonder dat je er een hele avond voor vrijmaakte. Precies waar die
                twintig minuten voor zijn.
              </p>
            </div>
          )}

          {!me.helped ? (
            <div className="card flat stack">
              <h2>Nog één vraag</h2>
              <p>Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?</p>
              <div className="row">
                <ActionForm action={helpedAction.bind(null, token, "yes")}>
                  <SubmitButton className="btn secondary">Ja</SubmitButton>
                </ActionForm>
                <ActionForm action={helpedAction.bind(null, token, "somewhat")}>
                  <SubmitButton className="btn secondary">Een beetje</SubmitButton>
                </ActionForm>
                <ActionForm action={helpedAction.bind(null, token, "no")}>
                  <SubmitButton className="btn secondary">Nee</SubmitButton>
                </ActionForm>
              </div>
              <p className="muted small">Je antwoord blijft vertrouwelijk. {other.first_name} ziet het nooit.</p>
            </div>
          ) : (
            <p className="muted small">Dank je voor je antwoord. Daar maken we de volgende date beter mee.</p>
          )}
        </>
      )}

      <NextStep view={view} />
    </>
  );
}

function NextStep({ view }: { view: DateView }) {
  if (view.me.role === "member") {
    return (
      <p className="muted small">
        Je volgende voorstel krijg je van ons per mail. Je voorkeuren pas je aan via je persoonlijke link.
      </p>
    );
  }
  const params = new URLSearchParams({ van: "date", naam: view.me.first_name });
  return (
    <div className="card soft stack">
      <h3>Vond je dit een prettige manier van kennismaken?</h3>
      <p className="muted">
        Meld je aan voor een kennismakingsavond. Wij stellen je voor aan iemand die bij je past, op een moment dat jou
        uitkomt.
      </p>
      <Link className="btn secondary" href={`/ontmoeten?${params}`}>
        Iemand nieuw leren kennen
      </Link>
    </div>
  );
}

function Cancelled({ view }: { view: DateView }) {
  return (
    <div className="card stack">
      <h1>Deze videodate gaat niet door</h1>
      <p className="muted">
        {view.me.cancelled_at ? "Je hebt de videodate afgezegd." : `${view.other.first_name} kan helaas niet. Jammer, maar zo weet je het op tijd.`}
      </p>
      {view.me.role !== "member" && (
        <Link className="btn secondary" href="/uitnodigen">
          Zelf iemand uitnodigen
        </Link>
      )}
    </div>
  );
}

function Blocked({ view }: { view: DateView }) {
  return (
    <div className="card stack">
      <h1>Je hebt {view.other.first_name} geblokkeerd</h1>
      <p className="muted">
        Jullie videodate gaat niet door en jullie worden niet meer aan elkaar voorgesteld. {view.other.first_name} krijgt
        daar geen melding van.
      </p>
    </div>
  );
}

function Safety({ view }: { view: DateView }) {
  const token = view.me.token;
  return (
    <details className="card flat">
      <summary>Melden of blokkeren</summary>
      <div className="stack">
        <p className="muted small">
          Voelde iets niet goed? Je kunt {view.other.first_name} altijd blokkeren, ook tijdens of na de date. Blokkeren zet
          een eventuele afspraak stop en verbergt alles wat je gedeeld hebt.
        </p>
        <ActionForm action={blockAction.bind(null, token)}>
          <SubmitButton className="btn danger">Alleen blokkeren</SubmitButton>
        </ActionForm>
        <hr style={{ margin: "8px 0" }} />
        <ReportForm token={token} otherName={view.other.first_name} />
      </div>
    </details>
  );
}
