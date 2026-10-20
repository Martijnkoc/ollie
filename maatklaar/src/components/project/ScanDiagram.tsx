import type { ScanTaskId } from "@/lib/measurements/scan";

const INK = "var(--ink, #191c1a)";
const WALL = "var(--surface-2, #e9e8e1)";
const GLASS = "#dbe5ea";
const MARK = "var(--accent, #ff6a35)";

/** A numbered capture point: where the cross-hair goes, in this order. */
function Point({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={MARK} stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 3.5} fontSize="10" fontWeight="700" textAnchor="middle" fill="#fff">
        {n}
      </text>
    </g>
  );
}

/** The phone sweeping slowly: what the user does before the first point. */
function Sweep() {
  return (
    <g aria-hidden="true">
      <rect x="268" y="128" width="30" height="52" rx="5" fill="#fff" stroke={INK} strokeWidth={2} />
      <circle cx="283" cy="154" r="6" fill="none" stroke={MARK} strokeWidth={2} />
      <path d="M 256 196 q 27 12 54 0" fill="none" stroke={INK} strokeWidth={1.5} strokeDasharray="4 4" />
      <path d="M 306 192 l 5 4 l -6 3" fill="none" stroke={INK} strokeWidth={1.5} />
    </g>
  );
}

/**
 * Our own drawings of what to aim at for each ScanTag capture: numbered points in capture order. Schematic,
 * not to scale. Nothing is placed on the wall.
 */
export function ScanDiagram({ task }: { task: ScanTaskId }) {
  const label: Record<ScanTaskId, string> = {
    opening:
      "Leg de vier hoeken van de raamopening vast, op de voorkant van de muur, in de volgorde linksboven, rechtsboven, rechtsonder, linksonder",
    gewenst: "Leg de vier hoeken vast van waar het product moet komen",
    ruimte_boven: "Leg de bovenkant van het kozijn vast en daarna het plafond recht erboven",
    diepte: "Leg een punt vast op de voorkant van de muur en daarna op dezelfde hoogte het kozijn",
    rail: "Leg het begin en het einde van de rail vast",
    ophang: "Leg links, midden en rechts het ophangpunt en de vloer eronder vast",
    plafond: "Leg de vloer vast tegen de muur en daarna het plafond recht erboven",
  };
  return (
    <svg viewBox="0 0 320 210" className="scan-diagram" role="img" aria-label={label[task]}>
      <rect width="320" height="210" fill={WALL} />
      {task === "diepte" ? (
        <>
          {/* The recess seen at an angle: wall face, reveal, frame with glass. */}
          <rect x="30" y="30" width="70" height="150" fill="#ddd9cc" stroke={INK} strokeWidth={2} />
          <polygon points="100,30 210,62 210,148 100,180" fill="#f4f2ec" stroke={INK} strokeWidth={2} />
          <rect x="210" y="58" width="18" height="94" fill="#fbfbf8" stroke={INK} strokeWidth={2} />
          <rect x="228" y="64" width="8" height="82" fill={GLASS} stroke={INK} strokeWidth={1} />
          <line x1="100" y1="110" x2="210" y2="108" stroke={MARK} strokeWidth={2} strokeDasharray="5 4" />
          <Point x={100} y={110} n={1} />
          <Point x={212} y={108} n={2} />
        </>
      ) : (
        <>
          {(task === "plafond" || task === "ophang" || task === "ruimte_boven") && (
            <>
              <line x1="0" y1="10" x2="320" y2="10" stroke="#8a8f8c" strokeWidth={2} />
              <line x1="0" y1="200" x2="320" y2="200" stroke="#8a8f8c" strokeWidth={2} />
            </>
          )}
          {task !== "plafond" && (
            <>
              <rect x="96" y="52" width="128" height="112" fill="#fbfbf8" stroke={INK} strokeWidth={2.5} />
              <rect x="106" y="62" width="108" height="92" fill={GLASS} stroke="#9fb4c1" strokeWidth={1.5} />
              <rect x="90" y="164" width="140" height="7" fill="#d8d0bf" stroke={INK} strokeWidth={1.5} />
            </>
          )}
          {task === "opening" && (
            <>
              <rect x="96" y="52" width="128" height="112" fill="none" stroke={MARK} strokeWidth={2} strokeDasharray="6 5" />
              <Point x={96} y={52} n={1} />
              <Point x={224} y={52} n={2} />
              <Point x={224} y={164} n={3} />
              <Point x={96} y={164} n={4} />
            </>
          )}
          {task === "gewenst" && (
            <>
              <rect x="80" y="38" width="160" height="138" fill="none" stroke={MARK} strokeWidth={2} strokeDasharray="6 5" />
              <Point x={80} y={38} n={1} />
              <Point x={240} y={38} n={2} />
              <Point x={240} y={176} n={3} />
              <Point x={80} y={176} n={4} />
            </>
          )}
          {task === "ruimte_boven" && (
            <>
              <line x1="160" y1="50" x2="160" y2="12" stroke={MARK} strokeWidth={2} strokeDasharray="5 4" />
              <Point x={160} y={52} n={1} />
              <Point x={160} y={14} n={2} />
            </>
          )}
          {(task === "rail" || task === "ophang") && (
            <>
              <line x1="60" y1="30" x2="260" y2="30" stroke={INK} strokeWidth={4} />
              {task === "rail" ? (
                <>
                  <Point x={60} y={30} n={1} />
                  <Point x={260} y={30} n={2} />
                </>
              ) : (
                [70, 160, 250].map((x, i) => (
                  <g key={x}>
                    <line x1={x} y1={32} x2={x} y2={198} stroke={MARK} strokeWidth={2} strokeDasharray="5 4" />
                    <Point x={x} y={32} n={i * 2 + 1} />
                    <Point x={x} y={196} n={i * 2 + 2} />
                  </g>
                ))
              )}
            </>
          )}
          {task === "plafond" && (
            <>
              <line x1="200" y1="196" x2="200" y2="14" stroke={MARK} strokeWidth={2} strokeDasharray="5 4" />
              <Point x={200} y={196} n={1} />
              <Point x={200} y={14} n={2} />
              <text x="214" y="30" fontSize="11" fill={INK}>
                plafond
              </text>
              <text x="214" y="190" fontSize="11" fill={INK}>
                vloer
              </text>
            </>
          )}
          {task !== "plafond" && task !== "ophang" && <Sweep />}
        </>
      )}
    </svg>
  );
}
