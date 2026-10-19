import { formatMm } from "@/lib/format";
import { CHECK_INFO, MEASURE_INFO, type CheckKey, type MeasureKey } from "@/lib/measurements/schema";
import { ANSWER_INFO, type AnswerKey, type ProductRule, type Selector } from "./schema";

/**
 * Applies a product rule to a window's measurements: which measurement counts for width and height, the
 * narrowest passage, depth, overlap, deductions and the cases the rule leaves open. The result is the order
 * layer (order_dimensions); it never changes the measurements themselves.
 */
export const ORDER_STATUSES = [
  "order_ready",
  "concept",
  "needs_verification",
  "needs_more_data",
  "not_suitable",
  "unsupported",
  "measuring_sheet",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_ready: "Klaar om te bestellen",
  concept: "Concept-bestelmaat (niet definitief)",
  needs_verification: "Eerst navragen",
  needs_more_data: "Meer gegevens nodig",
  not_suitable: "Past niet",
  unsupported: "Niet ondersteund",
  measuring_sheet: "Meetblad: bestelmaat volgens je leverancier",
};

/**
 * Validation status of one measurement: a camera value is "validated" only within acceptance limits that
 * were set from physical reference measurements; a typed value counts once the user confirmed the window.
 */
export const VALIDATION_STATUSES = [
  "validated",
  "user_confirmed",
  "unconfirmed",
  "not_validated",
  "needs_more_data",
  "unsupported",
] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  validated: "gevalideerd",
  user_confirmed: "door gebruiker bevestigd",
  unconfirmed: "nog niet bevestigd",
  not_validated: "niet gevalideerd",
  needs_more_data: "extra opname nodig",
  unsupported: "niet ondersteund",
};

export type OrderInput = {
  measures: Partial<Record<MeasureKey, number>>;
  answers: Partial<Record<AnswerKey, string>>;
  checks: Partial<Record<CheckKey, boolean>>;
  validation: Partial<Record<MeasureKey, ValidationStatus>>;
  confirmed: boolean;
  shape: "rechthoek" | "erker" | "afwijkend";
  /** For the "rule checked within a year" test; defaults to today. */
  today?: string;
};

export type Pick = { mm: number; from: MeasureKey[]; how: string };
export type Correction = { what: string; mm: number; appliedBy: "leverancier" | "maatklaar"; reason: string };

export type OrderResult = {
  rule: {
    id: string;
    title: string;
    supplier: string;
    version: string;
    url: string | null;
    status: "concept" | "published";
    checkedOn: string | null;
  };
  status: OrderStatus;
  width: Pick | null;
  height: Pick | null;
  /** The order size; a side is null when it cannot be decided (see questions). Code-ordered products: by code. */
  order: { widthMm: number | null; heightMm: number | null; byCode: string | null } | null;
  corrections: Correction[];
  /** Overlap guideline applied to the opening: a suggestion for the outer size, not an order size by itself. */
  suggestion: { widthMm: number | null; heightMm: number | null; how: string } | null;
  depth: { key: MeasureKey; requiredMm: number | null; measuredMm: number | null; ok: boolean | null } | null;
  missing: string[];
  questions: { id: string; question: string }[];
  warnings: string[];
  /** Why the order size is not final. Empty only when status is order_ready. */
  blockedBy: string[];
};

const label = (k: MeasureKey) => MEASURE_INFO[k].label.toLowerCase();
/** A rule counts as current when a person checked it against its source within this many days. */
export const RULE_MAX_AGE_DAYS = 365;

function applyRounding(mm: number, r: ProductRule["rounding"]) {
  if (!r) return mm;
  const q = mm / r.stepMm;
  const n = r.mode === "down" ? Math.floor(q + 1e-9) : r.mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
  return n * r.stepMm;
}

