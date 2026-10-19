import { formatM2 } from "@/lib/format";
import { EXAMPLE_ROOMS, EXAMPLE_WINDOWS } from "./example";

const S = 0.1; // mm → svg units
const pts = (poly: [number, number][]) => poly.map(([x, y]) => `${x * S},${y * S}`).join(" ");

/** Example plan with highlighted rooms, as the editor shows it. Fictional home. */
export function PlanIllustration() {
  return (
    <svg viewBox="-60 -70 1320 940" role="img" aria-labelledby="plan-title plan-desc">
      <title id="plan-title">Voorbeeld: plattegrond met herkende kamers</title>
      <desc id="plan-desc">
        Een fictief appartement van 12 bij 8 meter. Zes ruimtes zijn geselecteerd voor de vloer, de badkamer, het toilet en de berging niet. Vijf ramen zijn genummerd R01 tot en met R05.
      </desc>
      <defs>
        <pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d8d0bf" strokeWidth="5" />
        </pattern>
      </defs>
      {EXAMPLE_ROOMS.map((r, i) => (
        <g key={r.name}>
          <polygon
            points={pts(r.poly)}
            fill={r.included ? (i === 0 ? "rgba(43,106,80,0.22)" : "rgba(43,106,80,0.12)") : "url(#hatch)"}
            stroke="#1c2420"
            strokeWidth={i === 0 ? 0 : 3}
          />
        </g>
      ))}
      <polygon points={pts(EXAMPLE_ROOMS[0]!.poly)} fill="none" stroke="#2b6a50" strokeWidth="5" strokeDasharray="14 8" />
      <rect x="0" y="0" width="1200" height="800" fill="none" stroke="#1c2420" strokeWidth="9" />
      {EXAMPLE_WINDOWS.map((w) => {
        const [x, y] = w.at;
        const horizontal = y === 0 || y === 8000;
        return (
          <g key={w.code} transform={`translate(${x * S} ${y * S})`}>
            {horizontal ? <rect x="-70" y="-6" width="140" height="12" fill="#fff" stroke="#1c2420" strokeWidth="2" /> : <rect x="-6" y="-70" width="12" height="140" fill="#fff" stroke="#1c2420" strokeWidth="2" />}
            <g transform={horizontal ? `translate(0 ${y === 0 ? -34 : 34})` : "translate(48 0)"}>
              <rect x="-40" y="-20" width="80" height="40" rx="20" fill="#b98c3c" />
              <text x="0" y="8" textAnchor="middle" fontSize="23" fontWeight="700" fill="#fff" fontFamily="ui-monospace, monospace">
                {w.code}
              </text>
            </g>
          </g>
        );
      })}
      {EXAMPLE_ROOMS.map((r, i) => {
        const [x, y] = r.label;
        const small = r.areaM2 < 3;
        return (
          <g key={`l-${r.name}`} transform={`translate(${x * S} ${y * S})`} fontFamily="Inter, system-ui, sans-serif">
            <circle cx={small ? 0 : -96} cy={small ? 0 : -10} r="21" fill="#1f4d3a" />
            <text x={small ? 0 : -96} y={small ? 8 : -2} textAnchor="middle" fontSize="22" fontWeight="700" fill="#f6f3ec">
              {i + 1}
            </text>
            {!small && (
              <>
                <text x="-64" y="-2" fontSize="33" fontWeight="650" fill="#1c2420">
                  {r.name}
                </text>
                <text x="-64" y="34" fontSize="28" fill={r.included ? "#1f4d3a" : "#6b746f"}>
                  {r.included ? formatM2(r.areaM2) : "niet meegeteld"}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
