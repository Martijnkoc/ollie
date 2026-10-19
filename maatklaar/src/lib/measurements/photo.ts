/**
 * Size estimate of a window opening from one photo with a known reference in the same plane (an A4 sheet
 * taped flat on the glass or frame). A perspective transform (homography) from the four sheet corners maps
 * the photo onto the wall plane in millimetres; the four corners of the opening are then measured there.
 *
 * Honest limits, shown with every result: the reference must lie in the plane of the opening, the corners
 * must be tapped accurately, and lens distortion is not corrected. The result is an estimate
 * ("browser_scan_estimate"), never an order size and never copied into the tape measurements.
 */
export type Pt = { x: number; y: number };

export const REFERENCES = {
  a4: { label: "A4-vel", shortMm: 210, longMm: 297 },
} as const;
export type ReferenceKind = keyof typeof REFERENCES;

/** Solves A·x = b (n×n) by Gaussian elimination with partial pivoting; null when singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** 3×3 homography (row-major, h33 = 1) mapping four points `from` onto four points `to`. */
export function homography(from: readonly Pt[], to: readonly Pt[]): number[] | null {
  if (from.length !== 4 || to.length !== 4) return null;
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  return h ? [...h, 1] : null;
}

export function project(h: readonly number[], p: Pt): Pt {
  const w = h[6]! * p.x + h[7]! * p.y + h[8]!;
  return { x: (h[0]! * p.x + h[1]! * p.y + h[2]!) / w, y: (h[3]! * p.x + h[4]! * p.y + h[5]!) / w };
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** True for a simple convex quadrilateral given in order (both windings accepted). */
export function isConvexQuad(q: readonly Pt[]) {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign === 0) sign = Math.sign(z);
    else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

export type PhotoEstimate = {
  /** Widths along the top and bottom edge, heights along the left and right edge (mm). */
  topMm: number;
  bottomMm: number;
  leftMm: number;
  rightMm: number;
  /** Largest change of any of the four values when a tapped corner is 2 px off: the tap uncertainty. */
  uncertaintyMm: number;
};

function measure(reference: readonly Pt[], refSize: { w: number; h: number }, opening: readonly Pt[]) {
  const target = [
    { x: 0, y: 0 },
    { x: refSize.w, y: 0 },
    { x: refSize.w, y: refSize.h },
    { x: 0, y: refSize.h },
  ];
  const h = homography(reference, target);
  if (!h) return null;
  const o = opening.map((p) => project(h, p));
  return { topMm: dist(o[0]!, o[1]!), bottomMm: dist(o[3]!, o[2]!), leftMm: dist(o[0]!, o[3]!), rightMm: dist(o[1]!, o[2]!) };
}

/**
 * Corners in tap order: top-left, top-right, bottom-right, bottom-left (as seen in the photo).
 * The sheet may lie portrait or landscape; its orientation follows from the longer pair of sides.
 */
export function estimateOpening(
  reference: readonly Pt[],
  opening: readonly Pt[],
  kind: ReferenceKind = "a4",
): { ok: true; estimate: PhotoEstimate } | { ok: false; reason: string } {
  if (!isConvexQuad(reference)) return { ok: false, reason: "Tik de vier hoeken van het A4-vel rondom aan, in de aangegeven volgorde." };
  if (!isConvexQuad(opening)) return { ok: false, reason: "Tik de vier hoeken van de raamopening rondom aan, in de aangegeven volgorde." };
  const ref = REFERENCES[kind];
  const horizontal = dist(reference[0]!, reference[1]!) + dist(reference[3]!, reference[2]!);
  const vertical = dist(reference[0]!, reference[3]!) + dist(reference[1]!, reference[2]!);
  const size = horizontal >= vertical ? { w: ref.longMm, h: ref.shortMm } : { w: ref.shortMm, h: ref.longMm };
  const base = measure(reference, size, opening);
  if (!base) return { ok: false, reason: "Met deze hoeken kunnen we niet rekenen. Tik ze opnieuw aan." };
  const values = [base.topMm, base.bottomMm, base.leftMm, base.rightMm];
  if (values.some((v) => !Number.isFinite(v) || v < 100 || v > 10_000))
    return {
      ok: false,
      reason: "De uitkomst is niet aannemelijk. Controleer of je de hoeken van het vel en van het raam goed hebt aangetikt.",
    };

  // Tap uncertainty: move each tapped corner 2 px in four directions and see how far the result moves.
  let worst = 0;
  const steps = [
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
  ];
  for (const which of ["reference", "opening"] as const) {
    for (let i = 0; i < 4; i++) {
      for (const d of steps) {
        const r = which === "reference" ? reference.map((p, j) => (j === i ? { x: p.x + d.x, y: p.y + d.y } : p)) : reference;
        const o = which === "opening" ? opening.map((p, j) => (j === i ? { x: p.x + d.x, y: p.y + d.y } : p)) : opening;
        const m = measure(r, size, o);
        if (!m) continue;
        const moved = [m.topMm, m.bottomMm, m.leftMm, m.rightMm];
        moved.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - values[k]!))));
      }
    }
  }
  return { ok: true, estimate: { ...base, uncertaintyMm: Math.ceil(worst) } };
}

/** Compares a tape measurement with the photo estimate; a large gap means one of the two is off. */
export function compareWithPhoto(measuredMm: number, estimateMm: number, uncertaintyMm: number) {
  const gap = Math.abs(measuredMm - estimateMm);
  return { gapMm: Math.round(gap), agrees: gap <= Math.max(uncertaintyMm * 2, estimateMm * 0.03) };
}
