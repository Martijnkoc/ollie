/**
 * Statistics for the physical validation of ScanTag (docs/METROLOGIE.md): each record compares one camera
 * value with a reference instrument. Kept apart on purpose from software tests: a green unit test says the
 * code does what it should, only these numbers on real windows say how accurate it is.
 *
 * Terms: display resolution (we show whole mm) is not repeatability (spread of repeated scans of one
 * window) is not uncertainty (the margin we report) is not error (camera value minus reference).
 */
export type MetrologyRecord = {
  /** Reference instrument value (mm). */
  truthMm: number;
  /** Camera value (mm); null when the scan gave no value (failed, needs another photo). */
  measuredMm: number | null;
  /** Reported uncertainty (mm, about 95 %). */
  uncertaintyMm: number | null;
  /** Whether ScanTag accepted the value (usable, within its limits). */
  accepted: boolean;
};

export type MetrologyReport = {
  n: number;
  /** Share of records without a value: scans that did not produce a measurement. */
  dropoutRate: number;
  meanAbsMm: number | null;
  medianAbsMm: number | null;
  p95AbsMm: number | null;
  p99AbsMm: number | null;
  maxAbsMm: number | null;
  /** Share of values whose real error lies within their reported uncertainty: should be at least 95 %. */
  coverage: number | null;
  /** Accepted although the real error exceeds the product tolerance: the critical number. */
  falseAcceptRate: number | null;
  /** Rejected although the real error was within the product tolerance. */
  falseRejectRate: number | null;
};

/** Nearest-rank percentile of sorted values. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export function metrologyReport(records: readonly MetrologyRecord[], toleranceMm: number): MetrologyReport {
  const n = records.length;
  const valued = records.filter((r) => r.measuredMm !== null);
  const errors = valued.map((r) => Math.abs(r.measuredMm! - r.truthMm)).sort((a, b) => a - b);
  const withU = valued.filter((r) => r.uncertaintyMm !== null);
  const accepted = valued.filter((r) => r.accepted);
  const rejected = records.filter((r) => !r.accepted);
  const within = (r: MetrologyRecord) => r.measuredMm !== null && Math.abs(r.measuredMm - r.truthMm) <= toleranceMm;
  return {
    n,
    dropoutRate: n ? (n - valued.length) / n : 0,
    meanAbsMm: errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : null,
    medianAbsMm: percentile(errors, 50),
    p95AbsMm: percentile(errors, 95),
    p99AbsMm: percentile(errors, 99),
    maxAbsMm: errors.length ? errors[errors.length - 1]! : null,
    coverage: withU.length ? withU.filter((r) => Math.abs(r.measuredMm! - r.truthMm) <= r.uncertaintyMm!).length / withU.length : null,
    falseAcceptRate: accepted.length ? accepted.filter((r) => !within(r)).length / accepted.length : null,
    // A scan without a value cannot be checked against the tolerance; count it as rejected but not as "within".
    falseRejectRate: rejected.length ? rejected.filter(within).length / rejected.length : null,
  };
}
