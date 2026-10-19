import { CAMERA_MEASURE } from "@/config/site";

/**
 * Measuring in a photo with a known reference in the same plane (an A4 sheet on the glass or the wall, a bank
 * card on the side of the window recess). A perspective transform (homography) from the four reference
 * corners maps the photo onto that plane in millimetres; lengths between other points in the same plane are
 * then measured there.
 *
 * Every value carries its uncertainty: the position uncertainty of each point (tapped or found on an edge) is
 * propagated to the result, and a systematic share covers what one photo cannot show (lens distortion, a
 * reference just outside the measured plane). Results are camera measurements ("browser_scan_estimate"),
 * never order sizes.
 */
export type Pt = { x: number; y: number };

export const REFERENCES = {
  a4: { label: "A4-vel", shortMm: 210, longMm: 297 },
  // ISO/IEC 7810 ID-1: every Dutch bank card has this size.
  bankpas: { label: "bankpas", shortMm: 53.98, longMm: 85.6 },
} as const;
export type ReferenceKind = keyof typeof REFERENCES;

/** How the reference lies in the photo: chosen from the longer pair of sides unless the user says otherwise. */
export type Orientation = "auto" | "liggend" | "staand";

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

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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

/** Size of the reference in the photo's reading direction: width along corner 1→2, height along corner 1→4. */
export function referenceSize(reference: readonly Pt[], kind: ReferenceKind, orientation: Orientation = "auto") {
  const ref = REFERENCES[kind];
  const horizontal = dist(reference[0]!, reference[1]!) + dist(reference[3]!, reference[2]!);
  const vertical = dist(reference[0]!, reference[3]!) + dist(reference[1]!, reference[2]!);
  const landscape = orientation === "auto" ? horizontal >= vertical : orientation === "liggend";
  return landscape ? { w: ref.longMm, h: ref.shortMm } : { w: ref.shortMm, h: ref.longMm };
}

/** Homography from photo pixels to millimetres in the plane of the reference. */
export function planeOf(reference: readonly Pt[], size: { w: number; h: number }) {
  return homography(reference, [
    { x: 0, y: 0 },
    { x: size.w, y: 0 },
    { x: size.w, y: size.h },
    { x: 0, y: size.h },
  ]);
}

/** A point in the photo with its 1σ position uncertainty in photo pixels. */
export type Marked = Pt & { sigma: number };

export type PlaneValue = {
  mm: number;
  /** Random part at about 95 % (2σ) from the point positions. */
  randomMm: number;
  /** Assumed systematic part (CAMERA_MEASURE.systematicPercent of the value). */
  systematicMm: number;
  /** Both combined, rounded up to whole millimetres. */
  uncertaintyMm: number;
};

// Photo pixels and plane millimetres are scaled to numbers around 1 for a well-conditioned fit.
const PX = 1000;
const MM = 1000;

type Reference = { corners: readonly Marked[]; size: { w: number; h: number } };
export type PlaneFit = {
  /** Fitted parameters: plane→photo homography (8) and the pose (x, y, angle) of every further reference. */
  params: number[];
  toPlane: (p: Pt) => Pt;
  /**
   * How well several references fit together, as the residual in units of their point uncertainty (about 1
   * when all is well). Much higher: a sheet is not flat, not in the measured plane, or tapped wrongly.
   * Null with one reference: four corners always fit exactly.
   */
  consistency: number | null;
};

const canonical = (size: { w: number; h: number }): Pt[] => [
  { x: 0, y: 0 },
  { x: size.w / MM, y: 0 },
  { x: size.w / MM, y: size.h / MM },
  { x: 0, y: size.h / MM },
];
const norm = (p: Pt): Pt => ({ x: p.x / PX, y: p.y / PX });
const place = (pose: readonly number[], c: Pt): Pt => {
  const cos = Math.cos(pose[2]!);
  const sin = Math.sin(pose[2]!);
  return { x: pose[0]! + cos * c.x - sin * c.y, y: pose[1]! + sin * c.x + cos * c.y };
};

function invert(h: readonly number[]): number[] | null {
  const [a, b, c, d, e, f, g, k, i] = h as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * k;
  const B = -(d * i - f * g);
  const C = d * k - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const r = [A, -(b * i - c * k), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * k - b * g), a * e - b * d].map(
    (v) => v / det,
  );
  return r.map((v) => v / r[8]!);
}

