"use client";

import { StatusBadge } from "@/components/StatusBadge";
import type { PageAnalysis, Room, Scale } from "@/lib/projects/schema";

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;

/**
 * What the automatic measuring found on this page, how sure the scale is, and one button to confirm every
 * room that passed all checks. Rooms with a remark stay open for a closer look.
 */
export function AutoSummary({
  analysis,
  scale,
  rooms,
  onConfirmAll,
}: {
  analysis: PageAnalysis;
  scale: Scale | null;
  rooms: Room[];
  onConfirmAll: () => void;
}) {
  const auto = analysis.auto;
  if (!auto) return null;
  const pending = rooms.filter((r) => r.origin === "auto" && r.shape.kind === "drawn" && r.shape.status === "auto");
  const ready = pending.filter((r) => r.autoOk);
  const attention = pending.filter((r) => !r.autoOk);
  const ev = scale?.method === "maatlijnen" ? scale.evidence : null;

  return (
    <div className="card-flat stack-sm auto-summary" aria-labelledby="auto-titel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 id="auto-titel" style={{ margin: 0 }}>
          Automatisch opgemeten
        </h3>
        <StatusBadge status="auto" />
      </div>
      {auto.rooms > 0 ? (
        <p className="small" style={{ margin: 0 }}>
          {auto.rooms} {auto.rooms === 1 ? "ruimte" : "ruimtes"} opgemeten langs de wanden op de tekening
          {auto.windows > 0 ? `, ${auto.windows} ${auto.windows === 1 ? "raam" : "ramen"}` : ""}
          {auto.doors > 0 ? ` en ${auto.doors} ${auto.doors === 1 ? "deur" : "deuren"}` : ""} gevonden.
        </p>
      ) : (
        <p className="small" style={{ margin: 0 }}>
          We konden op deze pagina geen ruimtes opmeten.
        </p>
      )}
      {ev && (
        <p className="small" style={{ margin: 0 }}>
          <strong>Schaal:</strong> {ev.agreeing} van de {ev.lines} maatlijnen op de tekening kloppen onderling (±{pct(ev.uncertainty)})
          {ev.directions === 2 ? ", horizontaal én verticaal" : ", maar alleen in één richting"}.{" "}
          {ev.proven ? "Daarmee staat de schaal vast." : "Meet één maat in je woning na voordat je bevestigt."}
        </p>
      )}
      {auto.reasons.length > 0 && (
        <ul className="small" style={{ margin: 0 }}>
          {auto.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <>
          <p className="small" style={{ margin: 0 }}>
            {ready.length > 0 && (
              <>
                ✓ {ready.length} {ready.length === 1 ? "ruimte doorstaat" : "ruimtes doorstaan"} alle controles: rondom wanden, één naam en
                een vaste schaal.{" "}
              </>
            )}
            {attention.length > 0 && <>! Bekijk zelf: {attention.map((r) => r.name.trim() || "ruimte zonder naam").join(", ")}.</>}
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!ready.length} onClick={onConfirmAll}>
              Bevestig alles wat klopt ({ready.length})
            </button>
          </div>
          <p className="tiny muted" style={{ margin: 0 }}>
            Leg de omtrekken naast je tekening. Met deze knop bevestig je de gecontroleerde ruimtes en de schaal; ramen en deuren meet je
            later zelf.
          </p>
        </>
      )}
    </div>
  );
}
