import {
  CHECK_INFO,
  MEASURE_GROUPS,
  MEASURE_INFO,
  type CheckKey,
  type MeasureGroup,
  type MeasureKey,
  type MeasurementRuleSet,
} from "./schema";
import { formatMm } from "@/lib/format";
import type { MeasureSource } from "./camera";

export type WindowMeasurements = {
  /** Raw measurements in whole millimetres, exactly as entered. */
  measures: Partial<Record<MeasureKey, number>>;
  /** Answers to the obstacle checks: true = yes, present; false = no; missing = not answered yet. */
  checks: Partial<Record<CheckKey, boolean>>;
  /**
   * Per measuring group, the values the user re-measured and declared correct despite a spread above the
   * threshold (see `groupSignature`). Changing any value of that group makes the acknowledgement lapse.
   */
  acknowledged: Partial<Record<MeasureGroup, string>>;
  /** The user reviewed all values for this window. */
  confirmed: boolean;
  /** Curtains only: fullness factor chosen by the user (e.g. 2 for twice the rail width). Never a default. */
  fullness: number | null;
  /** Measurements that came from the camera, with their uncertainty. Absent: typed in. */
  sources?: Partial<Record<MeasureKey, MeasureSource>>;
};

/** Status of the opening measurements (the order size has its own status, see src/lib/rules/engine.ts). */
export type WindowStatus = "nog-meten" | "afwijking" | "ingevoerd" | "bevestigd";

export const WINDOW_STATUS_LABELS: Record<WindowStatus, string> = {
  "nog-meten": "Nog meten",
  afwijking: "Afwijking controleren",
  ingevoerd: "Ingevoerd",
  bevestigd: "Door jou bevestigd",
};

/** Fingerprint of the measured values of one group, e.g. "1203|1201|1195". */
export function groupSignature(values: readonly { mm: number }[]) {
  return values.map((v) => v.mm).join("|");
}

export type GroupResult = {
  group: MeasureGroup;
  values: { key: MeasureKey; mm: number }[];
  minMm: number;
  maxMm: number;
  spreadMm: number;
  toleranceMm: number;
  exceeds: boolean;
  /** The spread exceeds the threshold and the user confirmed exactly these values. */
  acknowledged: boolean;
};

export type WindowEvaluation = {
  status: WindowStatus;
  missing: MeasureKey[];
  groups: GroupResult[];
  depth: { mm: number | null; minMm: number | null; ok: boolean | null };
  checksOpen: CheckKey[];
  checksPresent: CheckKey[];
  /** Curtains: rail width × the fullness the user chose. Labelled as derived from their choice. */
  fabricWidthMm: number | null;
  /** Measurements of this rule that came from the camera, and their largest uncertainty. */
  camera: { keys: MeasureKey[]; maxUncertaintyMm: number } | null;
  warnings: string[];
};

export function evaluateWindow(input: WindowMeasurements, rule: MeasurementRuleSet): WindowEvaluation {
  const relevant = new Set<MeasureKey>([...rule.required, ...rule.optional]);
  const value = (k: MeasureKey) => {
    const v = input.measures[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };

  const missing = rule.required.filter((k) => value(k) === null);

  const groups: GroupResult[] = [];
  for (const [group, keys] of Object.entries(MEASURE_GROUPS) as [MeasureGroup, readonly MeasureKey[]][]) {
    const values = keys.filter((k) => relevant.has(k) && value(k) !== null).map((k) => ({ key: k, mm: value(k)! }));
    if (values.length < 2) continue;
    const minMm = Math.min(...values.map((v) => v.mm));
    const maxMm = Math.max(...values.map((v) => v.mm));
    // Camera values differ by up to their uncertainty without the opening being uneven: never warn below it.
    const cameraMm = Math.max(0, ...values.map((v) => input.sources?.[v.key]?.uncertaintyMm ?? 0));
    const toleranceMm = Math.max(rule.toleranceMm[group], cameraMm);
    const exceeds = maxMm - minMm > toleranceMm;
    groups.push({
      group,
      values,
      minMm,
      maxMm,
      spreadMm: maxMm - minMm,
      toleranceMm,
      exceeds,
      acknowledged: exceeds && input.acknowledged[group] === groupSignature(values),
    });
  }
  const deviating = groups.filter((g) => g.exceeds && !g.acknowledged);

  const depthMm = relevant.has("diepte") ? value("diepte") : null;
  const depth = {
    mm: depthMm,
    minMm: rule.minDepthMm,
    ok: rule.minDepthMm === null || depthMm === null ? null : depthMm >= rule.minDepthMm,
  };

  const checksOpen = rule.checks.filter((c) => input.checks[c] === undefined);
  const checksPresent = rule.checks.filter((c) => input.checks[c] === true);

  const cameraKeys = [...relevant].filter((k) => value(k) !== null && input.sources?.[k]);
  const camera = cameraKeys.length
    ? { keys: cameraKeys, maxUncertaintyMm: Math.max(...cameraKeys.map((k) => input.sources![k]!.uncertaintyMm)) }
    : null;

  const warnings = [...rule.warnings];
  if (camera) {
    warnings.push(
      `${camera.keys.length === 1 ? "Eén maat is" : `${camera.keys.length} maten zijn`} met de camera gemeten, met een foutmarge tot ±${formatMm(camera.maxUncertaintyMm)}. Geef je leverancier de maat én de foutmarge.`,
    );
    if (rule.mounting === "in-de-dag" || rule.mounting === "inbouw" || rule.mounting === "voorzet")
      warnings.push(
        "Moet het product tussen twee muren passen? Reken dan met de kleinste maat min de foutmarge (de ondergrens op je meetblad), of laat je leverancier dat beoordelen.",
      );
  }
  for (const g of groups.filter((x) => x.exceeds)) {
    warnings.push(
      g.acknowledged
        ? `De ${g.group} verschilt ${formatMm(g.spreadMm)} tussen je meetpunten (drempel ${formatMm(g.toleranceMm)}); je hebt opnieuw gemeten en bevestigd dat dit klopt.`
        : `De ${g.group} verschilt ${formatMm(g.spreadMm)} tussen je meetpunten (drempel ${formatMm(g.toleranceMm)}). Meet opnieuw; als het klopt, bevestig het verschil.`,
    );
  }
  for (const c of checksPresent) warnings.push(`${CHECK_INFO[c].question} Ja — ${CHECK_INFO[c].why}`);
  if (depth.ok === false)
    warnings.push(
      `De diepte (${formatMm(depth.mm!)}) is kleiner dan de minimale montagediepte van deze regel (${formatMm(depth.minMm!)}).`,
    );

  const rail = value("rail_breedte");
  const fabricWidthMm =
    relevant.has("rail_breedte") && rail !== null && input.fullness !== null && input.fullness > 0
      ? Math.round(rail * input.fullness)
      : null;

  let status: WindowStatus;
  if (missing.length) status = "nog-meten";
  else if (deviating.length) status = "afwijking";
  else if (!input.confirmed) status = "ingevoerd";
  else status = "bevestigd";

  return { status, missing, groups, depth, checksOpen, checksPresent, fabricWidthMm, camera, warnings };
}