/**
 * The plane in the photo, fitted to one or more references of known size. One reference: the homography
 * through its four corners. Several: their positions relative to each other are unknown and solved for
 * together with the homography (Levenberg–Marquardt, residuals weighted by each point's uncertainty).
 * Because their known shapes must fit at different places in the photo, the perspective comes out far better
 * than from one small sheet: the reason to tape a sheet on each side of a window.
 */
export function fitPlane(refs: readonly Reference[], init?: readonly number[]): PlaneFit | null {
  if (!refs.length) return null;
  const obs = refs.map((r) => r.corners.map(norm));
  const first = homography(canonical(refs[0]!.size), obs[0]!);
  if (!first) return null;
  let params: number[];
  // One reference: the exact homography through its corners. Several: start from the given solution if any.
  if (refs.length > 1 && init?.length === 8 + 3 * (refs.length - 1)) params = [...init];
  else {
    params = first.slice(0, 8);
    const back = invert(first);
    if (!back) return null;
    for (const o of obs.slice(1)) {
      const q = o.map((p) => project(back, p));
      params.push(q[0]!.x, q[0]!.y, Math.atan2(q[1]!.y - q[0]!.y, q[1]!.x - q[0]!.x));
    }
  }

  const residuals = (p: readonly number[]) => {
    const g = [...p.slice(0, 8), 1];
    const out: number[] = [];
    refs.forEach((r, k) => {
      const pose = k === 0 ? [0, 0, 0] : p.slice(8 + 3 * (k - 1), 11 + 3 * (k - 1));
      canonical(r.size).forEach((c, i) => {
        const at = project(g, place(pose, c));
        const sigma = Math.max(r.corners[i]!.sigma, 0.05) / PX;
        out.push((at.x - obs[k]![i]!.x) / sigma, (at.y - obs[k]![i]!.y) / sigma);
      });
    });
    return out;
  };
  const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

  if (refs.length > 1) {
    const n = params.length;
    let r = residuals(params);
    let c = cost(r);
    let lambda = 1e-3;
    for (let it = 0; it < 60; it++) {
      const J: number[][] = r.map(() => new Array<number>(n).fill(0));
      for (let k = 0; k < n; k++) {
        const d = 1e-7 * Math.max(1, Math.abs(params[k]!));
        const moved = [...params];
        moved[k]! += d;
        const r1 = residuals(moved);
        for (let m = 0; m < r.length; m++) J[m]![k] = (r1[m]! - r[m]!) / d;
      }
      const JtJ = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const Jtr = new Array<number>(n).fill(0);
      for (let m = 0; m < r.length; m++)
        for (let a = 0; a < n; a++) {
          Jtr[a]! -= J[m]![a]! * r[m]!;
          for (let b = 0; b < n; b++) JtJ[a]![b]! += J[m]![a]! * J[m]![b]!;
        }
      let improved = false;
      for (let tries = 0; tries < 8 && !improved; tries++) {
        const damped = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
        const step = solve(damped, Jtr);
        if (!step) break;
        const next = params.map((v, k) => v + step[k]!);
        const rn = residuals(next);
        const cn = cost(rn);
        if (cn < c) {
          const done = c - cn < 1e-12 * Math.max(1, c);
          params = next;
          r = rn;
          c = cn;
          lambda = Math.max(lambda / 10, 1e-9);
          improved = true;
          if (done) it = 60;
        } else lambda *= 10;
      }
      if (!improved) break;
    }
  }

  const g = [...params.slice(0, 8), 1];
  const back = invert(g);
  if (!back) return null;
  const dof = 8 * refs.length - params.length;
  const consistency = dof > 0 ? Math.sqrt(cost(residuals(params)) / dof) : null;
  return {
    params,
    consistency,
    toPlane: (p) => {
      const q = project(back, norm(p));
      return { x: q.x * MM, y: q.y * MM };
    },
  };
}

export type Shape = { kind: "rect" } | { kind: "lines"; count: number };

/** The values a shape yields, in a fixed order. A rectangle: four sides plus the two middle spans. */
export const RECT_VALUES = ["boven", "midden_breedte", "onder", "links", "midden_hoogte", "rechts"] as const;

