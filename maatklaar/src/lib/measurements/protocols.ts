import type { Mounting, ProductFamily } from "./schema";
import { defaultProductRule, PRODUCT_RULES, productRule, productRulesFor, protocolView } from "@/lib/rules";
import { GENERIC_RULES } from "@/lib/rules/generic";

/**
 * Measuring protocols as the measuring wizard and the opening evaluation see them, derived from the product
 * rules (src/lib/rules). The rules also decide the order size; see src/lib/rules/engine.ts.
 */
export const PROTOCOLS = GENERIC_RULES.map(protocolView);
export const ALL_RULES = PRODUCT_RULES.map(protocolView);

export function findRule(id: string) {
  const r = productRule(id);
  return r ? protocolView(r) : null;
}

/** The generic protocol that fits a product and mounting. Unknown mounting falls back to measuring the opening itself. */
export function defaultRuleFor(family: ProductFamily, mounting: Mounting) {
  return protocolView(defaultProductRule(family, mounting));
}

/** Rules a user may choose for this window: the generic protocol plus the supplier rules that match. */
export function rulesFor(family: ProductFamily, mounting: Mounting) {
  return productRulesFor(family, mounting).map(protocolView);
}