export function orderDimensions(rule: ProductRule, input: OrderInput): OrderResult {
  const value = (k: MeasureKey) => {
    const v = input.measures[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  };
  const result: OrderResult = {
    rule: {
      id: rule.id,
      title: rule.title,
      supplier: rule.source.supplier,
      version: rule.source.rulesVersion,
      url: rule.source.url,
      status: rule.source.status,
      checkedOn: rule.source.checkedOn,
    },
    status: "measuring_sheet",
    width: null,
    height: null,
    order: null,
    corrections: [],
    suggestion: null,
    depth: null,
    missing: [],
    questions: [...rule.ambiguous],
    warnings: [],
    blockedBy: [],
  };
  let unsuitable = false;

  if (!rule.supported || input.shape !== "rechthoek") {
    result.status = "unsupported";
    result.blockedBy.push(
      !rule.supported
        ? rule.unsupportedReason!
        : input.shape === "erker"
          ? "Een erker is geen rechthoekig raam: daarvoor gelden per product aparte meetinstructies. ScanTag en deze regel rekenen er niet mee."
          : "Deze raamvorm is niet rechthoekig: daar rekent deze regel niet mee.",
    );
    return result;
  }

  // Inputs: required lengths and answers, lengths that only apply after a check, and the checks themselves.
  for (const i of rule.inputs) {
    if (!i.required) continue;
    if (i.kind === "mm") {
      if (i.when && input.checks[i.when.check] !== i.when.equals) continue;
      if (value(i.key) === null) result.missing.push(MEASURE_INFO[i.key].label);
    } else if (!input.answers[i.key]?.trim()) result.missing.push(ANSWER_INFO[i.key].label);
  }
  // Obstacle questions decide an order size; a measuring sheet without one does not wait for them.
  if (rule.selection)
    for (const c of rule.checks) if (input.checks[c] === undefined) result.missing.push(`Controlevraag: ${CHECK_INFO[c].question}`);

  const pick = (s: Selector, side: "breedte" | "hoogte"): Pick | null => {
    if (s.kind === "minimum" || s.kind === "maximum") {
      const present = s.of.filter((k) => value(k) !== null);
      if (!present.length) return null;
      const target = (s.kind === "minimum" ? Math.min : Math.max)(...present.map((k) => value(k)!));
      return {
        mm: target,
        from: present.filter((k) => value(k) === target),
        how: `${s.kind === "minimum" ? "kleinste" : "grootste"} van ${present.map(label).join(", ")}`,
      };
    }
    if (s.kind === "position" || s.kind === "chosen") {
      const v = value(s.key);
      return v === null
        ? null
        : { mm: v, from: [s.key], how: s.kind === "position" ? `${label(s.key)} (vaste meetpositie)` : `${label(s.key)} (jouw keuze)` };
    }
    if (s.kind === "unspecified") result.questions.push({ id: `selectie-${side}`, question: s.question });
    return null;
  };

  if (rule.selection) {
    result.width = pick(rule.selection.width, "breedte");
    result.height = pick(rule.selection.height, "hoogte");

    // Narrowest passage: the wide measurement counts unless the narrow one is clearly smaller.
    const n = rule.narrowest;
    if (n && input.checks[n.when] === true) {
      const wide = value(n.wide);
      const narrow = value(n.narrow);
      if (wide !== null && narrow !== null) {
        const diff = wide - narrow;
        if (diff === n.thresholdMm) {
          result.questions.push({
            id: "smalste-grens",
            question: `${MEASURE_INFO[n.wide].label} is precies ${formatMm(n.thresholdMm)} breder dan ${label(n.narrow)}. De regel zegt niet welke maat dan telt: vraag het na bij de leverancier.`,
          });
          result.width = null;
        } else if (diff > n.thresholdMm) {
          result.width = {
            mm: narrow,
            from: [n.narrow],
            how: `${label(n.narrow)}: ${formatMm(diff)} smaller dan ${label(n.wide)} (meer dan ${formatMm(n.thresholdMm)})`,
          };
        } else {
          result.width = {
            mm: wide,
            from: [n.wide],
            how: `${label(n.wide)}: verschil met ${label(n.narrow)} is ${formatMm(Math.max(0, diff))} (minder dan ${formatMm(n.thresholdMm)})`,
          };
        }
      }
    }

    // Overlap on the frame: a suggestion from the opening, or a minimum the chosen size must meet.
    const o = rule.overlap;
    if (o) {
      const openW = value("breedte_midden");
      const openH = value("hoogte_midden");
      const w = openW !== null && o.sidesMm !== null ? openW + 2 * o.sidesMm : null;
      const h = openH !== null && o.topMm !== null ? openH + o.topMm + (o.bottomMm ?? 0) : null;
      result.suggestion = {
        widthMm: w,
        heightMm: h,
        how: `opening ${o.sidesMm !== null ? `+ 2 × ${formatMm(o.sidesMm)} aan de zijkanten` : ""}${o.topMm !== null ? `, + ${formatMm(o.topMm)} boven` : ""}${o.bottomMm === null ? "; onder kies je zelf" : `, + ${formatMm(o.bottomMm)} onder`} (${o.kind === "minimum" ? "minimum" : "richtlijn"})`,
      };
      if (o.kind === "minimum") {
        if (w !== null && result.width && result.width.mm < w) {
          unsuitable = true;
          result.blockedBy.push(`De gekozen breedte is kleiner dan de opening plus de minimale overlap (${formatMm(w)}).`);
        }
        if (h !== null && result.height && result.height.mm < h) {
          unsuitable = true;
          result.blockedBy.push(`De gekozen hoogte is kleiner dan de opening plus de minimale overlap boven (${formatMm(h)}).`);
        }
      }
    }

    // Deductions and additions: listed with who applies them, applied by us only when the rule says so.
    let width = result.width?.mm ?? null;
    let height = result.height?.mm ?? null;
    const d = rule.deductions;
    if (d) {
      for (const [side, amount] of [
        ["breedte", d.widthMm],
        ["hoogte", d.heightMm],
      ] as const) {
        if (!amount) continue;
        result.corrections.push({
          what: `− ${formatMm(amount)} op de ${side}`,
          mm: -amount,
          appliedBy: d.appliedBy,
          reason:
            d.appliedBy === "leverancier"
              ? `${rule.source.supplier} trekt dit zelf af; wij trekken het niet nog eens af.`
              : `volgens ${rule.title}`,
        });
        if (d.appliedBy === "maatklaar") {
          if (side === "breedte" && width !== null) width -= amount;
          if (side === "hoogte" && height !== null) height -= amount;
        }
      }
    } else if (rule.supplierMakesDeduction)
      result.corrections.push({
        what: "aftrek voor montage",
        mm: 0,
        appliedBy: "leverancier",
        reason: `${rule.source.supplier} verwerkt de aftrek zelf; wij trekken niets af.`,
      });
    if (rule.supplierAdds)
      result.corrections.push({
        what: `+ ${formatMm(rule.supplierAdds.heightMm)} op de lengte`,
        mm: rule.supplierAdds.heightMm,
        appliedBy: "leverancier",
        reason: `${rule.source.supplier} telt dit zelf op bij ${rule.supplierAdds.when}; wij tellen het niet nog eens op.`,
      });

    const byCode = rule.selection.width.kind === "by_code" ? input.answers[rule.selection.width.key]?.trim() || null : null;
    result.order = {
      widthMm: width === null ? null : applyRounding(width, rule.rounding),
      heightMm: height === null ? null : applyRounding(height, rule.rounding),
      byCode,
    };
    if (!rule.rounding && (width !== null || height !== null))
      result.warnings.push("De bron noemt geen afronding: wij ronden niet af. Je leverancier kan dat wel doen.");
  }

  // Depth: a minimum per variant or per fixing; unknown minimums are asked, not assumed.
  if (rule.depth) {
    const dep = rule.depth;
    let required = dep.minMm;
    if (dep.byAnswer) {
      const answer = input.answers[dep.byAnswer.key];
      required = answer ? (dep.byAnswer.values[answer] ?? null) : null;
      if (!answer && !result.missing.includes(ANSWER_INFO[dep.byAnswer.key].label))
        result.missing.push(ANSWER_INFO[dep.byAnswer.key].label);
    }
    const measured = value(dep.key);
    const ok = required === null || measured === null ? null : measured >= required;
    result.depth = { key: dep.key, requiredMm: required, measuredMm: measured, ok };
    if (ok === false) unsuitable = true;
    if (ok === false)
      result.blockedBy.push(
        `Te weinig ${label(dep.key)}: ${formatMm(measured!)} gemeten, ${formatMm(required!)} nodig${dep.straight ? " (recht en vlak)" : ""}. Dit product past zo niet.`,
      );
    if (dep.straight) result.warnings.push(`De ${label(dep.key)} moet recht en vlak zijn over de hele hoogte; controleer dat per raam.`);
  }

  // Product limits, when the rule has them.
  const lim = rule.limits;
  if (lim && result.order) {
    const { widthMm, heightMm } = result.order;
    if (lim.widthMm && widthMm !== null && (widthMm < lim.widthMm.min || widthMm > lim.widthMm.max))
      result.blockedBy.push(`Breedte ${formatMm(widthMm)} valt buiten ${formatMm(lim.widthMm.min)}–${formatMm(lim.widthMm.max)}.`);
    if (lim.heightMm && heightMm !== null && (heightMm < lim.heightMm.min || heightMm > lim.heightMm.max))
      result.blockedBy.push(`Hoogte ${formatMm(heightMm)} valt buiten ${formatMm(lim.heightMm.min)}–${formatMm(lim.heightMm.max)}.`);
  }

  // Data quality: every measurement that decides the order size must be validated or confirmed.
  const used = new Set<MeasureKey>([
    ...(result.width?.from ?? []),
    ...(result.height?.from ?? []),
    ...(result.depth?.measuredMm ? [result.depth.key] : []),
  ]);
  for (const k of used) {
    const v = input.validation[k] ?? (input.confirmed ? "user_confirmed" : "unconfirmed");
    if (v !== "validated" && v !== "user_confirmed")
      result.blockedBy.push(
        `${MEASURE_INFO[k].label}: ${VALIDATION_LABELS[v]}${v === "not_validated" ? " (ScanTag-meting zonder vastgestelde acceptatiegrens)" : ""}.`,
      );
  }
  if (!input.confirmed) result.blockedBy.push("Je hebt de maten van dit raam nog niet bevestigd.");

  // The rule itself must be checked against its source, and recently.
  if (rule.source.status !== "published")
    result.blockedBy.push(
      `De regel van ${rule.source.supplier} is een concept: nog niet door een mens tegen de volledige bron gecontroleerd.`,
    );
  else if (rule.source.checkedOn) {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const age = (Date.parse(today) - Date.parse(rule.source.checkedOn)) / 86_400_000;
    if (age > RULE_MAX_AGE_DAYS) result.blockedBy.push(`De regel is sinds ${rule.source.checkedOn} niet meer tegen de bron gecontroleerd.`);
  }

  result.status = !rule.selection
    ? result.missing.length
      ? "needs_more_data"
      : "measuring_sheet"
    : result.missing.length
      ? "needs_more_data"
      : unsuitable
        ? "not_suitable"
        : result.questions.length
          ? "needs_verification"
          : result.blockedBy.length
            ? "concept"
            : "order_ready";
  if (result.status === "needs_more_data" || result.status === "measuring_sheet") result.order = null;
  return result;
}

/** One line for screens, report and CSV: the order size with its status and rule, or why there is none. */
export function orderSummary(o: OrderResult): string {
  const rule = `${o.rule.title}, regels ${o.rule.version}`;
  if (!o.order) return `${ORDER_STATUS_LABELS[o.status]}`;
  if (o.order.byCode) return `${ORDER_STATUS_LABELS[o.status]}: bestellen op typecode ${o.order.byCode} (${rule})`;
  const side = (mm: number | null) => (mm === null ? "navragen" : formatMm(mm));
  return `${ORDER_STATUS_LABELS[o.status]}: ${side(o.order.widthMm)} × ${side(o.order.heightMm)} (${rule})`;
}
