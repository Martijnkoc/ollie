import type { ProjectComputation } from "@/lib/projects/compute";
import type { Project } from "@/lib/projects/schema";

export type StepKey = "woning" | "plattegrond" | "kamers" | "vloer" | "plinten-ramen" | "rapport";

export const STEPS: { key: StepKey; label: string }[] = [
  { key: "woning", label: "Woning" },
  { key: "plattegrond", label: "Plattegrond" },
  { key: "kamers", label: "Kamers" },
  { key: "vloer", label: "Vloer" },
  { key: "plinten-ramen", label: "Plinten & ramen" },
  { key: "rapport", label: "Rapport" },
];

export type PaymentInfo = { available: boolean; mode: "live" | "test" | "demo" | null; label: string };

export type StepProps = {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  computed: ProjectComputation;
  goTo: (step: StepKey) => void;
  flush: () => Promise<void>;
  /** Deletes the project (and its file) from this device and leaves the page. */
  remove: () => Promise<void>;
  payment: PaymentInfo;
};

export const isPaid = (p: Project) => p.payment?.status === "paid";
