import type { ProjectComputation } from "@/lib/projects/compute";
import { MEASURE_INFO } from "@/lib/measurements/schema";
import { WINDOW_STATUS_LABELS } from "@/lib/measurements/evaluate";
import { STATUS_META } from "@/lib/projects/status";
import { roomName } from "@/lib/projects/compute";

/** Dutch spreadsheet conventions: semicolon separator, decimal comma, UTF-8 with BOM. */
const num = (n: number, decimals = 2) => n.toFixed(decimals).replace(".", ",");

function field(v: string | number | null) {
  const s = v === null ? "" : String(v);
  // Neutralise spreadsheet formula injection from user-entered names.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(c: ProjectComputation, opts: { demo: boolean }): string {
  const rows: (string | number | null)[][] = [["Categorie", "Omschrijving", "Hoeveelheid", "Eenheid", "Status", "Toelichting"]];
  if (opts.demo) rows.push(["Let op", "DEMO - niet betaald", null, null, null, "Gemaakt met een nagebootste betaling"]);

  for (const r of c.rooms) {
    rows.push([
      "Vloer per ruimte",
      roomName(r.room),
      r.netAreaMm2 === null ? null : num(r.netAreaMm2 / 1_000_000),
      "m2",
      STATUS_META[r.status].label,
      r.room.includeFloor ? "meegeteld" : "niet meegeteld",
    ]);
  }
  const f = c.floor;
  rows.push([
    "Vloer totaal",
    "Geselecteerd netto",
    num(f.selectedNetM2),
    "m2",
    STATUS_META[f.status].label,
    f.incompleteRooms.length ? `onvolledig: ${f.incompleteRooms.join(", ")}` : "",
  ]);
  rows.push([
    "Vloer totaal",
    `Benodigd met ${num(f.wastePercent, 1)}% snijverlies`,
    f.requiredM2 === null ? null : num(f.requiredM2),
    "m2",
    STATUS_META[f.status].label,
    "",
  ]);
  if (f.packs !== null && f.packM2 !== null)
    rows.push(["Vloer totaal", `Pakken van ${num(f.packM2, 3)} m2`, f.packs, "pakken", STATUS_META[f.status].label, "naar boven afgerond"]);

  const p = c.plinths;
  for (const r of p.rooms)
    rows.push([
      "Plinten per ruimte",
      r.name,
      r.netMm === null ? null : num(r.netMm / 1000),
      "m",
      STATUS_META[r.status].label,
      r.unconfirmedDoors ? "deuropening(en) niet bevestigd" : "",
    ]);
  rows.push([
    "Plinten totaal",
    `Benodigd met ${num(p.marginPercent, 1)}% marge`,
    p.requiredMm === null ? null : num(p.requiredMm / 1000),
    "m",
    STATUS_META[p.status].label,
    "",
  ]);
  if (p.piecesByTotal !== null && p.pieceLengthMm !== null)
    rows.push([
      "Plinten totaal",
      `Lengtes van ${num(p.pieceLengthMm / 1000)} m`,
      p.piecesByTotal,
      "stuks",
      STATUS_META[p.status].label,
      "",
    ]);

  for (const { window: w, rule, evaluation: e, roomName: rn } of c.windows) {
    for (const k of [...rule.required, ...rule.optional]) {
      rows.push([
        `Raam ${w.code}`,
        `${MEASURE_INFO[k].label}${rn ? ` (${rn})` : ""}`,
        w.measures[k] ?? null,
        "mm",
        WINDOW_STATUS_LABELS[e.status],
        "ruwe maat",
      ]);
    }
    rows.push([
      `Raam ${w.code}`,
      "Bestelmaat (breedte x hoogte)",
      e.order ? `${e.order.widthMm} x ${e.order.heightMm}` : null,
      "mm",
      WINDOW_STATUS_LABELS[e.status],
      e.order ? `${rule.title} v${rule.version}` : "volgens meetinstructie leverancier",
    ]);
  }
  return "﻿" + rows.map((r) => r.map(field).join(";")).join("\r\n") + "\r\n";
}
