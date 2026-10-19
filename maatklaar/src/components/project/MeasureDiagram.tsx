import type { MeasureKey } from "@/lib/measurements/schema";

const ON = "#1f4d3a";
const OFF = "#c7bda9";

function Arrow({ x1, y1, x2, y2, active }: { x1: number; y1: number; x2: number; y2: number; active: boolean }) {
  const c = active ? ON : OFF;
  const w = active ? 3 : 1.5;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (x: number, y: number, a: number) => {
    const s = 8;
    return `M ${x} ${y} L ${x - s * Math.cos(a - 0.45)} ${y - s * Math.sin(a - 0.45)} M ${x} ${y} L ${x - s * Math.cos(a + 0.45)} ${y - s * Math.sin(a + 0.45)}`;
  };
  return (
    <g stroke={c} strokeWidth={w} strokeLinecap="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`${head(x2, y2, ang)} ${head(x1, y1, ang + Math.PI)}`} />
    </g>
  );
}

/**
 * Shows where to measure. One drawing for every product: the window opening seen from inside, with the
 * ceiling and floor for curtains, and a small cross-section for the depth of the recess.
 */
export function MeasureDiagram({ active, keys }: { active: MeasureKey | null; keys: readonly MeasureKey[] }) {
  const show = (k: MeasureKey) => keys.includes(k);
  const is = (k: MeasureKey) => active === k;
  const curtains = show("rail_breedte") || show("ophanghoogte_midden");
  const outside = show("gewenste_breedte");
  return (
    <svg viewBox="0 0 360 280" role="img" aria-label={active ? `Waar je meet: ${active.replace("_", " ")}` : "Overzicht van de meetpunten"}>
      <rect x="0" y="0" width="360" height="280" fill="#f7f3ea" />
      {/* ceiling and floor */}
      <line x1="10" y1="18" x2="290" y2="18" stroke="#8a8f8c" strokeWidth="2" />
      <text x="14" y="13" fontSize="10" fill="#6b746f">
        plafond
      </text>
      <line x1="10" y1="262" x2="290" y2="262" stroke="#8a8f8c" strokeWidth="2" />
      <text x="14" y="276" fontSize="10" fill="#6b746f">
        vloer
      </text>
      {/* wall with window opening */}
      <rect x="70" y="70" width="150" height="120" fill="#ffffff" stroke="#1c2420" strokeWidth="3" />
      <rect x="80" y="80" width="130" height="100" fill="#e3eef4" stroke="#9fb4c1" strokeWidth="1.5" />
      <line x1="145" y1="80" x2="145" y2="180" stroke="#9fb4c1" strokeWidth="1.5" />
      <rect x="62" y="190" width="166" height="8" fill="#d8d0bf" stroke="#1c2420" strokeWidth="1.5" />
      <text x="68" y="212" fontSize="10" fill="#6b746f">
        vensterbank
      </text>

      {outside && (
        <rect
          x="52"
          y="48"
          width="186"
          height="146"
          fill="none"
          stroke={is("gewenste_breedte") || is("gewenste_hoogte") ? ON : OFF}
          strokeDasharray="6 4"
          strokeWidth="2"
        />
      )}
      {curtains && <rect x="40" y="26" width="210" height="6" rx="3" fill={is("rail_breedte") ? ON : "#b98c3c"} />}

      {show("breedte_boven") && <Arrow x1={72} y1={88} x2={218} y2={88} active={is("breedte_boven")} />}
      {show("breedte_midden") && <Arrow x1={72} y1={130} x2={218} y2={130} active={is("breedte_midden")} />}
      {show("breedte_onder") && <Arrow x1={72} y1={172} x2={218} y2={172} active={is("breedte_onder")} />}
      {show("hoogte_links") && <Arrow x1={92} y1={72} x2={92} y2={188} active={is("hoogte_links")} />}
      {show("hoogte_midden") && <Arrow x1={160} y1={72} x2={160} y2={188} active={is("hoogte_midden")} />}
      {show("hoogte_rechts") && <Arrow x1={200} y1={72} x2={200} y2={188} active={is("hoogte_rechts")} />}
      {show("gewenste_breedte") && <Arrow x1={52} y1={40} x2={238} y2={40} active={is("gewenste_breedte")} />}
      {show("gewenste_hoogte") && <Arrow x1={246} y1={48} x2={246} y2={194} active={is("gewenste_hoogte")} />}
      {show("ruimte_boven") && <Arrow x1={260} y1={20} x2={260} y2={68} active={is("ruimte_boven")} />}
      {show("rail_breedte") && <Arrow x1={40} y1={40} x2={250} y2={40} active={is("rail_breedte")} />}
      {show("ophanghoogte_links") && <Arrow x1={46} y1={34} x2={46} y2={260} active={is("ophanghoogte_links")} />}
      {show("ophanghoogte_midden") && <Arrow x1={145} y1={34} x2={145} y2={260} active={is("ophanghoogte_midden")} />}
      {show("ophanghoogte_rechts") && <Arrow x1={244} y1={34} x2={244} y2={260} active={is("ophanghoogte_rechts")} />}

      {show("diepte") && (
        <g transform="translate(286 92)">
          <text x="0" y="-8" fontSize="10" fill="#6b746f">
            doorsnede
          </text>
          <rect x="0" y="0" width="56" height="90" fill="#e6dfd0" stroke="#1c2420" strokeWidth="1.5" />
          <rect x="34" y="0" width="22" height="90" fill="#fff" stroke="#1c2420" strokeWidth="1.5" />
          <line x1="48" y1="0" x2="48" y2="90" stroke="#7aa3bb" strokeWidth="3" />
          <text x="2" y="104" fontSize="9" fill="#6b746f">
            muur
          </text>
          <text x="38" y="104" fontSize="9" fill="#6b746f">
            glas
          </text>
          <Arrow x1={2} y1={45} x2={46} y2={45} active={is("diepte")} />
        </g>
      )}
    </svg>
  );
}
