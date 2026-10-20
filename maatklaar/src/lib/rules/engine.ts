import { formatMm } from "@/lib/format";
import { CHECK_INFO, MEASURE_INFO, type CheckKey, type MeasureKey } from "@/lib/measurements/schema";
import { ANSWER_INFO, type AnswerKey, type ProductRule, type Selector } from "./schema";

/**
 * Applies a product rule to a window's measurements: which measurement counts for width and height, the
 * narrowest passage, depth, overlap, deductions and the cases the rule leaves open. The result is the order
 * layer (orderDimensions); it never changes the measurements themselves (observedOpeningDimensions).
 *
 * An order size is computed only with a supplier rule that a person checked against its source within a year,
 * and only from measurements that are accepted (validated ScanTag) or confirmed by the user. Anything else gets
 * a status and the reasons, never a provisional number.
 */
export const ORDER_STATUSES = [
  "order_ready",
  "rule_not_verified",
  "measurement_not_accepted",
  "needs_verification",
  "needs_more_data",
  "not_suitable",
  "unsupported",
  "measuring_sheet",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  order_ready: "Klaar om te bestellen",
  rule_not_verified: "Nog geen bestelmaat: meetregel niet gecontroleerd",
  measurement_not_accepted: "Nog geen bestelmaat: maat niet geschikt om op te bestellen",
  needs_verification: "Eerst navragen",
  needs_more_data: "Meer gegevens nodig",
  not_suitable: "Past niet",
  unsupported: "Niet ondersteund",
  measuring_sheet: "Meetblad: bestelmaat volgens je leverancier",
};

/**
 * Status of one measurement for the order layer: a ScanTag value counts only when `accepted` (within criteria
 * that were validated against a calibrated reference); a typed value counts once the user confirmed the window.
 */
export const MEASURE_STATUSES = ["accepted", "user_confirmed", "unconfirmed", "retake_required", "not_supported_for_ordering"] as const;
export type MeasureStatus = (typeof MEASURE_STATUSES)[number];

export const MEASURE_STATUS_LABELS: Record<MeasureStatus, string> = {
  accepted: "ScanTag, geaccepteerd voor bestellen",
  user_confirmed: "door jou bevestigd",
  unconfirmed: "nog niet bevestigd",
  retake_required: "ScanTag, opnieuw scannen",
  not_supported_for_ordering: "ScanTag, niet geschikt om op te bestellen",
};

