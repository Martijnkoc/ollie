import type { CameraTaskId } from "@/lib/measurements/camera";

const INK = "#1c2420";
const WALL = "#efe9dc";
const GLASS = "#dbe8ef";
const SHEET = "#ffffff";
const SHEET_EDGE = "#b98c3c";
const MEASURE = "#1f6f50";

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (x: number, y: number, ang: number) =>
    `M ${x} ${y} l ${-8 * Math.cos(ang - 0.45)} ${-8 * Math.sin(ang - 0.45)} M ${x} ${y} l ${-8 * Math.cos(ang + 0.45)} ${-8 * Math.sin(ang + 0.45)}`;
  return (
    <g stroke={MEASURE} strokeWidth={2.5} strokeLinecap="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={`${head(x2, y2, a)} ${head(x1, y1, a + Math.PI)}`} />
    </g>
  );
}

const Sheet = ({ x, y, w = 26, h = 36 }: { x: number; y: number; w?: number; h?: number }) => (
  <rect x={x} y={y} width={w} height={h} fill={SHEET} stroke={SHEET_EDGE} strokeWidth={2} />
);
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={4.5} fill={MEASURE} stroke="#fff" strokeWidth={1.5} />;

/**
 * Our own drawings of where the references go and what to tap, one per ScanTag photo. Schematic, not to
 * scale: gold = A4 sheet or bank card, green = what you tap and measure.
 */
export function ScanDiagram({ task }: { task: CameraTaskId }) {
  const label: Record<CameraTaskId, string> = {
    opening: "Twee A4-vellen naast het raam op de muur; tik de vier hoeken van de opening op de voorkant van de muur aan",
    gewenst: "Twee A4-vellen op de muur; tik de hoeken aan van waar het product komt",
    ruimte_boven: "Een A4-vel boven het raam; meet van de bovenkant van het kozijn tot het plafond",
    diepte: "Een bankpas plat tegen de zijkant van de dag; meet van de voorkant van de muur tot het glas",
    rail: "Twee A4-vellen op de muur; meet van begin tot einde van de rail",
    ophang: "Twee A4-vellen op de muur; meet links, midden en rechts van ophangpunt tot vloer",
    plafond: "Een A4-vel op de muur; meet van de vloer tot het plafond",
  };
  return (
    <svg viewBox="0 0 320 200" className="scan-diagram" role="img" aria-label={label[task]}>
      <rect width="320" height="200" fill={WALL} />
      {task === "diepte" ? (
        <>
          {/* Recess seen from the side: wall, reveal, frame with glass, a bank card flat on the reveal. */}
          <rect x="40" y="40" width="70" height="140" fill="#e0d8c6" stroke={INK} strokeWidth={2} />
          <polygon points="110,40 230,70 230,150 110,180" fill="#f6f1e6" stroke={INK} strokeWidth={2} />
          <rect x="230" y="66" width="18" height="88" fill="#fbfbf8" stroke={INK} strokeWidth={2} />
          <rect x="248" y="72" width="8" height="76" fill={GLASS} stroke={INK} strokeWidth={1} />
          <polygon points="140,95 182,105 182,128 140,120" fill={SHEET} stroke={SHEET_EDGE} strokeWidth={2} />
          <Arrow x1={112} y1={150} x2={228} y2={142} />
          <Dot x={112} y={150} />
          <Dot x={228} y={142} />
          <text x="30" y="26" fontSize="11" fill={INK}>
            voorkant muur
          </text>
          <text x="200" y="176" fontSize="11" fill={INK}>
            glas
          </text>
        </>
      ) : (
        <>
          {/* Ceiling and floor lines for the height tasks. */}
          {(task === "plafond" || task === "ophang" || task === "ruimte_boven") && (
            <>
              <line x1="0" y1="12" x2="320" y2="12" stroke="#8a8f8c" strokeWidth={2} />
              <line x1="0" y1="190" x2="320" y2="190" stroke="#8a8f8c" strokeWidth={2} />
            </>
          )}
          {task !== "plafond" && (
            <>
              <rect x="100" y="50" width="120" height="110" fill="#fbfbf8" stroke={INK} strokeWidth={2.5} />
              <rect x="110" y="60" width="100" height="90" fill={GLASS} stroke="#9fb4c1" strokeWidth={1.5} />
              <rect x="94" y="160" width="132" height="7" fill="#d8d0bf" stroke={INK} strokeWidth={1.5} />
            </>
          )}
          {task === "opening" && (
            <>
              <Sheet x={44} y={70} />
              <Sheet x={250} y={100} />
              {[
                [100, 50],
                [220, 50],
                [220, 160],
                [100, 160],
              ].map(([x, y]) => (
                <Dot key={`${x}-${y}`} x={x!} y={y!} />
              ))}
            </>
          )}
          {task === "gewenst" && (
            <>
              <Sheet x={30} y={80} />
              <Sheet x={264} y={100} />
              <rect x="84" y="38" width="152" height="134" fill="none" stroke={MEASURE} strokeWidth={2.5} strokeDasharray="7 5" />
              <Dot x={84} y={38} />
              <Dot x={236} y={38} />
              <Dot x={236} y={172} />
              <Dot x={84} y={172} />
            </>
          )}
          {task === "ruimte_boven" && (
            <>
              <Sheet x={240} y={18} w={36} h={26} />
              <Arrow x1={160} y1={48} x2={160} y2={14} />
              <Dot x={160} y={48} />
              <Dot x={160} y={14} />
            </>
          )}
          {(task === "rail" || task === "ophang") && (
            <>
              <line x1="62" y1="32" x2="258" y2="32" stroke={INK} strokeWidth={4} />
              <Sheet x={26} y={90} />
              <Sheet x={268} y={110} />
              {task === "rail" ? (
                <>
                  <Arrow x1={62} y1={24} x2={258} y2={24} />
                  <Dot x={62} y={32} />
                  <Dot x={258} y={32} />
                </>
              ) : (
                [70, 160, 250].map((x) => (
                  <g key={x}>
                    <Arrow x1={x} y1={34} x2={x} y2={188} />
                    <Dot x={x} y={34} />
                    <Dot x={x} y={188} />
                  </g>
                ))
              )}
            </>
          )}
          {task === "plafond" && (
            <>
              <Sheet x={140} y={86} />
              <Arrow x1={220} y1={188} x2={220} y2={14} />
              <Dot x={220} y={188} />
              <Dot x={220} y={14} />
              <text x="230" y="30" fontSize="11" fill={INK}>
                plafond
              </text>
              <text x="230" y="182" fontSize="11" fill={INK}>
                vloer
              </text>
            </>
          )}
        </>
      )}
    </svg>
  );
}
