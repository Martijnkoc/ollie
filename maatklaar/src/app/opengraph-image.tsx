import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";
import { PRICE } from "@/config/site";

export const alt = `${BRAND.name}: ${BRAND.promise}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link preview: the mark, the tagline and a schematic plan with measuring lines. Example drawing, no real home. */
export default function OpenGraphImage() {
  const { graphite, offWhite, signal, steel, surface } = BRAND.colors;
  const abs = (x: number, y: number, w: number, h: number, extra: Record<string, string | number> = {}) => ({
    position: "absolute" as const,
    left: x,
    top: y,
    width: w,
    height: h,
    display: "flex",
    ...extra,
  });
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: offWhite, color: graphite }}>
      {/* Mark */}
      <div style={abs(72, 72, 20, 88, { background: graphite })} />
      <div style={abs(72, 140, 88, 20, { background: graphite })} />
      <div style={abs(112, 72, 48, 16, { background: signal })} />
      <div style={abs(144, 72, 16, 48, { background: signal })} />
      <div style={abs(184, 92, 400, 60, { fontSize: 46, fontWeight: 800, letterSpacing: 8 })}>{BRAND.name.toUpperCase()}</div>
      <div style={abs(72, 220, 560, 120, { fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1 })}>{BRAND.tagline}</div>
      <div style={abs(72, 330, 540, 120, { fontSize: 30, lineHeight: 1.3, color: "#3b413d" })}>{BRAND.promise}</div>
      <div style={abs(72, 500, 600, 50, { fontSize: 26, fontWeight: 700 })}>
        {`Start gratis · Complete bestellijst ${PRICE.label} ${PRICE.period} · Geen abonnement`}
      </div>
      {/* Plan sketch with measuring lines */}
      <div style={abs(700, 110, 420, 380, { background: "#ffffff", border: `2px solid ${surface}`, borderRadius: 16 })} />
      <div style={abs(740, 150, 340, 300, { border: `10px solid ${graphite}` })} />
      <div style={abs(740, 290, 200, 10, { background: graphite })} />
      <div style={abs(930, 150, 10, 150, { background: graphite })} />
      <div style={abs(756, 166, 168, 118, { background: "#ffe8de" })} />
      <div style={abs(820, 140, 70, 20, { background: signal })} />
      <div style={abs(1070, 330, 20, 70, { background: signal })} />
      <div style={abs(740, 470, 340, 3, { background: steel })} />
      <div style={abs(738, 462, 3, 18, { background: steel })} />
      <div style={abs(1079, 462, 3, 18, { background: steel })} />
      <div style={abs(860, 478, 200, 30, { fontSize: 20, color: steel })}>voorbeeld</div>
    </div>,
    size,
  );
}
