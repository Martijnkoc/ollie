import { CHECK_INFO, MEASURE_GROUPS, MEASURE_INFO, type CheckKey, type MeasureGroup, type MeasureKey, type MeasurementRuleSet } from "./schema";
import { formatMm } from "@/lib/format";

export type WindowMeasurements = {
  /** Raw measurements in whole millimetres, exactly as entered. */
  measures: Partial<Record<MeasureKey, number>>;
  /** Answers to the obstacle checks: true = yes, present; false = no; missing = not answered yet. */
  checks: Partial<Record<CheckKey, boolean>>;
  /** The user re-measured and states that a spread above the threshold is real. */
  deviationAcknowledged: boolean;
  /** The user reviewed all values for this window. */
  confirmed: boolean;
  /** Curtains only: fullness factor chosen by the user (e.g. 2 for twice the rail width). Never a default. */
  fullness: number | null;
};

export type WindowStatus = "nog-meten" | "afwijking" | "ingevoerd" | "bevestigd" | "bestelmaat";

export const WINDOW_STATUS_LABELS: Record<WindowStatus, string> = {
  "nog-meten": "Nog meten",
  afwijking: "Afwijking controleren",
  ingevoerd: "Ingevoerd",
  bevestigd: "Door jou bevestigd",
  bestelmaat: "Bestelmaat berekend",
};

export type GroupResult = {
  group: MeasureGroup;
  values: { key: MeasureKey; mm: number }[];
  minMm: number;
  maxMm: number;
  spreadMm: number;
  toleranceMm: number;
  exceeds: boolean;
};

export type WindowEvaluation = {
  status: WindowStatus;
  missing: MeasureKey[];
  groups: GroupResult[];
  depth: { mm: number | null; minMm: number | null; ok: boolean | null };
  checksOpen: CheckKey[];
  checksPresent: CheckKey[];
  /** Order size, only with a verified supplier formula and complete, consistent, confirmed measurements. */
  order: { widthMm: number; heightMm: number; steps: string[] } | null;
  orderBlocked: string[];
  /** Curtains: rail width × the fullness the user chose. Labelled as derived from their choice. */
  fabricWidthMm: number | null;
  warnings: string[];
};

function round(mm: number, stepMm: number, mode: "down" | "up" | "nearest") {
  const q = mm / stepMm;
  const r = mode === "down" ? Math.floor(q + 1e-9) : mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
  return r * stepMm;
}

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
    const toleranceMm = rule.toleranceMm[group];
    groups.push({ group, values, minMm, maxMm, spreadMm: maxMm - minMm, toleranceMm, exceeds: maxMm - minMm > toleranceMm });
  }
  const deviating = groups.filter((g) => g.exceeds);

  const depthMm = relevant.has("diepte") ? value("diepte") : null;
  const depth = {
    mm: depthMm,
    minMm: rule.minDepthMm,
    ok: rule.minDepthMm === null || depthMm === null ? null : depthMm >= rule.minDepthMm,
  };

  const checksOpen = rule.checks.filter((c) => input.checks[c] === undefined);
  const checksPresent = rule.checks.filter((c) => input.checks[c] === true);

  const warnings = [...rule.warnings];
  for (const g of deviating) {
    warnings.push(
      `De ${g.group} verschilt ${formatMm(g.spreadMm)} tussen je meetpunten (drempel ${formatMm(g.toleranceMm)}). Meet opnieuw; als het klopt, bevestig het verschil.`,
    );
  }
  for (const c of checksPresent) warnings.push(`${CHECK_INFO[c].question} Ja — ${CHECK_INFO[c].why}`);
  if (depth.ok === false) warnings.push(`De diepte (${formatMm(depth.mm!)}) is kleiner dan de minimale montagediepte van deze regel (${formatMm(depth.minMm!)}).`);

  const orderBlocked: string[] = [];
  if (rule.kind !== "supplier" || rule.conversion.kind !== "formula") {
    orderBlocked.push("Er is geen gecontroleerde meetregel van een leverancier gekozen. Bevestig de bestelmaat volgens de instructie van je leverancier.");
  }
  if (missing.length) orderBlocked.push(`Nog te meten: ${missing.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ")}.`);
  if (deviating.length && !input.deviationAcknowledged) orderBlocked.push("Er is een afwijking tussen meetpunten die nog niet is gecontroleerd.");
  if (checksOpen.length) orderBlocked.push("Nog niet alle controlevragen zijn beantwoord.");
  if (depth.ok === false) orderBlocked.push("De montagediepte is te klein voor deze regel.");
  if (rule.minDepthMm !== null && depth.mm === null) orderBlocked.push("De diepte van de dag ontbreekt.");
  if (!input.confirmed) orderBlocked.push("Je hebt de maten van dit raam nog niet bevestigd.");

  let order: WindowEvaluation["order"] = null;
  if (!orderBlocked.length && rule.conversion.kind === "formula") {
    const c = rule.conversion;
    const pick = (f: typeof c.width) => {
      const vals = f.of.map((k) => value(k)!);
      return f.basis === "min" ? Math.min(...vals) : Math.max(...vals);
    };
    const rawW = pick(c.width);
    const rawH = pick(c.height);
    const widthMm = round(rawW + c.width.adjustMm, c.rounding.stepMm, c.rounding.mode);
    const heightMm = round(rawH + c.height.adjustMm, c.rounding.stepMm, c.rounding.mode);
    const sign = (n: number) => (n >= 0 ? `+ ${formatMm(n)}` : `− ${formatMm(-n)}`);
    order = {
      widthMm,
      heightMm,
      steps: [
        `Breedte: ${c.width.basis === "min" ? "kleinste" : "grootste"} van ${c.width.of.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ")} = ${formatMm(rawW)} ${sign(c.width.adjustMm)}, afgerond (${c.rounding.mode === "down" ? "omlaag" : c.rounding.mode === "up" ? "omhoog" : "naar dichtstbijzijnde"}) op ${formatMm(c.rounding.stepMm)} = ${formatMm(widthMm)}`,
        `Hoogte: ${c.height.basis === "min" ? "kleinste" : "grootste"} van ${c.height.of.map((k) => MEASURE_INFO[k].label.toLowerCase()).join(", ")} = ${formatMm(rawH)} ${sign(c.height.adjustMm)}, afgerond op ${formatMm(c.rounding.stepMm)} = ${formatMm(heightMm)}`,
        `Regel: ${rule.title}, versie ${rule.version} (${rule.date}), bron: ${rule.source.label}${rule.source.url ? ` — ${rule.source.url}` : ""}`,
      ],
    };
  }

  const rail = value("rail_breedte");
  const fabricWidthMm =
    relevant.has("rail_breedte") && rail !== null && input.fullness !== null && input.fullness > 0 ? Math.round(rail * input.fullness) : null;

  let status: WindowStatus;
  if (missing.length) status = "nog-meten";
  else if (deviating.length && !input.deviationAcknowledged) status = "afwijking";
  else if (!input.confirmed) status = "ingevoerd";
  else if (order) status = "bestelmaat";
  else status = "bevestigd";

  return { status, missing, groups, depth, checksOpen, checksPresent, order, orderBlocked, fabricWidthMm, warnings };
}
