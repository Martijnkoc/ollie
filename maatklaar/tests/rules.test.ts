import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatMm, parseDecimal, parseWholeMm } from "@/lib/format";
import { PRODUCT_RULES, productRule, productRulesFor } from "@/lib/rules";
import { orderDimensions, RULE_MAX_AGE_DAYS, type OrderInput } from "@/lib/rules/engine";
import { productRuleSchema, type ProductRule } from "@/lib/rules/schema";

const OK_CHECKS = { grepen: false, tegels: false, raam_openen: false, vensterbank: false } as const;
const OPENING = {
  breedte_boven: 1203,
  breedte_midden: 1201,
  breedte_onder: 1198,
  hoogte_links: 1500,
  hoogte_midden: 1496,
  hoogte_rechts: 1501,
};
const input = (patch: Partial<OrderInput> = {}): OrderInput => ({
  measures: { ...OPENING, diepte: 90 },
  answers: {},
  checks: OK_CHECKS,
  status: {},
  confirmed: true,
  shape: "rechthoek",
  today: "2026-10-19",
  ...patch,
});
/** A copy of a rule as if a person had checked it against the source today: to test the arithmetic of a record. */
const published = (r: ProductRule): ProductRule => ({ ...r, source: { ...r.source, status: "published", checkedOn: "2026-10-19" } });
/** The record as it is in the app: Tuiss records are concept until a person checks them. */
const asIs = (id: string) => productRule(id)!;
const rule = (id: string) => published(asIs(id));

