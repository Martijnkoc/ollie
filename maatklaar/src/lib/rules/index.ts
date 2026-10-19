import { MEASURE_DEVIATION_WARNING_MM } from "@/config/site";
import type { MeasurementRuleSet, Mounting, ProductFamily } from "@/lib/measurements/schema";
import { GENERIC_RULES } from "./generic";
import { MOUNT_OF, productRuleSchema, type MountType, type ProductRule } from "./schema";
import { TUISS_RULES } from "./tuiss";

/** Every product rule in the app. Each is validated when the module loads: a broken record fails the build and tests. */
export const PRODUCT_RULES: ProductRule[] = [...GENERIC_RULES, ...TUISS_RULES];
for (const r of PRODUCT_RULES) productRuleSchema.parse(r);
if (new Set(PRODUCT_RULES.map((r) => r.id)).size !== PRODUCT_RULES.length) throw new Error("Dubbele regel-id");

export function productRule(id: string): ProductRule | null {
  return PRODUCT_RULES.find((r) => r.id === id) ?? null;
}

const MOUNTING_OF = Object.fromEntries(Object.entries(MOUNT_OF).map(([m, t]) => [t, m])) as Record<MountType, Mounting>;

/** The generic measuring sheet for a product and mounting; an unknown mounting measures the opening itself. */
export function defaultProductRule(family: ProductFamily, mounting: Mounting): ProductRule {
  const mount = MOUNT_OF[mounting];
  return (
    GENERIC_RULES.find((r) => r.mount === mount && r.families.includes(family)) ??
    GENERIC_RULES.find((r) => r.mount === "ceiling" && family === "gordijn" && mounting === "plafond") ??
    (family === "gordijn"
      ? GENERIC_RULES.find((r) => r.id === "protocol-gordijn")!
      : GENERIC_RULES.find((r) => r.id === "protocol-in-de-dag")!)
  );
}

/** Rules a user may choose for a window: the generic sheet first, then supplier rules for this product and mounting. */
export function productRulesFor(family: ProductFamily, mounting: Mounting): ProductRule[] {
  const mount = MOUNT_OF[mounting];
  const generic = defaultProductRule(family, mounting);
  return [generic, ...PRODUCT_RULES.filter((r) => r.source.supplier !== "MaatKlaar" && r.mount === mount && r.families.includes(family))];
}

/**
 * The measuring protocol view of a product rule: what the measuring wizard and the opening evaluation need.
 * Required lengths are those asked always; lengths asked only after a check (tiles) are optional there.
 */
export function protocolView(rule: ProductRule): MeasurementRuleSet {
  const lengths = rule.inputs.filter((i) => i.kind === "mm");
  return {
    id: rule.id,
    version: rule.source.rulesVersion,
    date: rule.source.checkedOn ?? "2026-10-19",
    kind: rule.source.supplier === "MaatKlaar" ? "protocol" : "supplier",
    title: rule.title,
    productFamilies: rule.families,
    mounting: MOUNTING_OF[rule.mount] ?? "onbekend",
    ...(rule.source.supplier === "MaatKlaar" ? {} : { manufacturer: rule.source.supplier }),
    source: {
      label: `${rule.source.title}${rule.source.status === "concept" ? " — concept, nog niet volledig gecontroleerd" : ""}`,
      ...(rule.source.url ? { url: rule.source.url } : {}),
      ...(rule.source.supplier === "MaatKlaar" ? {} : { retrievedAt: rule.source.checkedOn ?? "2026-10-19" }),
    },
    required: lengths.filter((i) => i.required && !i.when).map((i) => i.key),
    optional: lengths.filter((i) => !i.required || i.when).map((i) => i.key),
    toleranceMm: { breedte: MEASURE_DEVIATION_WARNING_MM, hoogte: MEASURE_DEVIATION_WARNING_MM, ophanghoogte: 10 },
    checks: rule.checks,
    minDepthMm: null,
    conversion: { kind: "none" },
    warnings: rule.notes,
    supplierCheckRequired: rule.ambiguous.map((a) => a.question),
  };
}
