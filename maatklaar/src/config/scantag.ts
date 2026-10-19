import type { ProductFamily } from "@/lib/measurements/schema";

/**
 * ScanTag acceptance limits per product family: the largest camera uncertainty (mm, at about 95 %) that may
 * count as "validated" for an order size. Deliberately EMPTY: a limit may only be set after the physical
 * validation in docs/METROLOGIE.md has shown, for that family, that the reported uncertainty covers the real
 * error (95th and 99th percentile, false-accept rate). Until then every camera value is "niet gevalideerd"
 * and an order size from it is at most a concept.
 */
export const SCANTAG_ACCEPTANCE: Partial<Record<ProductFamily, { maxUncertaintyMm: number; validatedOn: string; report: string }>> = {};
