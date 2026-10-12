import { requireAdmin } from "@/lib/admin";
import { GENDERS, INTENTS, REGIONS, SLOTS, label } from "@/lib/config";
import type { Member } from "@/lib/community";
import { getDb } from "@/lib/db";
import { ageOn, formatShort } from "@/lib/time";

export default async function MembersPage() {
  await requireAdmin();
  const members = await (await getDb()).query<Member>(
    `select id, first_name, email, birth_date::text as birth_date, gender, looking_for, age_min, age_max, region, intent, about, slots, visible, source, created_at
     from members order by created_at desc limit 500`,
  );
  return (
    <>
      <div>
        <h1>Leden</h1>
        <p className="muted">{members.length} aanmeldingen (maximaal 500 getoond).</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Wie</th>
              <th>Regio</th>
              <th>Zoekt</th>
              <th>Momenten</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.first_name}, {ageOn(m.birth_date)} · {label(GENDERS, m.gender).toLowerCase()}
                  <div className="small muted">{m.email}</div>
                </td>
                <td>{label(REGIONS, m.region)}</td>
                <td className="small">
                  {m.looking_for.map((g) => label(GENDERS, g).toLowerCase()).join(", ")}, {m.age_min}–{m.age_max}
                  <br />
                  {label(INTENTS, m.intent)}
                </td>
                <td className="small">{m.slots.map((s) => label(SLOTS, s)).join(", ") || "–"}</td>
                <td>
                  <span className={`badge ${m.visible ? "good" : ""}`}>{m.visible ? "Zichtbaar" : "Pauze"}</span>
                  <div className="small muted">
                    {m.source === "na-date" ? "via videodate" : "direct"} · {formatShort(m.created_at)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
