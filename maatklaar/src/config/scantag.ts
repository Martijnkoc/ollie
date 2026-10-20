import type { Mounting, ProductFamily } from "@/lib/measurements/schema";

/**
 * ScanTag measures with the phone's own AR tracking (WebXR hit-test): every point is a 3D position in metres
 * that the device's motion tracking and surface detection found, not a pixel. Nothing printed or placed on the
 * wall. A browser or device without that metric tracking gets no camera measurement at all.
 *
 * The uncertainty model below is an ASSUMPTION until the physical validation in docs/METROLOGIE.md has replaced
 * it with measured numbers. It is shown with every value. Per point (1σ): the jitter of the hit over the captured
 * frames, combined with a tracking error that grows with the distance to the phone. Per length: a share for the
 * scale error of the tracking, which no single scan can reveal.
 */
export const AR_MEASURE = {
  /** Tracking and surface-fit error of one point at zero distance, 1σ, mm. */
  baseSigmaMm: 2,
  /** Extra point error per metre between phone and point, 1σ, mm. */
  sigmaPerMetreMm: 2,
  /** Scale error of the motion tracking, as a share of the measured length (%). */
  scalePercent: 1,
  /** Frames averaged per point while the phone is held still. */
  framesPerPoint: 20,
  /** Closest distance the tracking can still find a surface at: used to tell "come closer" from "cannot". */
  closestRangeM: 0.4,
};

/**
 * Quality criteria per product: when a scan must be taken again and when a measurement may count for an order.
 * The numbers are STARTING VALUES. They decide "opnieuw scannen" (fixable) versus "niet geschikt om op te bestellen"
 * (this sensor cannot), but a measurement is only "accepted" for an order once `validated` is filled in for that
 * product from the validation report: false-accept rate, mean and maximum error against a calibrated reference.
 */
export type ScanCriteria = {
  /** Largest uncertainty (mm, ~95 %) a measurement may have for this product. */
  maxUncertaintyMm: number;
  /** Largest jitter of one point over its frames (RMS, mm): above it the phone moved or the surface was not found. */
  maxPointSpreadMm: number;
  /** Fewest frames per point. */
  minFramesPerPoint: number;
  /** Four corners must lie in one plane within this (mm). One corner 25 mm off (on the glass) already exceeds 6. */
  maxPlaneResidualMm: number;
  /** A corner of the opening may deviate this much from a right angle before we ask for the corners again (°). */
  maxCornerAngleDeg: number;
  /** Share of capture frames in which the phone lost its tracking. */
  maxTrackingLoss: number;
  /** Where the device also gives a depth map: largest difference between hit distance and depth (mm). */
  maxDepthDisagreementMm: number;
  /** Filled in only from a validation report (docs/METROLOGIE.md); null = nothing is accepted for ordering yet. */
  validated: null | {
    on: string;
    report: string;
    scans: number;
    falseAcceptRate: number;
    meanAbsErrorMm: number;
    maxAbsErrorMm: number;
  };
};

const BASE: Omit<ScanCriteria, "maxUncertaintyMm"> = {
  maxPointSpreadMm: 6,
  minFramesPerPoint: 10,
  maxPlaneResidualMm: 6,
  maxCornerAngleDeg: 3,
  maxTrackingLoss: 0.1,
  maxDepthDisagreementMm: 40,
  validated: null,
};

/** Products that hang inside the opening need the tightest margins; curtains on a rail are more forgiving. */
const MAX_UNCERTAINTY_MM: Record<ProductFamily, number> = {
  rolgordijn: 4,
  plisse: 4,
  jaloezie: 4,
  verticale_jaloezie: 8,
  vouwgordijn: 6,
  wave: 10,
  gordijn: 20,
  dakraam: 3,
  rolluik: 4,
  onbekend: 4,
};

/** On the frame or on the wall, an opening is covered with overlap: the margin may be wider than in the recess. */
const ON_THE_WALL: readonly Mounting[] = ["op-de-dag", "plafond", "wand"];

export function scanCriteria(product: ProductFamily, mounting: Mounting): ScanCriteria {
  const max = MAX_UNCERTAINTY_MM[product];
  return { ...BASE, maxUncertaintyMm: ON_THE_WALL.includes(mounting) ? Math.max(max, 10) : max };
}
