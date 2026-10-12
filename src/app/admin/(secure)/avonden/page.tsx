import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { EveningForm } from "@/components/forms/AdminForms";
import { LAUNCH_REGIONS, REGIONS, SLOTS, label } from "@/lib/config";
import { listEvenings } from "@/lib/community";
import { getDb } from "@/lib/db";
import { addMinutes, formatShort, localDay } from "@/lib/time";

const STATUS = { planned: "Verzamelen", open: "Open", closed: "Gesloten" } as const;

export default async function EveningsPage() {
  await requireAdmin();
  const evenings = await listEvenings(await getDb(), { from: addMinutes(new Date(), -7 * 24 * 60) });
  return (
    <>
      <div>
        <h1>Kennismakingsavonden</h1>
        <p className="muted">
          Plan een avond, kijk wie er past en stel paren voor. Zet een avond pas op &lsquo;open&rsquo; (zichtbaar op de site)
          als er genoeg mensen zijn die bij elkaar passen.
        </p>
      </div>
      <div className="grid-2">
        <div className="stack">
          {evenings.length === 0 ? (
            <p className="notice">Nog geen avonden gepland.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Wanneer</th>
                    <th>Regio</th>
                    <th>Status</th>
                    <th>Voorstellen</th>
                  </tr>
                </thead>
                <tbody>
                  {evenings.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/admin/avonden/${e.id}`}>{formatShort(e.starts_at)}</Link>
                        <div className="small muted">{label(SLOTS, e.slot)}</div>
                      </td>
                      <td>{label(REGIONS, e.region)}</td>
                      <td>
                        <span className={`badge ${e.status === "open" ? "good" : ""}`}>{STATUS[e.status]}</span>
                      </td>
                      <td>
                        {e.confirmed} / {e.proposals} bevestigd
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="stack">
          <h2>Nieuwe avond</h2>
          <EveningForm defaultRegion={LAUNCH_REGIONS[0] ?? REGIONS[0].key} minDay={localDay(new Date())} />
        </div>
      </div>
    </>
  );
}
