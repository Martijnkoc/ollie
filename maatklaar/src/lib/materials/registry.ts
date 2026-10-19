import type { ProjectComputation } from "@/lib/projects/compute";
import type { Status } from "@/lib/projects/status";

/**
 * One line of the order list. New materials (paint, primer, wallpaper, underlay, profiles …) plug in as a
 * `MaterialCalculator`. A calculator only returns a quantity when the geometry and input it needs exist;
 * otherwise it returns the line with `quantity: null` and says what is missing. Estimates are flagged.
 */
export type MaterialLine = {
  key: string;
  label: string;
  quantity: number | null;
  unit: "m²" | "m" | "stuks" | "pakken";
  status: Status;
  /** True for a rough estimate rather than a calculation from confirmed measurements. */
  estimate: boolean;
  basis: string[];
  paid: boolean;
};

export type MaterialCalculator = {
  key: string;
  label: string;
  paid: boolean;
  lines(c: ProjectComputation): MaterialLine[];
};

const floor: MaterialCalculator = {
  key: "vloer",
  label: "Vloer",
  paid: false,
  lines: (c) => {
    const f = c.floor;
    const lines: MaterialLine[] = [
      {
        key: "vloer-m2",
        label: "Vloer inclusief snijverlies",
        quantity: f.requiredM2,
        unit: "m²",
        status: f.status,
        estimate: false,
        basis: f.steps,
        paid: false,
      },
    ];
    if (f.packs !== null)
      lines.push({
        key: "vloer-pakken",
        label: "Vloer in pakken",
        quantity: f.packs,
        unit: "pakken",
        status: f.status,
        estimate: false,
        basis: f.steps,
        paid: false,
      });
    return lines;
  },
};

const plinths: MaterialCalculator = {
  key: "plinten",
  label: "Plinten",
  paid: true,
  lines: (c) => {
    const p = c.plinths;
    const lines: MaterialLine[] = [
      {
        key: "plint-m",
        label: "Plinten inclusief marge",
        quantity: p.requiredMm === null ? null : p.requiredMm / 1000,
        unit: "m",
        status: p.status,
        estimate: false,
        basis: p.steps,
        paid: true,
      },
    ];
    if (p.piecesByTotal !== null)
      lines.push({
        key: "plint-stuks",
        label: "Plinten in handelslengtes",
        quantity: p.piecesByTotal,
        unit: "stuks",
        status: p.status,
        estimate: false,
        basis: p.steps,
        paid: true,
      });
    return lines;
  },
};

export const MATERIALS: MaterialCalculator[] = [floor, plinths];

export function materialLines(c: ProjectComputation, opts: { paid: boolean }) {
  return MATERIALS.filter((m) => opts.paid || !m.paid).flatMap((m) => m.lines(c));
}