describe("regelrecords", () => {
  it("alle records zijn geldig, uniek en Tuiss-regels zijn concept met bron-URL", () => {
    for (const r of PRODUCT_RULES) expect(productRuleSchema.safeParse(r).success, r.id).toBe(true);
    const tuiss = PRODUCT_RULES.filter((r) => r.source.supplier === "Tuiss");
    expect(tuiss.length).toBeGreaterThan(15);
    expect(tuiss.every((r) => r.source.status === "concept" && r.source.checkedOn === null)).toBe(true);
    expect(tuiss.every((r) => r.source.url === "https://www.raamdecoratievantuiss.nl/meten-voor-raamdecoratie")).toBe(true);
  });

  it("het schema weigert een dubbele leverancierscorrectie, een gepubliceerde regel zonder bron en onbekende maten", () => {
    const wave = asIs("tuiss-wave-in-de-dag");
    expect(productRuleSchema.safeParse({ ...wave, deductions: { ...wave.deductions!, appliedBy: "maatklaar" } }).success).toBe(false);
    expect(productRuleSchema.safeParse({ ...wave, source: { ...wave.source, status: "published" } }).success).toBe(false);
    const roller = asIs("tuiss-rolgordijn-enkel-in-de-dag");
    expect(productRuleSchema.safeParse({ ...roller, inputs: roller.inputs.filter((i) => i.key !== "breedte_boven") }).success).toBe(false);
  });

  it("minimale montagediepte per Tuiss-variant, zoals samengevat uit de gids", () => {
    const depth = (id: string, answers: OrderInput["answers"] = {}) =>
      orderDimensions(rule(id), input({ answers, measures: { ...OPENING, diepte: 1 } })).depth?.requiredMm;
    expect(depth("tuiss-jaloezie-hout-25-in-de-dag")).toBe(55);
    expect(depth("tuiss-jaloezie-hout-35-38-in-de-dag")).toBe(65);
    expect(depth("tuiss-jaloezie-hout-50-in-de-dag")).toBe(70);
    expect(depth("tuiss-jaloezie-hout-63-65-in-de-dag")).toBe(80);
    expect(depth("tuiss-jaloezie-alu-25-in-de-dag")).toBe(30);
    expect(depth("tuiss-jaloezie-alu-50-in-de-dag")).toBe(70);
    expect(depth("tuiss-vouwgordijn-in-de-dag")).toBe(50);
    expect(depth("tuiss-verticale-jaloezie-in-de-dag")).toBe(75);
    expect(depth("tuiss-rolgordijn-enkel-in-de-dag", { bevestiging: "plafond" })).toBe(50);
    expect(depth("tuiss-rolgordijn-enkel-in-de-dag", { bevestiging: "wand" })).toBe(70);
    expect(depth("tuiss-rolgordijn-dubbel-in-de-dag", { bevestiging: "plafond" })).toBe(120);
    expect(depth("tuiss-rolgordijn-dubbel-in-de-dag", { bevestiging: "wand" })).toBe(105);
    expect(depth("tuiss-rolgordijn-duo-in-de-dag")).toBe(85);
    expect(depth("tuiss-plisse-duo-in-de-dag")).toBe(45);
    expect(depth("tuiss-wave-in-de-dag")).toBe(75);
    // Not in the summary: unknown, asked, never assumed.
    expect(depth("tuiss-plisse-enkel-in-de-dag")).toBeNull();
    expect(orderDimensions(rule("tuiss-plisse-enkel-in-de-dag"), input()).questions.map((q) => q.id)).toContain("diepte-onbekend");
  });

  it("rolgordijn zonder gekozen bevestiging: diepte-eis onbekend, gegevens nodig", () => {
    const r = orderDimensions(rule("tuiss-rolgordijn-enkel-in-de-dag"), input());
    expect(r.status).toBe("needs_more_data");
    expect(r.missing).toContain("Bevestiging in de dag");
    expect(r.order).toBeNull();
  });

  it("tegels: de breedte tussen de tegels is verplicht zodra er tegels zijn", () => {
    const r = orderDimensions(
      rule("tuiss-rolgordijn-enkel-in-de-dag"),
      input({ answers: { bevestiging: "wand" }, checks: { ...OK_CHECKS, tegels: true } }),
    );
    expect(r.status).toBe("needs_more_data");
    expect(r.missing).toContain("Breedte tussen de tegels");
  });

  it("een erker of afwijkende vorm wordt niet als rechthoek behandeld", () => {
    for (const shape of ["erker", "afwijkend"] as const) {
      const r = orderDimensions(rule("tuiss-jaloezie-hout-50-in-de-dag"), input({ shape }));
      expect(r.status).toBe("unsupported");
      expect(r.order).toBeNull();
    }
  });

  it("de leverancier verwerkt de aftrek: wij trekken niets af en zeggen dat erbij", () => {
    const r = orderDimensions(rule("tuiss-wave-in-de-dag"), input());
    expect(r.status).toBe("order_ready");
    expect(r.order).toEqual({ orderWidthMm: 1198, orderHeightMm: 1496, byCode: null });
    expect(r.corrections.map((c) => [c.mm, c.appliedBy])).toEqual([
      [-10, "leverancier"],
      [-15, "leverancier"],
    ]);
    const blind = orderDimensions(rule("tuiss-jaloezie-hout-50-in-de-dag"), input());
    expect(blind.corrections).toEqual([expect.objectContaining({ mm: 0, appliedBy: "leverancier" })]);
  });

  it("ringen aan een roede: 30 mm wordt genoemd, niet opgeteld", () => {
    const r = orderDimensions(
      rule("tuiss-gordijn-wand"),
      input({
        measures: { rail_breedte: 2200, ophanghoogte_links: 2500, ophanghoogte_midden: 2495, ophanghoogte_rechts: 2490 },
        answers: { eindpunt: "vloer", ophanging: "ringen", nieuwe_rail: "nee" },
        checks: { radiator: false, vensterbank: false, ventilatierooster: false },
      }),
    );
    expect(r.corrections).toEqual([expect.objectContaining({ mm: 30, appliedBy: "leverancier" })]);
    expect(r.width!.mm).toBe(2200);
    // The curtain length is an open question in this rule: no order size until it is answered.
    expect(r.status).toBe("needs_verification");
    expect(r.order).toBeNull();
  });

  it("met een niet-gecontroleerde regel bestaat er geen bestelmaat, ook geen voorlopige", () => {
    const r = orderDimensions(asIs("tuiss-jaloezie-hout-50-in-de-dag"), input());
    expect(r.status).toBe("rule_not_verified");
    expect(r.order).toBeNull();
    expect(r.width).toBeNull();
    expect(r.suggestion).toBeNull();
    expect(r.corrections).toEqual([]);
    expect(r.blockedBy.join(" ")).toMatch(/niet door een mens tegen de volledige bron gecontroleerd/);
    // What still has to be measured is said, from the record's inputs.
    expect(orderDimensions(asIs("tuiss-rolgordijn-enkel-in-de-dag"), input()).status).toBe("needs_more_data");
  });

  it("order_ready alleen met een gecontroleerde, actuele regel én bevestigde of geaccepteerde maten", () => {
    const checked = rule("tuiss-jaloezie-hout-50-in-de-dag");
    expect(orderDimensions(checked, input()).status).toBe("order_ready");
    expect(orderDimensions(checked, input()).blockedBy).toEqual([]);
    // Not confirmed by the user.
    expect(orderDimensions(checked, input({ confirmed: false }))).toMatchObject({ status: "measurement_not_accepted", order: null });
    // A ScanTag value that is not accepted for ordering, or needs a retake, never gives an order size.
    for (const s of ["not_supported_for_ordering", "retake_required", "unconfirmed"] as const)
      expect(orderDimensions(checked, input({ status: { breedte_onder: s } }))).toMatchObject({
        status: "measurement_not_accepted",
        order: null,
      });
    expect(orderDimensions(checked, input({ status: { breedte_onder: "accepted" } })).status).toBe("order_ready");
    // A rule not checked for over a year is no longer current.
    const old = { ...checked, source: { ...checked.source, checkedOn: "2025-01-01" } };
    expect(RULE_MAX_AGE_DAYS).toBe(365);
    expect(orderDimensions(old, input())).toMatchObject({ status: "rule_not_verified", order: null });
  });

  it("bestelvelden zijn hele millimeters; ruwe waarden blijven onafgerond in de gekozen maat", () => {
    const r = orderDimensions(
      rule("tuiss-jaloezie-hout-50-in-de-dag"),
      input({ measures: { ...OPENING, breedte_onder: 1197.82, hoogte_midden: 1495.4, diepte: 90 } }),
    );
    expect(r.width!.mm).toBe(1197.82);
    expect(r.order).toEqual({ orderWidthMm: 1197, orderHeightMm: 1495, byCode: null });
    expect(Number.isInteger(r.order!.orderWidthMm)).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/hele millimeters, naar beneden/);
  });

  it("per product en montage: algemeen meetblad eerst, dan de Tuiss-varianten", () => {
    expect(productRulesFor("jaloezie", "in-de-dag").map((r) => r.id)).toEqual([
      "protocol-in-de-dag",
      ...["hout-25", "hout-35-38", "hout-50", "hout-63-65", "alu-25", "alu-50"].map((v) => `tuiss-jaloezie-${v}-in-de-dag`),
    ]);
    expect(productRulesFor("dakraam", "dakraam").map((r) => r.id)).toEqual(["protocol-dakraam", "tuiss-dakraam"]);
  });
});

