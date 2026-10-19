import type { MeasurementRuleSet } from "@/lib/measurements/schema";

/**
 * Verified supplier measuring rules. Intentionally empty in V1: we do not invent supplier rules.
 *
 * To add one, copy a supplier's official measuring instructions into a `MeasurementRuleSet` with
 * `kind: "supplier"`, the manufacturer and collection, the URL of the instructions, the date you read them
 * and a new `version` whenever the instructions change. Have a second person check the rule against the
 * source before it ships; the schema in src/lib/measurements/schema.ts rejects rules without a source.
 * See docs/MEETREGELS.md for the checklist.
 */
export const SUPPLIER_RULES: MeasurementRuleSet[] = [];
