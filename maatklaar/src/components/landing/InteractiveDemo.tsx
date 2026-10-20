"use client";

import { useState } from "react";
import { formatCount, formatM2, formatPercent } from "@/lib/format";
import { computeFloor } from "@/lib/materials/floor";
import { EXAMPLE_PACK_M2, EXAMPLE_ROOMS, EXAMPLE_WASTE, EXAMPLE_WINDOWS } from "./example";

const S = 0.1; // mm → svg units
const pts = (poly: [number, number][]) => poly.map(([x, y]) => `${x * S},${y * S}`).join(" ");

/**
 * Demonstration with a fictional home: tap a room to count it or leave it out, and the totals follow,
 * computed with the same code as the app. Clearly labelled; no real home or measurement is shown.
 */
export function InteractiveDemo() {
  const [included, setIncluded] = useState(() => new Set(EXAMPLE_ROOMS.filter((r) => r.included).map((r) => r.name)));
  const toggle = (name: string) =>
    setIncluded((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const floor = computeFloor(
    EXAMPLE_ROOMS.map((r) => ({
      id: r.name,
      name: r.name,
      included: included.has(r.name),
      areaMm2: r.areaM2 * 1e6,
      status: "derived" as const,
    })),
    { wastePercent: EXAMPLE_WASTE, packM2: EXAMPLE_PACK_M2 },
  );

  return (
    <div className="demo-interactive">
      <span className="badge badge-demo demo-tag">Demonstratie · fictieve woning, geen echte gegevens</span>
      <div className="demo-plan">
        <svg viewBox="-60 -70 1320 940" role="img" aria-label="Voorbeeldplattegrond met kamers en ramen R01 tot R05">
          {EXAMPLE_ROOMS.map((r) => {
            const on = included.has(r.name);
            return (
              <g key={r.name} onClick={() => toggle(r.name)} style={{ cursor: "pointer" }}>
                <polygon
                  points={pts(r.poly)}
                  fill={on ? "rgba(255,106,53,0.16)" : "rgba(104,113,107,0.08)"}
                  stroke="#191c1a"
                  strokeWidth={3}
                />
                <text
                  x={r.label[0] * S}
                  y={r.label[1] * S}
                  textAnchor="middle"
                  fontSize="34"
                  fill={on ? "#191c1a" : "#555d57"}
                  fontFamily="Inter, sans-serif"
                >
                  {r.name}
                </text>
                <text
                  x={r.label[0] * S}
                  y={r.label[1] * S + 40}
                  textAnchor="middle"
                  fontSize="28"
                  fill="#555d57"
                  fontFamily="Inter, sans-serif"
                >
                  {formatM2(r.areaM2)}
                </text>
              </g>
            );
          })}
          <rect x="0" y="0" width="1200" height="800" fill="none" stroke="#191c1a" strokeWidth="9" />
          {EXAMPLE_WINDOWS.map((w) => (
            <g key={w.code} transform={`translate(${w.at[0] * S} ${w.at[1] * S})`}>
              <rect x="-34" y="-20" width="68" height="40" rx="6" fill="#ff6a35" stroke="#fff" strokeWidth="4" />
              <text y="10" textAnchor="middle" fontSize="26" fontWeight="700" fill="#191c1a" fontFamily="ui-monospace, monospace">
                {w.code}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <fieldset className="demo-rooms">
        <legend className="small">Welke ruimtes tellen mee? Tik op de plattegrond of vink aan.</legend>
        {EXAMPLE_ROOMS.map((r) => (
          <label key={r.name} className="small">
            <input type="checkbox" checked={included.has(r.name)} onChange={() => toggle(r.name)} />
            {r.name}
          </label>
        ))}
      </fieldset>
      <div className="demo-list" aria-live="polite">
        <table>
          <tbody>
            <tr>
              <td>{floor.includedCount} ruimtes netto</td>
              <td>{formatM2(floor.selectedNetM2)}</td>
            </tr>
            <tr>
              <td>+ {formatPercent(EXAMPLE_WASTE)} snijverlies</td>
              <td>{formatM2(floor.requiredM2 ?? 0)}</td>
            </tr>
            <tr>
              <td>Pakken à {formatM2(EXAMPLE_PACK_M2, 3)}</td>
              <td>{formatCount(floor.packs ?? 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