function shapeValues(toPlane: (p: Pt) => Pt, shape: Shape, marks: readonly Pt[]): number[] {
  const o = marks.map(toPlane);
  if (shape.kind === "rect") {
    const [tl, tr, br, bl] = o as [Pt, Pt, Pt, Pt];
    // The middle spans join the midpoints of opposite sides: derived from the corners (straight sides assumed).
    return [dist(tl, tr), dist(mid(tl, bl), mid(tr, br)), dist(bl, br), dist(tl, bl), dist(mid(tl, tr), mid(bl, br)), dist(tr, br)];
  }
  const out: number[] = [];
  for (let i = 0; i < shape.count; i++) out.push(dist(o[2 * i]!, o[2 * i + 1]!));
  return out;
}

export type PlaneMeasurement =
  { ok: true; values: PlaneValue[]; referencePx: number; consistency: number | null } | { ok: false; reason: string };

/** Beyond this, the references cannot all be flat in one plane and correctly tapped. */
const INCONSISTENT = 12;

/**
 * Measures a rectangle (four corners: top-left, top-right, bottom-right, bottom-left) or line segments (pairs
 * of points) in the plane of one or more references; each reference's corners go in the same order.
 */
export function measureInPlane(
  references: readonly (readonly Marked[])[],
  kind: ReferenceKind,
  shape: Shape,
  marks: readonly Marked[],
  opts: { orientation?: Orientation; minMm?: number; maxMm?: number } = {},
): PlaneMeasurement {
  const ref = REFERENCES[kind];
  if (!references.length || references.some((q) => !isConvexQuad(q)))
    return { ok: false, reason: `Tik de vier hoeken van elk ${ref.label} rondom aan, in de aangegeven volgorde.` };
  const need = shape.kind === "rect" ? 4 : shape.count * 2;
  if (marks.length !== need) return { ok: false, reason: "Nog niet alle punten zijn aangetikt." };
  if (shape.kind === "rect" && !isConvexQuad(marks))
    return { ok: false, reason: "Tik de vier hoeken rondom aan, in de aangegeven volgorde." };
  if (shape.kind === "lines" && marks.some((p, i) => i % 2 === 1 && dist(p, marks[i - 1]!) < 4))
    return { ok: false, reason: "Begin- en eindpunt van een maat liggen op dezelfde plek." };

  const refs = references.map((corners) => ({ corners, size: referenceSize(corners, kind, opts.orientation) }));
  const fit = fitPlane(refs);
  if (!fit) return { ok: false, reason: "Met deze hoeken kunnen we niet rekenen. Tik ze opnieuw aan." };
  if (fit.consistency !== null && fit.consistency > INCONSISTENT)
    return {
      ok: false,
      reason: `De ${kind === "a4" ? "A4-vellen" : "referenties"} passen niet bij elkaar. Liggen ze allebei plat in hetzelfde vlak, en zijn de hoeken in de goede volgorde aangetikt?`,
    };
  const base = shapeValues(fit.toPlane, shape, marks);
  const minMm = opts.minMm ?? 100;
  const maxMm = opts.maxMm ?? 10_000;
  if (base.some((v) => !Number.isFinite(v) || v < minMm || v > maxMm))
    return {
      ok: false,
      reason: `De uitkomst is niet aannemelijk. Controleer of je de hoeken van het ${ref.label} en de meetpunten goed hebt aangetikt.`,
    };

  // Propagate every point's position uncertainty by finite differences: variance per value, summed over all
  // coordinates. Reference corners act through the fitted plane, measuring points directly.
  const variance = base.map(() => 0);
  const step = 0.5;
  refs.forEach((r, k) => {
    r.corners.forEach((p, i) => {
      for (const axis of ["x", "y"] as const) {
        const moved = refs.map((x, j) =>
          j === k ? { ...x, corners: x.corners.map((c, ci) => (ci === i ? { ...c, [axis]: c[axis] + step } : c)) } : x,
        );
        const f = fitPlane(moved, fit.params);
        if (!f) continue;
        shapeValues(f.toPlane, shape, marks).forEach((v, n) => (variance[n]! += ((v - base[n]!) / step) ** 2 * p.sigma ** 2));
      }
    });
  });
  marks.forEach((p, i) => {
    for (const axis of ["x", "y"] as const) {
      const moved = marks.map((m, j) => (j === i ? { ...m, [axis]: m[axis] + step } : m));
      shapeValues(fit.toPlane, shape, moved).forEach((v, n) => (variance[n]! += ((v - base[n]!) / step) ** 2 * p.sigma ** 2));
    }
  });
  // References that fit together worse than their point uncertainty says: widen the margin accordingly.
  const inflate = Math.max(1, fit.consistency ?? 1);
  const values = base.map((mm, k): PlaneValue => {
    const randomMm = 2 * Math.sqrt(variance[k]!) * inflate;
    const systematicMm = (mm * CAMERA_MEASURE.systematicPercent) / 100;
    return { mm, randomMm, systematicMm, uncertaintyMm: Math.ceil(Math.hypot(randomMm, systematicMm)) };
  });
  const referencePx = Math.min(...references.flatMap((q) => q.map((p, i) => dist(p, q[(i + 1) % 4]!))));
  return { ok: true, values, referencePx, consistency: fit.consistency };
}