type Golden = {
  name: string;
  rule: string;
  measures: OrderInput["measures"];
  answers: OrderInput["answers"];
  checks: OrderInput["checks"];
  expect: {
    status: string;
    width: number | null;
    height: number | null;
    order?: [number | null, number | null];
    depthOk?: boolean;
    question?: string;
    suggestion?: [number, number];
    byCode?: string;
  };
};
const golden = JSON.parse(readFileSync(path.join(import.meta.dirname, "golden", "rules.json"), "utf8")) as { cases: Golden[] };

describe("golden fixtures: ruwe opening → gekozen maat → bestelmaat", () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const r = orderDimensions(rule(c.rule), input({ measures: c.measures, answers: c.answers, checks: c.checks }));
      expect(r.status).toBe(c.expect.status);
      expect(r.width?.mm ?? null).toBe(c.expect.width);
      expect(r.height?.mm ?? null).toBe(c.expect.height);
      // An order size exists only when it may be ordered; otherwise there is none at all.
      if (r.status !== "order_ready") expect(r.order).toBeNull();
      else if (c.expect.order) expect([r.order?.orderWidthMm ?? null, r.order?.orderHeightMm ?? null]).toEqual(c.expect.order);
      if (c.expect.depthOk !== undefined) expect(r.depth?.ok).toBe(c.expect.depthOk);
      if (c.expect.question) expect(r.questions.map((q) => q.id)).toContain(c.expect.question);
      if (c.expect.suggestion) expect([r.suggestion?.widthMm, r.suggestion?.heightMm]).toEqual(c.expect.suggestion);
      if (c.expect.byCode && r.status === "order_ready") expect(r.order?.byCode).toBe(c.expect.byCode);
    });
  }
});

