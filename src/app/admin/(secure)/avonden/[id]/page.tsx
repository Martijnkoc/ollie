import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eveningStatusAction, proposeAction, proposeAllAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { GENDERS, INTENTS, REGIONS, SLOTS, label } from "@/lib/config";
import { eveningPool, getEvening, toCandidate } from "@/lib/community";
import { getDb } from "@/lib/db";
import { compatible, pairKey, suggestPairs } from "@/lib/matching";
import { formatMoment } from "@/lib/time";

const RESPONSE = { pending: "wacht", accepted: "ja", declined: "nee" } as const;

export default async function EveningPage(props: PageProps<"/admin/avonden/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const evening = await getEvening(db, id);
  if (!evening) notFound();

  const now = new Date();
  const { members, excluded, busyIds } = await eveningPool(db, evening);
  const candidates = members.map((m) => ({ member: m, c: toCandidate(m, now) }));
  const free = candidates.filter((x) => !busyIds.has(x.member.id));
  const suggestions = suggestPairs(
    free.map((x) => x.c),
    excluded,
  );
  const byId = new Map(candidates.map((x) => [x.member.id, x]));
  const options = (mid: string) =>
    free.filter((x) => x.member.id !== mid && compatible(byId.get(mid)!.c, x.c) && !excluded.has(pairKey(mid, x.member.id))).length;

  const proposals = await db.query<{
    id: string;
    a: string;
    b: string;
    response_a: keyof typeof RESPONSE;
    response_b: keyof typeof RESPONSE;
    date_id: string | null;
  }>(
    `select p.id, ma.first_name as a, mb.first_name as b, p.response_a, p.response_b, p.date_id
     from proposals p join members ma on ma.id = p.member_a join members mb on mb.id = p.member_b
     where p.evening_id = $1 order by p.created_at`,
    [id],
  );

  const who = (mid: string) => {
    const x = byId.get(mid)!;
    return `${x.member.first_name} (${x.c.age}, ${label(GENDERS, x.c.gender).toLowerCase()})`;
  };

  return (
    <>
      <div className="stack">
        <Link href="/admin/avonden">← Alle avonden</Link>
        <h1>{formatMoment(evening.starts_at)}</h1>
        <p className="muted">
          {label(SLOTS, evening.slot)} · {label(REGIONS, evening.region)} · {members.length} beschikbaar · {suggestions.length}{" "}
          mogelijke paren
        </p>
        <div className="row">
          {evening.status !== "open" && (
            <ActionForm action={eveningStatusAction.bind(null, id, "open")}>
              <SubmitButton className="btn good">Openen (zichtbaar op de site)</SubmitButton>
            </ActionForm>
          )}
          {evening.status === "open" && (
            <ActionForm action={eveningStatusAction.bind(null, id, "planned")}>
              <SubmitButton className="btn secondary">Terug naar verzamelen</SubmitButton>
            </ActionForm>
          )}
          {evening.status !== "closed" && (
            <ActionForm action={eveningStatusAction.bind(null, id, "closed")}>
              <SubmitButton className="btn ghost">Sluiten</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      <section className="stack">
        <h2>Voorgestelde paren</h2>
        {suggestions.length === 0 ? (
          <p className="notice">
            Nog geen paren mogelijk. Een avond openen heeft pas zin als hier een paar voorstellen staan.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Paar</th>
                    <th>Zoeken</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(([a, b]) => (
                    <tr key={pairKey(a.id, b.id)}>
                      <td>
                        {who(a.id)}
                        <br />
                        {who(b.id)}
                      </td>
                      <td className="small">
                        {label(INTENTS, a.intent)}
                        <br />
                        {label(INTENTS, b.intent)}
                      </td>
                      <td>
                        <ActionForm action={proposeAction.bind(null, id, a.id, b.id)}>
                          <SubmitButton className="btn secondary">Voorstellen</SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ActionForm action={proposeAllAction.bind(null, id)}>
              <SubmitButton>Alle {suggestions.length} paren voorstellen en mailen</SubmitButton>
            </ActionForm>
          </>
        )}
      </section>

      {proposals.length > 0 && (
        <section className="stack">
          <h2>Verstuurde voorstellen</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Paar</th>
                  <th>Antwoorden</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.a} &amp; {p.b}
                    </td>
                    <td>
                      {RESPONSE[p.response_a]} / {RESPONSE[p.response_b]}
                    </td>
                    <td>
                      {p.date_id ? (
                        <span className="badge good">Gepland</span>
                      ) : p.response_a === "declined" || p.response_b === "declined" ? (
                        <span className="badge">Gaat niet door</span>
                      ) : (
                        <span className="badge accent">Wacht</span>
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
        <h2>Beschikbaar op deze avond</h2>
        {candidates.length === 0 ? (
          <p className="notice">Nog niemand in deze regio heeft dit moment aangevinkt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wie</th>
                  <th>Zoekt</th>
                  <th>Opties</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(({ member: m, c }) => (
                  <tr key={m.id}>
                    <td>{who(m.id)}</td>
                    <td className="small">
                      {m.looking_for.map((g) => label(GENDERS, g).toLowerCase()).join(", ")}, {c.ageMin}–{c.ageMax}
                      <br />
                      {label(INTENTS, m.intent)}
                    </td>
                    <td>{busyIds.has(m.id) ? <span className="badge accent">voorgesteld</span> : options(m.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
