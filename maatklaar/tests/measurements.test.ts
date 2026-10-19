import { describe, expect, it } from "vitest";
import { evaluateWindow, type WindowMeasurements } from "@/lib/measurements/evaluate";
import { ALL_RULES, PROTOCOLS, defaultRuleFor, rulesFor } from "@/lib/measurements/protocols";
import { measurementRuleSetSchema, type MeasurementRuleSet } from "@/lib/measurements/schema";
import { SUPPLIER_RULES } from "@/config/measurement-rules";

/** Fictional supplier rule used only in tests. Not shipped in the app. */
const TEST_SUPPLIER_RULE: MeasurementRuleSet = {
  id: "test-leverancier-rolgordijn-in-de-dag",
  version: "2026.1",
  date: "2026-10-01",
  kind: "supplier",
  title: "Testleverancier rolgordijn in de dag",
  productFamilies: ["rolgordijn"],
  mounting: "in-de-dag",
  manufacturer: "Testleverancier (fictief)",
  source: { label: "Fictieve meetinstructie voor tests", url: "https://example.invalid/meetinstructie", retrievedAt: "2026-10-01" },
  required: ["breedte_boven", "breedte_midden", "breedte_onder", "hoogte_links", "hoogte_midden", "hoogte_rechts", "diepte"],
  optional: [],
  toleranceMm: { breedte: 3, hoogte: 3, ophanghoogte: 10 },
  checks: ["grepen"],
  minDepthMm: 40,
  conversion: {
    kind: "formula",
    width: { basis: "min", of: ["breedte_boven", "breedte_midden", "breedte_onder"], adjustMm: -4 },
    height: { basis: "min", of: ["hoogte_links", "hoogte_midden", "hoogte_rechts"], adjustMm: 0 },
    rounding: { stepMm: 1, mode: "down" },
  },
  warnings: [],
  supplierCheckRequired: [],
};

const complete: WindowMeasurements = {
  measures: { breedte_boven: 1203, breedte_midden: 1201, breedte_onder: 1202, hoogte_links: 1500, hoogte_midden: 1499, hoogte_rechts: 1501, diepte: 60 },
  checks: { grepen: false, ventilatierooster: false, raam_openen: false, vensterbank: false },
  acknowledged: {},
  confirmed: true,
  fullness: null,
};

describe("MeasurementRules", () => {
  it("alle meegeleverde regels zijn geldig en er zitten geen leveranciersregels in de app", () => {
    for (const r of ALL_RULES) expect(measurementRuleSetSchema.safeParse(r).success).toBe(true);
    expect(SUPPLIER_RULES).toEqual([]);
    expect(PROTOCOLS.every((p) => p.kind === "protocol" && p.conversion.kind === "none")).toBe(true);
  });

  it("weigert een leveranciersregel zonder bron of met een gemiddelde", () => {
    const noSource = { ...TEST_SUPPLIER_RULE, source: { label: "Ergens gelezen" } };
    expect(measurementRuleSetSchema.safeParse(noSource).success).toBe(false);
    const average = { ...TEST_SUPPLIER_RULE, conversion: { ...TEST_SUPPLIER_RULE.conversion, width: { basis: "avg", of: ["breedte_midden"], adjustMm: 0 } } };
    expect(measurementRuleSetSchema.safeParse(average).success).toBe(false);
    const protocolWithFormula = { ...TEST_SUPPLIER_RULE, kind: "protocol" };
    expect(measurementRuleSetSchema.safeParse(protocolWithFormula).success).toBe(false);
  });

  it("kiest het algemene protocol per product en montagewijze", () => {
    expect(defaultRuleFor("rolgordijn", "in-de-dag").id).toBe("protocol-in-de-dag");
    expect(defaultRuleFor("plisse", "op-de-dag").id).toBe("protocol-op-de-dag");
    expect(defaultRuleFor("gordijn", "plafond").id).toBe("protocol-gordijn-plafond");
    expect(defaultRuleFor("onbekend", "onbekend").id).toBe("protocol-in-de-dag");
    expect(rulesFor("rolgordijn", "in-de-dag", [...ALL_RULES, TEST_SUPPLIER_RULE]).map((r) => r.id)).toEqual(["protocol-in-de-dag", TEST_SUPPLIER_RULE.id]);
  });
});

