import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Worker } from "tesseract.js";
import { decodePng } from "../tests/support/png";
import { createOcr, measurePlan } from "../tests/support/measure-node";

/**
 * Validation harness: runs the automatic measuring on a folder of plans and compares the results with
 * reference measurements. Per plan: `naam.png` plus `naam.json`:
 *
 *   { "pxPerM": 130, "windows": 7,
 *     "rooms": [{ "name": "Woonkamer", "areaM2": 29.44, "widthMm": 6000, "depthMm": 5600 }] }
 *
 * Reference values must come from a calibrated measurement (laser or tape in the home), not from the
 * drawing itself, or the numbers only say how well we read the drawing. Run with
 *   VALIDATIE_MAP=/pad/naar/plannen npm run validate
 * Without VALIDATIE_MAP the fictional sample in validation/voorbeeld is used (it proves the harness works,
 * not that the product is accurate). Plans of real homes are never committed.
 */
type Truth = { pxPerM?: number; windows?: number; rooms: { name: string; areaM2?: number; widthMm?: number; depthMm?: number }[] };

const dir = process.env.VALIDATIE_MAP ?? path.resolve(import.meta.dirname, "voorbeeld");
let worker: Worker;
beforeAll(async () => {
  worker = await createOcr();
}, 120_000);
afterAll(async () => {
  await worker?.terminate();
});

it("meet de plannen en vergelijkt met de referentiematen", async () => {
  const plans = readdirSync(dir).filter((f) => f.endsWith(".png") && existsSync(path.join(dir, f.replace(/\.png$/, ".json"))));
  expect(plans.length, `geen plannen met referentie gevonden in ${dir}`).toBeGreaterThan(0);
  const rows: string[] = [
    "| plan | ruimte | ref m² | gemeten m² | fout | breedte fout | diepte fout | controles |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const areaErrors: number[] = [];
  const lengthErrors: number[] = [];
  let found = 0;
  let expected = 0;
  let extra = 0;
  const scaleErrors: number[] = [];
  const windows: { plan: string; expected: number; found: number }[] = [];

  for (const file of plans) {
    const truth = JSON.parse(readFileSync(path.join(dir, file.replace(/\.png$/, ".json")), "utf8")) as Truth;
    const page = decodePng(new Uint8Array(readFileSync(path.join(dir, file))));
    const { auto } = await measurePlan(worker, page);
    const rooms = auto?.rooms ?? [];
    if (truth.pxPerM && auto?.scale) scaleErrors.push(Math.abs(1000 / auto.scale.mmPerUnit - truth.pxPerM) / truth.pxPerM);
    if (truth.windows !== undefined)
      windows.push({ plan: file, expected: truth.windows, found: auto?.openings.filter((o) => o.kind === "raam").length ?? 0 });
    const used = new Set<number>();
    for (const ref of truth.rooms) {
      expected++;
      const i = rooms.findIndex((r, k) => !used.has(k) && r.names.some((n) => n.toLowerCase() === ref.name.toLowerCase()));
      if (i < 0 || rooms[i]!.areaMm2 === null) {
        rows.push(`| ${file} | ${ref.name} | ${ref.areaM2 ?? "–"} | niet gevonden | | | | |`);
        continue;
      }
      used.add(i);
      found++;
      const r = rooms[i]!;
      const area = r.areaMm2! / 1e6;
      const err = ref.areaM2 !== undefined ? (area - ref.areaM2) / ref.areaM2 : null;
      if (err !== null) areaErrors.push(Math.abs(err));
      const dw = ref.widthMm !== undefined && r.widthMm !== null ? Math.round(r.widthMm - ref.widthMm) : null;
      const dd = ref.depthMm !== undefined && r.depthMm !== null ? Math.round(r.depthMm - ref.depthMm) : null;
      for (const d of [dw, dd]) if (d !== null) lengthErrors.push(Math.abs(d));
      rows.push(
        `| ${file} | ${ref.name} | ${ref.areaM2?.toFixed(2) ?? "–"} | ${area.toFixed(2)} | ${err === null ? "–" : `${(err * 100).toFixed(1)} %`} | ${dw ?? "–"} mm | ${dd ?? "–"} mm | ${r.ok ? "alle" : "aandacht"} |`,
      );
    }
    extra += rooms.filter((r, k) => !used.has(k) && r.names.length > 0).length;
  }

  const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1]! : NaN);
  const summary = {
    gemeten: new Date().toISOString(),
    map: dir,
    plannen: plans.length,
    ruimtesGevonden: `${found} van ${expected}`,
    extraRuimtes: extra,
    oppervlakFoutMediaan: `${(median(areaErrors) * 100).toFixed(2)} %`,
    oppervlakFoutMax: `${(Math.max(0, ...areaErrors) * 100).toFixed(2)} %`,
    lengteFoutMediaanMm: median(lengthErrors),
    lengteFoutMaxMm: Math.max(0, ...lengthErrors),
    schaalFoutMax: scaleErrors.length ? `${(Math.max(...scaleErrors) * 100).toFixed(2)} %` : "geen referentie",
    ramen: windows,
  };
  console.log(["", ...rows, "", JSON.stringify(summary, null, 2)].join("\n"));
  writeFileSync(path.join(dir, "resultaat.json"), JSON.stringify({ summary, rows }, null, 2));
}, 600_000);
