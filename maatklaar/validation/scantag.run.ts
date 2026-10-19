import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMERA_TASKS, measureShot, type CameraTaskId } from "@/lib/measurements/camera";
import { tooRough, type Marked } from "@/lib/measurements/photo";
import { metrologyReport, type MetrologyRecord } from "@/lib/scantag/metrology";

/**
 * Physical validation of ScanTag (docs/METROLOGIE.md). Each JSON file holds one scan as exported from the app
 * (snapped points, no photo) and the reference values from a measuring instrument. The current code measures
 * the scan again; the report shows the error distribution against the instrument.
 *
 * validation/voorbeeld/scantag-*.json: synthetic example (exact points), in Git.
 * validation/eigen/scantag/*.json: real windows, local only (gitignored).
 */
type ScanRecord = {
  naam: string;
  task: CameraTaskId;
  orientation: "auto" | "liggend" | "staand";
  reference: Marked[];
  points: Marked[];
  waarheid: Record<string, number>;
  instrument: string;
  tolerantieMm: number;
  apparaat?: string;
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

describe("ScanTag tegen een meetinstrument", () => {
  const records: (MetrologyRecord & { naam: string; maat: string; tolerantieMm: number })[] = [];
  // A file holds one scan, or a list as exported from the app; scans without reference values are skipped.
  const scans = files.flatMap((file) => {
    const data = JSON.parse(readFileSync(file, "utf8")) as ScanRecord | ScanRecord[];
    return (Array.isArray(data) ? data : [data]).filter((s) => Object.keys(s.waarheid ?? {}).length).map((scan) => ({ file, scan }));
  });
  for (const { file, scan } of scans) {
    it(scan.naam, () => {
      const r = measureShot(CAMERA_TASKS[scan.task], scan);
      for (const [maat, truth] of Object.entries(scan.waarheid)) {
        const v = r.ok ? r.values[maat as keyof typeof r.values] : undefined;
        records.push({
          naam: scan.naam,
          maat,
          truthMm: truth,
          measuredMm: v ? v.mm : null,
          uncertaintyMm: v ? v.uncertaintyMm : null,
          accepted: Boolean(v && !tooRough(v)),
          tolerantieMm: scan.tolerantieMm,
        });
      }
      if (file.includes("voorbeeld")) {
        // The synthetic example has exact points: the code must reproduce the truth.
        for (const rec of records.filter((x) => x.naam === scan.naam)) expect(Math.abs(rec.measuredMm! - rec.truthMm)).toBeLessThan(1);
      }
    });
  }

  it("rapport", () => {
    const tolerance = Math.min(...records.map((r) => r.tolerantieMm), Infinity);
    const report = metrologyReport(records, Number.isFinite(tolerance) ? tolerance : 5);
    const out = { gemaaktOp: new Date().toISOString(), scans: scans.length, metingen: records, rapport: report };
    writeFileSync(path.join(import.meta.dirname, "scantag-resultaat.json"), JSON.stringify(out, null, 2));
    console.log(
      `ScanTag: ${report.n} maten uit ${scans.length} scans · uitval ${(report.dropoutRate * 100).toFixed(1)} % · P95 ${report.p95AbsMm?.toFixed(1)} mm · P99 ${report.p99AbsMm?.toFixed(1)} mm · max ${report.maxAbsMm?.toFixed(1)} mm · dekking ${report.coverage === null ? "—" : (report.coverage * 100).toFixed(0) + " %"} · false accept ${report.falseAcceptRate === null ? "—" : (report.falseAcceptRate * 100).toFixed(1) + " %"}`,
    );
    expect(report.n).toBe(records.length);
  });
});
