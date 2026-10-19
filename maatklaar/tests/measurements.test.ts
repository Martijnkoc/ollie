import { describe, expect, it } from "vitest";
import { evaluateWindow, type WindowMeasurements } from "@/lib/measurements/evaluate";
import { ALL_RULES, PROTOCOLS, defaultRuleFor, findRule, rulesFor } from "@/lib/measurements/protocols";

/** The opening layer: completeness, spread between measuring points, checks. Order sizes: tests/rules.test.ts. */
const complete: WindowMeasurements = {
  measures: {
    breedte_boven: 1203,
    breedte_midden: 1201,
    breedte_onder: 1202,
    hoogte_links: 1500,
    hoogte_midden: 1499,
    hoogte_rechts: 1501,
    diepte: 60,
  },
  checks: { grepen: false, ventilatierooster: false, raam_openen: false, vensterbank: false, tegels: false },
  acknowledged: {},
  confirmed: true,
  fullness: null,
};
const inDay = defaultRuleFor("rolgordijn", "in-de-dag");

describe("meetprotocollen", () => {
  it("komen uit de productregels en rekenen zelf geen bestelmaat uit", () => {
    expect(PROTOCOLS.every((p) => p.kind === "protocol" && p.conversion.kind === "none")).toBe(true);
    expect(ALL_RULES.length).toBeGreaterThan(PROTOCOLS.length);
    expect(ALL_RULES.filter((r) => r.kind === "supplier").every((r) => r.manufacturer === "Tuiss" && r.source.url)).toBe(true);
  });

  it("kiest het algemene protocol per product en montagewijze, met leveranciersregels erachter", () => {
    expect(defaultRuleFor("rolgordijn", "in-de-dag").id).toBe("protocol-in-de-dag");
    expect(defaultRuleFor("plisse", "op-de-dag").id).toBe("protocol-op-de-dag");
    expect(defaultRuleFor("gordijn", "plafond").id).toBe("protocol-gordijn-plafond");
    expect(defaultRuleFor("onbekend", "onbekend").id).toBe("protocol-in-de-dag");
    expect(defaultRuleFor("dakraam", "dakraam").id).toBe("protocol-dakraam");
    expect(defaultRuleFor("plisse", "schroefloos").id).toBe("protocol-schroefloos");
    expect(rulesFor("rolgordijn", "in-de-dag").map((r) => r.id)).toEqual([
      "protocol-in-de-dag",
      "tuiss-rolgordijn-enkel-in-de-dag",
      "tuiss-rolgordijn-dubbel-in-de-dag",
      "tuiss-rolgordijn-duo-in-de-dag",
    ]);
    // The width between tiles is only asked after "yes, there are tiles": optional in the protocol.
    expect(findRule("tuiss-rolgordijn-enkel-in-de-dag")!.optional).toContain("breedte_tegels");
  });
});

describe("raammeting (opening)", () => {
  it("compleet en bevestigd", () => {
    const e = evaluateWindow(complete, inDay);
    expect(e.status).toBe("bevestigd");
    expect(e.missing).toEqual([]);
  });

  it("een ontbrekende verplichte maat", () => {
    const measures = { ...complete.measures };
    delete measures.hoogte_rechts;
    const e = evaluateWindow({ ...complete, measures }, inDay);
    expect(e.status).toBe("nog-meten");
    expect(e.missing).toEqual(["hoogte_rechts"]);
  });

  it("afwijkende meetpunten: waarschuwen, niet middelen, pas door na bevestiging", () => {
    const skewed = { ...complete, measures: { ...complete.measures, breedte_onder: 1195 } };
    const e = evaluateWindow(skewed, inDay);
    const breedte = e.groups.find((g) => g.group === "breedte")!;
    expect([breedte.minMm, breedte.maxMm, breedte.spreadMm, breedte.exceeds]).toEqual([1195, 1203, 8, true]);
    expect(e.status).toBe("afwijking");
    expect(evaluateWindow({ ...skewed, acknowledged: { breedte: "1203|1201|1195" } }, inDay).status).toBe("bevestigd");
    // A new value in the group makes the acknowledgement lapse; other groups do not affect it.
    const remeasured = { ...skewed, measures: { ...skewed.measures, breedte_onder: 1194 }, acknowledged: { breedte: "1203|1201|1195" } };
    expect(evaluateWindow(remeasured, inDay).status).toBe("afwijking");
    const otherGroup = { ...skewed, measures: { ...skewed.measures, hoogte_links: 1502 }, acknowledged: { breedte: "1203|1201|1195" } };
    expect(evaluateWindow(otherGroup, inDay).status).toBe("bevestigd");
  });

  it("camerawaarden verschillen tot hun foutmarge zonder dat dat een afwijking is", () => {
    const camera = {
      method: "camera" as const,
      uncertaintyMm: 9,
      shots: 2,
      scaleReference: "a4" as const,
      validation: "not_validated" as const,
      capturedAt: "",
    };
    const skewed = { ...complete, measures: { ...complete.measures, breedte_onder: 1195 } };
    const e = evaluateWindow({ ...skewed, sources: { breedte_boven: camera, breedte_midden: camera, breedte_onder: camera } }, inDay);
    expect(e.groups.find((g) => g.group === "breedte")!.toleranceMm).toBe(9);
    expect(e.status).toBe("bevestigd");
    expect(e.camera).toEqual({ keys: ["breedte_boven", "breedte_midden", "breedte_onder"], maxUncertaintyMm: 9 });
  });

  it("niet bevestigd → ingevoerd", () => {
    expect(evaluateWindow({ ...complete, confirmed: false }, inDay).status).toBe("ingevoerd");
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
  });
});
