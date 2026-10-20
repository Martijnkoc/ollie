import { ImageResponse } from "next/og";
import { BRAND } from "@/config/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the mark on off-white, drawn with plain shapes so it needs no font or file. */
export default function AppleIcon() {
  const { graphite, offWhite, signal } = BRAND.colors;
  const u = 180 / 32;
  const box = (x: number, y: number, w: number, h: number, c: string) => (
    <div style={{ position: "absolute", left: x * u, top: y * u, width: w * u, height: h * u, background: c }} />
  );
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", position: "relative", display: "flex", background: offWhite }}>
      {box(5, 5, 5, 22, graphite)}
      {box(5, 22, 22, 5, graphite)}
      {box(14, 22, 0.25, 2.4, offWhite)}
      {box(18, 22, 0.25, 2.4, offWhite)}
      {box(22, 22, 0.25, 2.4, offWhite)}
      {box(15, 5, 12, 4, signal)}
      {box(23, 5, 4, 12, signal)}
    </div>,
    size,
  );
}