/** Deterministic pseudo-random numbers, so a failing property shows the same case again. */
function rng(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

describe("eigenschappen (property-based, 500 willekeurige ramen per eigenschap)", () => {
  it("de kleinste maat is altijd een van de gemeten maten en nooit groter dan een ervan", () => {
    const r = rng(1);
    for (let i = 0; i < 500; i++) {
      const m = Object.fromEntries(Object.keys(OPENING).map((k) => [k, 300 + Math.floor(r() * 3000)])) as typeof OPENING;
      const res = orderDimensions(rule("tuiss-jaloezie-hout-50-in-de-dag"), input({ measures: { ...m, diepte: 100 } }));
      const widths = [m.breedte_boven, m.breedte_midden, m.breedte_onder];
      expect(widths).toContain(res.width!.mm);
      expect(widths.every((w) => res.width!.mm <= w)).toBe(true);
      expect(res.order!.orderWidthMm).toBe(res.width!.mm);
    }
  });

  it("de tegelregel: onder 25 mm de bovenmaat, erboven de tegelmaat, precies 25 nooit een keuze", () => {
    const r = rng(2);
    for (let i = 0; i < 500; i++) {
      const top = 500 + Math.floor(r() * 2500);
      const diff = Math.floor(r() * 60) - 5;
      const res = orderDimensions(
        rule("tuiss-rolgordijn-enkel-in-de-dag"),
        input({
          measures: { ...OPENING, breedte_boven: top, breedte_tegels: top - diff, diepte: 200 },
          answers: { bevestiging: "wand" },
          checks: { ...OK_CHECKS, tegels: true },
        }),
      );
      if (diff === 25) expect(res.width).toBeNull();
      else expect(res.width!.mm).toBe(diff > 25 ? top - diff : top);
    }
  });

  it("met een conceptregel is de uitkomst nooit order_ready en nooit een getal", () => {
    const r = rng(3);
    const concepts = PRODUCT_RULES.filter((x) => x.source.status === "concept");
    for (let i = 0; i < 500; i++) {
      const rr = concepts[Math.floor(r() * concepts.length)]!;
      const measures = Object.fromEntries(
        rr.inputs.filter((x) => x.kind === "mm").map((x) => [x.key, 10 + Math.floor(r() * 4000)]),
      ) as OrderInput["measures"];
      const res = orderDimensions(
        rr,
        input({
          measures,
          answers: { bevestiging: "wand", dakraam_code: "X", eindpunt: "vloer", ophanging: "rail", nieuwe_rail: "ja" },
          checks: Object.fromEntries(rr.checks.map((c) => [c, r() < 0.5])),
        }),
      );
      expect(res.status).not.toBe("order_ready");
      expect(res.order).toBeNull();
    }
  });

  it("onmogelijke maten tellen niet: nul, negatief en geen getal zijn ontbrekend", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = orderDimensions(
        rule("tuiss-jaloezie-hout-50-in-de-dag"),
        input({ measures: { ...OPENING, breedte_boven: bad, diepte: 90 } }),
      );
      expect(res.status).toBe("needs_more_data");
      expect(res.missing).toContain("Breedte boven");
    }
  });

  it("millimeters en decimalen: invoer en weergave zijn elkaars omgekeerde, onzin wordt geweigerd", () => {
    const r = rng(4);
    for (let i = 0; i < 500; i++) {
      const mm = 1 + Math.floor(r() * 99_999);
      expect(parseWholeMm(formatMm(mm).replace(" mm", ""))).toBe(mm);
      const cm = Math.floor(r() * 100_000) / 10;
      expect(parseDecimal(String(cm).replace(".", ","))).toBeCloseTo(cm, 6);
    }
    for (const bad of ["", "-12", "12,5", "1.2.3", "12 cm", "abc", "1234567"]) expect(parseWholeMm(bad)).toBeNull();
    for (const bad of ["", "1,2,3", "1.2,3", "x", "-1"]) expect(parseDecimal(bad)).toBeNull();
  });
});
