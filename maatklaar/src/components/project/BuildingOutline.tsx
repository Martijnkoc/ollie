import type { Building } from "@/lib/address/types";

/**
 * Draws the BAG outline of the building (WGS84) as a simple shape, projected locally to metres.
 * No map tiles and no invented interior: just the registered contour and the address point.
 */
export function BuildingOutline({
  outline,
  point,
}: {
  outline: NonNullable<NonNullable<Building["pand"]>["outline"]>;
  point: { lat: number; lon: number } | null;
}) {
  const all = outline.flat();
  const lat0 = all.reduce((s, [, lat]) => s + lat, 0) / all.length;
  const lon0 = all.reduce((s, [lon]) => s + lon, 0) / all.length;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  // Local metres around the centre: SVG uses 32-bit floats, absolute coordinates would lose precision.
  const project = ([lon, lat]: [number, number]) => [(lon - lon0) * mPerDegLon, -(lat - lat0) * mPerDegLat] as const;
  const xy = all.map(project);
  const minX = Math.min(...xy.map((p) => p[0]));
  const maxX = Math.max(...xy.map((p) => p[0]));
  const minY = Math.min(...xy.map((p) => p[1]));
  const maxY = Math.max(...xy.map((p) => p[1]));
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const pad = Math.max(w, h) * 0.12;
  const view = `${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`;
  const stroke = Math.max(w, h) / 120;
  const dot = point ? project([point.lon, point.lat]) : null;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={view}
        role="img"
        aria-label={`Contour van het gebouw, ongeveer ${Math.round(w)} bij ${Math.round(h)} meter`}
        style={{ width: "100%", maxHeight: 220 }}
      >
        {outline.map((ring, i) => (
          <polygon
            key={i}
            points={ring.map((c) => project(c).join(",")).join(" ")}
            fill="rgba(43,106,80,0.16)"
            stroke="#1f4d3a"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
        ))}
        {dot ? <circle cx={dot[0]} cy={dot[1]} r={stroke * 3} fill="#b98c3c" /> : null}
      </svg>
      <figcaption className="tiny muted">
        Contour van het hele gebouw (BAG). Het punt is je adres. Dit zegt niets over de indeling binnen.
      </figcaption>
    </figure>
  );
}