describe("raammeting", () => {
  it("zonder leveranciersregel: geen bestelmaat, wel bevestigd meetblad", () => {
    const e = evaluateWindow(complete, defaultRuleFor("rolgordijn", "in-de-dag"));
    expect(e.order).toBeNull();
    expect(e.status).toBe("bevestigd");
    expect(e.orderBlocked.join(" ")).toMatch(/geen gecontroleerde meetregel/i);
  });

  it("met expliciet geconfigureerde regel: bestelmaat volgens de formule", () => {
    const e = evaluateWindow(complete, TEST_SUPPLIER_RULE);
    expect(e.status).toBe("bestelmaat");
    expect(e.order).toMatchObject({ widthMm: 1201 - 4, heightMm: 1499 });
    expect(e.order!.steps.join(" ")).toContain("versie 2026.1");
  });

  it("blokkeert de bestelmaat als een verplichte maat ontbreekt", () => {
    const measures = { ...complete.measures };
    delete measures.hoogte_rechts;
    const e = evaluateWindow({ ...complete, measures }, TEST_SUPPLIER_RULE);
    expect(e.status).toBe("nog-meten");
    expect(e.missing).toEqual(["hoogte_rechts"]);
    expect(e.order).toBeNull();
  });

  it("afwijkende meetpunten: waarschuwen, niet middelen, pas door na bevestiging", () => {
    const skewed = { ...complete, measures: { ...complete.measures, breedte_onder: 1195 } };
    const e = evaluateWindow(skewed, TEST_SUPPLIER_RULE);
    const breedte = e.groups.find((g) => g.group === "breedte")!;
    expect(breedte.minMm).toBe(1195);
    expect(breedte.maxMm).toBe(1203);
    expect(breedte.spreadMm).toBe(8);
    expect(breedte.exceeds).toBe(true);
    expect(e.status).toBe("afwijking");
    expect(e.order).toBeNull();

    const acknowledged = evaluateWindow({ ...skewed, acknowledged: { breedte: "1203|1201|1195" } }, TEST_SUPPLIER_RULE);
    expect(acknowledged.status).toBe("bestelmaat");
    // Kleinste maat telt (regel: min), niet een gemiddelde.
    expect(acknowledged.order!.widthMm).toBe(1195 - 4);

    // A new value in the group makes the acknowledgement lapse; other groups do not affect it.
    const remeasured = { ...skewed, measures: { ...skewed.measures, breedte_onder: 1194 }, acknowledged: { breedte: "1203|1201|1195" } };
    expect(evaluateWindow(remeasured, TEST_SUPPLIER_RULE).status).toBe("afwijking");
    const otherGroup = { ...skewed, measures: { ...skewed.measures, hoogte_links: 1502 }, acknowledged: { breedte: "1203|1201|1195" } };
    expect(evaluateWindow(otherGroup, TEST_SUPPLIER_RULE).status).toBe("bestelmaat");
  });

  it("binnen de tolerantie geen waarschuwing", () => {
    const e = evaluateWindow(complete, TEST_SUPPLIER_RULE);
    expect(e.groups.every((g) => !g.exceeds)).toBe(true);
  });

  it("te weinig montagediepte blokkeert", () => {
    const e = evaluateWindow({ ...complete, measures: { ...complete.measures, diepte: 30 } }, TEST_SUPPLIER_RULE);
    expect(e.depth.ok).toBe(false);
    expect(e.order).toBeNull();
  });

  it("niet bevestigd → ingevoerd, geen bestelmaat", () => {
    const e = evaluateWindow({ ...complete, confirmed: false }, TEST_SUPPLIER_RULE);
    expect(e.status).toBe("ingevoerd");
    expect(e.order).toBeNull();
  });

  it("gordijn: stofbreedte alleen bij een door de gebruiker gekozen volheid", () => {
    const rule = defaultRuleFor("gordijn", "wand");
    const base: WindowMeasurements = {
      measures: { rail_breedte: 2200, ophanghoogte_links: 2600, ophanghoogte_midden: 2604, ophanghoogte_rechts: 2598 },
      checks: {},
      acknowledged: {},
      confirmed: false,
      fullness: null,
    };
    expect(evaluateWindow(base, rule).fabricWidthMm).toBeNull();
    expect(evaluateWindow({ ...base, fullness: 2 }, rule).fabricWidthMm).toBe(4400);
    expect(evaluateWindow(base, rule).order).toBeNull();
  });
});
