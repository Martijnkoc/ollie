import { BRAND } from "@/config/brand";
import { formatM2, formatMFromMm } from "@/lib/format";
import { EXAMPLE_ROOMS, EXAMPLE_WINDOWS } from "./example";

const S = 0.1; // mm → svg units
const pts = (poly: [number, number][]) => poly.map(([x, y]) => `${x * S},${y * S}`).join(" ");
const { graphite, signal, steel } = BRAND.colors;

/** A dimension line with end ticks, connected to the edge it measures by short extension lines. */
function Dimension({ x1, y1, x2, y2, label, offset }: { x1: number; y1: number; x2: number; y2: number; label: string; offset: number }) {
  const horizontal = y1 === y2;
  const dx = horizontal ? 0 : offset;
  const dy = horizontal ? offset : 0;
  const tick = (x: number, y: number) => (horizontal ? `M ${x} ${y + dy - 12} V ${y + dy + 12}` : `M ${x + dx - 12} ${y} H ${x + dx + 12}`);
  return (
    <g stroke={steel} strokeWidth={2.5} fill="none">
      <path
        d={horizontal ? `M ${x1} ${y1} V ${y1 + dy} M ${x2} ${y2} V ${y2 + dy}` : `M ${x1} ${y1} H ${x1 + dx} M ${x2} ${y2} H ${x2 + dx}`}
        strokeDasharray="4 4"
      />
      <path d={`M ${x1 + dx} ${y1 + dy} L ${x2 + dx} ${y2 + dy}`} />
      <path d={`${tick(x1, y1)} ${tick(x2, y2)}`} />
      <text
        x={(x1 + x2) / 2 + dx + (horizontal ? 0 : -14)}
        y={(y1 + y2) / 2 + dy + (horizontal ? -12 : 0)}
        textAnchor="middle"
        fontSize="26"
        fontWeight="650"
        fill={graphite}
        stroke="none"
        fontFamily="Inter, system-ui, sans-serif"
        transform={horizontal ? undefined : `rotate(-90 ${(x1 + x2) / 2 + dx - 14} ${(y1 + y2) / 2})`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {label}
      </text>
    </g>
  );
}

/** Example plan with selected rooms, numbered windows and measuring lines, as the app shows it. Fictional home. */
export function PlanIllustration() {
  return (
    <svg viewBox="-110 -120 1340 1020" role="img" aria-labelledby="plan-title plan-desc">
      <title id="plan-title">Voorbeeld: plattegrond met herkende kamers, ramen en maatlijnen</title>
      <desc id="plan-desc">
        Een fictief appartement van 12 bij 8 meter. Zes ruimtes zijn geselecteerd voor de vloer; de badkamer, het toilet en de berging niet.
        Vijf ramen zijn genummerd R01 tot en met R05.
      </desc>
      <defs>
        <pattern id="hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d9d7ce" strokeWidth="5" />
        </pattern>
      </defs>
      <Dimension x1={0} y1={0} x2={1200} y2={0} label={formatMFromMm(12000)} offset={-70} />
      <Dimension x1={0} y1={0} x2={0} y2={800} label={formatMFromMm(8000)} offset={-70} />
      {EXAMPLE_ROOMS.map((r, i) => (
        <polygon
          key={r.name}
          points={pts(r.poly)}
          fill={r.included ? (i === 0 ? "rgba(255,106,53,0.20)" : "rgba(255,106,53,0.09)") : "url(#hatch)"}
          stroke={graphite}
          strokeWidth={3}
        />
      ))}
      <polygon points={pts(EXAMPLE_ROOMS[0]!.poly)} fill="none" stroke={signal} strokeWidth="5" strokeDasharray="14 8" />
      <rect x="0" y="0" width="1200" height="800" fill="none" stroke={graphite} strokeWidth="10" />
      {EXAMPLE_WINDOWS.map((w) => {
        const [x, y] = w.at;
        const horizontal = y === 0 || y === 8000;
        return (
          <g key={w.code} transform={`translate(${x * S} ${y * S})`}>
            {horizontal ? (
              <rect x="-70" y="-7" width="140" height="14" fill="#fff" stroke={graphite} strokeWidth="2.5" />
            ) : (
              <rect x="-7" y="-70" width="14" height="140" fill="#fff" stroke={graphite} strokeWidth="2.5" />
            )}
            <g transform={horizontal ? `translate(0 ${y === 0 ? 36 : -36})` : "translate(-56 0)"}>
              <rect x="-38" y="-19" width="76" height="38" rx="6" fill={signal} />
              <text x="0" y="8" textAnchor="middle" fontSize="22" fontWeight="700" fill={graphite} fontFamily="ui-monospace, monospace">
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
            <rect x={small ? -19 : -115} y={small ? -19 : -29} width="38" height="38" rx="6" fill={graphite} />
            <text x={small ? 0 : -96} y={small ? 8 : -2} textAnchor="middle" fontSize="22" fontWeight="700" fill="#f4f2ec">
              {i + 1}
            </text>
            {!small && (
              <>
                <text x="-64" y="-2" fontSize="31" fontWeight="650" fill={graphite}>
                  {r.name}
                </text>
                <text x="-64" y="34" fontSize="27" fill={r.included ? graphite : "#555d57"} style={{ fontVariantNumeric: "tabular-nums" }}>
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