export type OrderInput = {
  measures: Partial<Record<MeasureKey, number>>;
  answers: Partial<Record<AnswerKey, string>>;
  checks: Partial<Record<CheckKey, boolean>>;
  status: Partial<Record<MeasureKey, MeasureStatus>>;
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
  /**
   * The order size in whole millimetres, only when status is order_ready (or, for products ordered by type code,
   * the code). Null in every other case: there is no provisional order size.
   */
  order: { orderWidthMm: number | null; orderHeightMm: number | null; byCode: string | null } | null;
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

/**
 * The final order field: whole millimetres. With a rounding rule from the source, that rule; without one we
 * round down to the whole millimetre, so a product never comes out wider or longer than measured.
 */
function toOrderMm(mm: number, r: ProductRule["rounding"]) {
  if (!r) return Math.floor(mm + 1e-9);
  const q = mm / r.stepMm;
  const n = r.mode === "down" ? Math.floor(q + 1e-9) : r.mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
  return n * r.stepMm;
}

/** Whether a rule may produce an order size today: published and checked against its source within a year. */
export function ruleVerification(rule: ProductRule, today = new Date().toISOString().slice(0, 10)): string | null {
  if (rule.source.status !== "published")
    return `De meetregel van ${rule.source.supplier} is nog niet door een mens tegen de volledige bron gecontroleerd: daarom rekenen we er geen bestelmaat mee uit.`;
  if (!rule.source.checkedOn) return `De meetregel van ${rule.source.supplier} heeft geen controledatum.`;
  const age = (Date.parse(today) - Date.parse(rule.source.checkedOn)) / 86_400_000;
  if (age > RULE_MAX_AGE_DAYS)
    return `De meetregel is sinds ${rule.source.checkedOn} niet meer tegen de bron gecontroleerd: eerst opnieuw controleren.`;
  return null;
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

  // A rule nobody checked against its source decides nothing: no selection, no deduction, no order size.
  const unverified = rule.selection ? ruleVerification(rule, input.today) : null;
  if (unverified) {
    result.blockedBy.push(unverified);
    if (rule.depth?.minMm)
      result.warnings.push(
        `Volgens de nog niet gecontroleerde regel is minimaal ${formatMm(rule.depth.minMm)} ${label(rule.depth.key)} nodig; controleer dat bij ${rule.source.supplier}.`,
      );
    result.status = result.missing.length ? "needs_more_data" : "rule_not_verified";
    return result;
  }

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
      orderWidthMm: width === null ? null : toOrderMm(width, rule.rounding),
      orderHeightMm: height === null ? null : toOrderMm(height, rule.rounding),
      byCode,
    };
    if (!rule.rounding && (width !== null || height !== null))
      result.warnings.push(
        "De bron noemt geen afronding: wij ronden af naar hele millimeters, naar beneden. Je leverancier kan anders afronden.",
      );
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
    const { orderWidthMm: w, orderHeightMm: h } = result.order;
    if (lim.widthMm && w !== null && (w < lim.widthMm.min || w > lim.widthMm.max)) {
      unsuitable = true;
      result.blockedBy.push(`Breedte ${formatMm(w)} valt buiten ${formatMm(lim.widthMm.min)}–${formatMm(lim.widthMm.max)}.`);
    }
    if (lim.heightMm && h !== null && (h < lim.heightMm.min || h > lim.heightMm.max)) {
      unsuitable = true;
      result.blockedBy.push(`Hoogte ${formatMm(h)} valt buiten ${formatMm(lim.heightMm.min)}–${formatMm(lim.heightMm.max)}.`);
    }
  }

  // Data quality: every measurement that decides the order size must be accepted or confirmed by the user.
  const used = new Set<MeasureKey>([
    ...(result.width?.from ?? []),
    ...(result.height?.from ?? []),
    ...(result.depth?.measuredMm ? [result.depth.key] : []),
  ]);
  const statusOf = (k: MeasureKey): MeasureStatus => input.status[k] ?? (input.confirmed ? "user_confirmed" : "unconfirmed");
  let notAccepted = false;
  for (const k of used) {
    const v = statusOf(k);
    if (v === "accepted" || v === "user_confirmed") continue;
    notAccepted = true;
    result.blockedBy.push(`${MEASURE_INFO[k].label}: ${MEASURE_STATUS_LABELS[v]}.`);
  }
  if (!input.confirmed) {
    notAccepted = true;
    result.blockedBy.push("Je hebt de maten van dit raam nog niet bevestigd.");
  }
  // The overlap suggestion is a number from the opening too: only from measurements that may be used.
  if (
    result.suggestion &&
    (["breedte_midden", "hoogte_midden"] as const).some((k) => value(k) !== null && !["accepted", "user_confirmed"].includes(statusOf(k)))
  )
    result.suggestion = null;

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
          : notAccepted
            ? "measurement_not_accepted"
            : "order_ready";
  // Never a provisional number: an order size exists only when it may be ordered.
  if (result.status !== "order_ready") result.order = null;
  return result;
}

/** One line for screens, report and CSV: the order size with its status and rule, or why there is none. */
export function orderSummary(o: OrderResult): string {
  const rule = `${o.rule.title}, regels ${o.rule.version}`;
  if (!o.order) return `${ORDER_STATUS_LABELS[o.status]}`;
  if (o.order.byCode) return `${ORDER_STATUS_LABELS[o.status]}: bestellen op typecode ${o.order.byCode} (${rule})`;
  const side = (mm: number | null) => (mm === null ? "navragen" : formatMm(mm));
  return `${ORDER_STATUS_LABELS[o.status]}: ${side(o.order.orderWidthMm)} × ${side(o.order.orderHeightMm)} (${rule})`;
}
