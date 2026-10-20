import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MOUNTINGS, PRODUCT_FAMILIES, type Mounting, type ProductFamily } from "@/lib/measurements/schema";
import { combine } from "@/lib/measurements/ar-geometry";
import { assessShot, SCAN_TASKS, scanInputSchema, verdictFor, type ScanTarget } from "@/lib/measurements/scan";
import { scanCriteria } from "@/config/scantag";
import { metrologyReport, type MetrologyRecord } from "@/lib/scantag/metrology";

/**
 * Physical validation of ScanTag (docs/METROLOGIE.md). Each JSON file holds scans as exported from the app
 * (AR points in metres, tracking and device, no image) with the reference values from a calibrated instrument.
 * The current code measures every scan again and decides whether it would be accepted; the report gives the
 * error distribution per product family and per device against the instrument, and the false-accept rate.
 *
 * validation/voorbeeld/scantag-*.json: synthetic examples (exact points), in Git.
 * validation/eigen/scantag/*.json: real windows, local only (gitignored).
 */
type ScanRecord = {
  naam: string;
  task: keyof typeof SCAN_TASKS;
  product?: ProductFamily;
  mounting?: Mounting;
  points: unknown;
  tracking: unknown;
  device: unknown;
  waarheid: Record<string, number>;
  instrument: string;
  tolerantieMm: number;
};

const EXAMPLES = path.join(import.meta.dirname, "voorbeeld");
const OWN = path.join(import.meta.dirname, "eigen", "scantag");
const files = [
  ...readdirSync(EXAMPLES)
    .filter((f) => f.startsWith("scantag-") && f.endsWith(".json"))
    .map((f) => path.join(EXAMPLES, f)),
  ...(existsSync(OWN)
    ? readdirSync(OWN)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(OWN, f))
    : []),
];

type Row = MetrologyRecord & { naam: string; maat: string; tolerantieMm: number; product: string; apparaat: string };

describe("ScanTag tegen een gekalibreerd meetinstrument", () => {
  const records: Row[] = [];
  // A file holds one scan, or a list as exported from the app; scans without reference values are skipped.
  const scans = files.flatMap((file) => {
    const data = JSON.parse(readFileSync(file, "utf8")) as ScanRecord | ScanRecord[];
    return (Array.isArray(data) ? data : [data]).filter((s) => Object.keys(s.waarheid ?? {}).length).map((scan) => ({ file, scan }));
  });
  for (const { file, scan } of scans) {
    it(scan.naam, () => {
      const input = scanInputSchema.parse({
        id: "validatie01",
        task: scan.task,
        points: scan.points,
        tracking: scan.tracking,
        device: scan.device,
      });
      const product = PRODUCT_FAMILIES.includes(scan.product as ProductFamily) ? scan.product! : "onbekend";
      const mounting = MOUNTINGS.includes(scan.mounting as Mounting) ? scan.mounting! : "onbekend";
      const criteria = scanCriteria(product, mounting);
      const r = assessShot(SCAN_TASKS[scan.task], input, criteria);
      const apparaat = `${input.device.platform} · ${input.device.browser}`;
      for (const [maat, truth] of Object.entries(scan.waarheid)) {
        const v = r.values[maat as ScanTarget];
        const c = v ? combine([v]) : null;
        const verdict = c ? verdictFor(maat as ScanTarget, c, { product, mounting, shape: "rechthoek" }, criteria) : null;
        records.push({
          naam: scan.naam,
          maat,
          product,
          apparaat,
          truthMm: truth,
          measuredMm: v ? v.mm : null,
          uncertaintyMm: v ? v.uncertaintyMm : null,
          accepted: verdict?.status === "accepted",
          tolerantieMm: scan.tolerantieMm,
        });
      }
      if (file.includes("voorbeeld")) {
        // The synthetic examples have exact points: the code must reproduce the truth.
        for (const rec of records.filter((x) => x.naam === scan.naam)) expect(Math.abs(rec.measuredMm! - rec.truthMm)).toBeLessThan(0.01);
      }
    });
  }

  it("rapport per productfamilie en per apparaat", () => {
    const group = (key: (r: Row) => string) => {
      const out: Record<string, ReturnType<typeof metrologyReport>> = {};
      for (const k of new Set(records.map(key))) {
        const list = records.filter((r) => key(r) === k);
        out[k] = metrologyReport(list, Math.min(...list.map((r) => r.tolerantieMm)));
      }
      return out;
    };
    const tolerance = Math.min(...records.map((r) => r.tolerantieMm), Infinity);
    const report = metrologyReport(records, Number.isFinite(tolerance) ? tolerance : 5);
    const out = {
      gemaaktOp: new Date().toISOString(),
      scans: scans.length,
      totaal: report,
      perProduct: group((r) => r.product),
      perApparaat: group((r) => r.apparaat),
      metingen: records,
    };
    writeFileSync(path.join(import.meta.dirname, "scantag-resultaat.json"), JSON.stringify(out, null, 2));
    const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)} %`);
    console.log(
      `ScanTag: ${report.n} maten uit ${scans.length} scans · uitval ${pct(report.dropoutRate)} · gemiddeld ${report.meanAbsMm?.toFixed(1)} mm · P95 ${report.p95AbsMm?.toFixed(1)} mm · max ${report.maxAbsMm?.toFixed(1)} mm · dekking ${pct(report.coverage)} · foutief geaccepteerd ${pct(report.falseAcceptRate)}`,
    );
    expect(report.n).toBe(records.length);
  });
});