export type Combined = {
  mm: number;
  uncertaintyMm: number;
  shots: number;
  /** Largest difference between the photos. */
  spreadMm: number;
  /** Every pair of photos agrees within their combined uncertainty. */
  agree: boolean;
};

/**
 * Combines the same value from several photos. The mean is used only when the photos agree; the random part
 * shrinks with more photos but never below half their spread, the systematic part does not shrink.
 */
export function combine(list: readonly PlaneValue[]): Combined | null {
  if (!list.length) return null;
  const n = list.length;
  const mm = list.reduce((s, v) => s + v.mm, 0) / n;
  const values = list.map((v) => v.mm);
  const spreadMm = Math.max(...values) - Math.min(...values);
  let agree = true;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(list[i]!.mm - list[j]!.mm) > Math.hypot(list[i]!.randomMm, list[j]!.randomMm) + 1) agree = false;
  const random = Math.max(Math.sqrt(list.reduce((s, v) => s + v.randomMm ** 2, 0)) / n, spreadMm / 2);
  const systematic = list.reduce((s, v) => s + v.systematicMm, 0) / n;
  return { mm, uncertaintyMm: Math.ceil(Math.hypot(random, systematic)), shots: n, spreadMm, agree };
}

/** Too uncertain to use as a measurement. */
export function tooRough(value: { mm: number; uncertaintyMm: number }) {
  return value.uncertaintyMm > value.mm * CAMERA_MEASURE.maxRelativeUncertainty;
}

// ---------------------------------------------------------------------------------------------------------
// The first photo assistant (one photo, four taps on an A4 sheet and four on the opening). Kept so that
// windows estimated with it still show their estimate in the report.

export type PhotoEstimate = {
  topMm: number;
  bottomMm: number;
  leftMm: number;
  rightMm: number;
  /** Largest change of any of the four values when a tapped corner is 2 px off: the tap uncertainty. */
  uncertaintyMm: number;
};

function measure(reference: readonly Pt[], refSize: { w: number; h: number }, opening: readonly Pt[]) {
  const h = planeOf(reference, refSize);
  if (!h) return null;
  const o = opening.map((p) => project(h, p));
  return { topMm: dist(o[0]!, o[1]!), bottomMm: dist(o[3]!, o[2]!), leftMm: dist(o[0]!, o[3]!), rightMm: dist(o[1]!, o[2]!) };
}

/** Corners in tap order: top-left, top-right, bottom-right, bottom-left (as seen in the photo). */
export function estimateOpening(
  reference: readonly Pt[],
  opening: readonly Pt[],
  kind: ReferenceKind = "a4",
): { ok: true; estimate: PhotoEstimate } | { ok: false; reason: string } {
  if (!isConvexQuad(reference)) return { ok: false, reason: "Tik de vier hoeken van het A4-vel rondom aan, in de aangegeven volgorde." };
  if (!isConvexQuad(opening)) return { ok: false, reason: "Tik de vier hoeken van de raamopening rondom aan, in de aangegeven volgorde." };
  const size = referenceSize(reference, kind);
  const base = measure(reference, size, opening);
  if (!base) return { ok: false, reason: "Met deze hoeken kunnen we niet rekenen. Tik ze opnieuw aan." };
  const values = [base.topMm, base.bottomMm, base.leftMm, base.rightMm];
  if (values.some((v) => !Number.isFinite(v) || v < 100 || v > 10_000))
    return {
      ok: false,
      reason: "De uitkomst is niet aannemelijk. Controleer of je de hoeken van het vel en van het raam goed hebt aangetikt.",
    };

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
