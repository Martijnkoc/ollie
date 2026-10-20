import type { ScanShot, ScanTask, ScanTarget, TargetVerdict, VerdictContext } from "@/lib/measurements/scan";
import type { Status } from "@/lib/projects/status";

export type WindowScanState = {
  /** Shown on the window: what happened to its scan, never a size. */
  label: string;
  status: Status;
  done: number;
  total: number;
  /** Tasks whose scan must be taken again, by title. */
  retake: string[];
  /** Measurements that were scanned but may not count towards an order, with the first reason. */
  notForOrdering: number;
  accepted: number;
};

export type StoredVerdicts = { context: VerdictContext; targets: Partial<Record<ScanTarget, TargetVerdict>> } | null;

const sameContext = (a: VerdictContext, b: VerdictContext) => a.product === b.product && a.mounting === b.mounting && a.shape === b.shape;

/** Whether the server's verdicts still describe these scans for this product, mounting and shape. */
export function verdictsCurrent(shots: readonly ScanShot[], verdicts: StoredVerdicts, context: VerdictContext) {
  return Boolean(verdicts) && sameContext(verdicts!.context, context) && shots.every((s) => s.processed);
}

/**
 * Scan state of a window for every task its rule needs, without any size: what may be shown before payment.
 * A task counts as done when all its measurements have a verdict that is not "opnieuw scannen".
 */
export function scanStatus(
  shots: readonly ScanShot[],
  tasks: readonly ScanTask[],
  verdicts: StoredVerdicts,
  context: VerdictContext,
): WindowScanState {
  const total = tasks.length;
  const base = { done: 0, total, retake: [] as string[], notForOrdering: 0, accepted: 0 };
  if (!shots.length) return { ...base, label: "Nog scannen", status: "missing" };
  if (!verdictsCurrent(shots, verdicts, context)) return { ...base, label: "Wacht op verwerking", status: "auto" };
  const targets = verdicts!.targets;
  const taskTargets = (t: ScanTask) => t.targets.filter((k): k is ScanTarget => k !== null);
  const retake = tasks.filter(
    (t) => shots.some((s) => s.task === t.id) && taskTargets(t).some((k) => targets[k]?.status === "retake_required"),
  );
  const done = tasks.filter((t) => taskTargets(t).every((k) => targets[k] && targets[k]!.status !== "retake_required")).length;
  const scanned = tasks
    .flatMap(taskTargets)
    .map((k) => targets[k])
    .filter((v): v is TargetVerdict => Boolean(v));
  const accepted = scanned.filter((v) => v.status === "accepted").length;
  const notForOrdering = scanned.filter((v) => v.status === "not_supported_for_ordering").length;
  const state = { done, total, retake: retake.map((t) => t.title), notForOrdering, accepted };
  if (retake.length) return { ...state, label: `Opnieuw scannen: ${retake.map((t) => t.title.toLowerCase()).join(", ")}`, status: "check" };
  if (done < total) return { ...state, label: `Nog ${total - done} ${total - done === 1 ? "opname" : "opnames"}`, status: "missing" };
  if (notForOrdering) return { ...state, label: "Gescand · nog niet geschikt om op te bestellen", status: "measured" };
  return { ...state, label: "Gescand · geaccepteerd voor bestellen", status: "confirmed" };
}

/**
 * What the paid report will hold for the windows, told before payment without any size: how many are
 * scanned, which need a retake, and for how many an order size is possible at all. Nobody pays for order
 * sizes the report cannot give.
 */
export type WindowsPreview = {
  total: number;
  scanned: number;
  retake: number;
  notScanned: number;
  /** Windows whose rule is checked against its source and whose scanned measurements are accepted. */
  orderPossible: number;
  /** Why order sizes are not possible, deduplicated. */
  reasons: string[];
};

export function windowsPreview(
  windows: readonly { state: WindowScanState; ruleProblem: string | null; supplierRule: boolean }[],
): WindowsPreview {
  const reasons = new Set<string>();
  let orderPossible = 0;
  for (const w of windows) {
    if (!w.supplierRule) {
      reasons.add("Voor ramen zonder gekozen leveranciersregel krijg je een meetblad; de bestelmaat bepaalt je leverancier.");
      continue;
    }
    if (w.ruleProblem) reasons.add(w.ruleProblem);
    if (w.state.notForOrdering)
      reasons.add(
        "ScanTag-maten zijn nog niet gevalideerd tegen een gekalibreerde meting: je krijgt de gemeten opening met foutmarge, nog geen bestelmaat.",
      );
    if (
      !w.ruleProblem &&
      w.state.accepted > 0 &&
      w.state.notForOrdering === 0 &&
      w.state.retake.length === 0 &&
      w.state.done === w.state.total
    )
      orderPossible++;
  }
  return {
    total: windows.length,
    scanned: windows.filter((w) => w.state.total > 0 && w.state.done === w.state.total).length,
    retake: windows.filter((w) => w.state.retake.length > 0).length,
    notScanned: windows.filter((w) => w.state.status === "missing").length,
    orderPossible,
    reasons: [...reasons],
  };
}
