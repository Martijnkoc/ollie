import { describe, expect, it } from "vitest";
import { CATALOG, computeCategory, moduleByKey, worstStatus } from "@/lib/materials/catalog";
import { computeProject } from "@/lib/projects/compute";
import { newProject, newRoom, newWindow } from "@/lib/projects/factory";
import type { Project } from "@/lib/projects/schema";

const rect = (l: number, w: number, status: "confirmed" | "auto" = "confirmed") => ({
  kind: "rect" as const,
  length: { mm: l, status, source: status === "auto" ? ("pdf-tekst" as const) : ("gebruiker" as const) },
  width: { mm: w, status, source: status === "auto" ? ("pdf-tekst" as const) : ("gebruiker" as const) },
});

function project(patch: Partial<Project> = {}): Project {
  return {
    ...newProject(new Date("2026-10-19T10:00:00Z")),
    rooms: [newRoom("Woonkamer", rect(5000, 4000)), newRoom("Slaapkamer", rect(3000, 3000)), newRoom("Badkamer", rect(2000, 2500))],
    ...patch,
  };
}

const run = (
  key: Parameters<typeof moduleByKey>[0],
  p: Project,
  inputs: Record<string, number | null> = {},
  roomIds: string[] | null = null,
) => computeCategory(moduleByKey(key), computeProject(p), { roomIds, inputs, doorsOnPlan: 0 });

describe("materiaalbibliotheek", () => {
  it("elke module heeft een versie, datum, formule en invoer met eenheden", () => {
    for (const m of CATALOG) {
      expect(m.version).toMatch(/^\d+\.\d+$/);
      expect(m.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.formula.length).toBeGreaterThan(10);
      for (const i of m.inputs) expect(i.unit).toBeTruthy();
    }
  });

  it("laminaat: snijverlies als aanname blijft 'geschat', met eigen waarden en pakinhoud 'klaar voor bestellen'", () => {
    const p = project();
    const assumed = run("laminaat", p);
    // Default rooms for floors: those that count for the floor (the bathroom does too unless excluded).
    expect(assumed.lines[0]!.quantity).toBeCloseTo((20 + 9 + 5) * 1.07, 9);
    expect(assumed.status).toBe("geschat");
    expect(assumed.assumptions.join(" ")).toMatch(/Snijverlies/);

    const own = run("laminaat", p, { snijverlies: 10, pak_m2: 2.22 });
    expect(own.lines[0]!.quantity).toBeCloseTo(34 * 1.1, 9);
    expect(own.lines[1]!.quantity).toBe(Math.ceil((34 * 1.1) / 2.22));
    expect(own.status).toBe("klaar_voor_bestellen");
    const noPack = run("laminaat", p, { snijverlies: 10 });
    expect(noPack.status).toBe("berekend");
    expect(noPack.lines[1]!.quantity).toBeNull();
  });

  it("per categorie ruimtes uitsluiten: geen laminaat in de badkamer", () => {
    const p = project();
    const ids = p.rooms.filter((r) => r.name !== "Badkamer").map((r) => r.id);
    expect(run("laminaat", p, { snijverlies: 0 }, ids).lines[0]!.quantity).toBeCloseTo(29, 9);
  });

  it("afronden naar hele pakken pas aan het eind, ook bij exacte deling", () => {
    const p = project({ rooms: [newRoom("Woonkamer", rect(5000, 4000))] });
    expect(run("laminaat", p, { snijverlies: 0, pak_m2: 2 }).lines[1]!.quantity).toBe(10);
    expect(run("laminaat", p, { snijverlies: 0, pak_m2: 2.1 }).lines[1]!.quantity).toBe(10);
    expect(run("laminaat", p, { snijverlies: 5, pak_m2: 2.1 }).lines[1]!.quantity).toBe(10);
    expect(run("laminaat", p, { snijverlies: 6, pak_m2: 2.1 }).lines[1]!.quantity).toBe(11);
  });

  it("onbevestigde ruimtes maken een berekening 'geschat'; een ontbrekende maat geeft geen hoeveelheid", () => {
    const auto = project({ rooms: [newRoom("Woonkamer", rect(5000, 4000, "auto"))] });
    expect(run("laminaat", auto, { snijverlies: 0, pak_m2: 2 }).status).toBe("geschat");
    const empty = project({
      rooms: [
        newRoom("Woonkamer", {
          kind: "rect",
          length: { mm: 5000, status: "confirmed", source: "gebruiker" },
          width: { mm: null, status: "missing", source: "gebruiker" },
        }),
      ],
    });
    const r = run("laminaat", empty, { snijverlies: 0, pak_m2: 2 });
    expect(r.status).toBe("niet_genoeg_gegevens");
    expect(r.lines[0]!.quantity).toBeNull();
    expect(r.missing.join(" ")).toMatch(/Woonkamer/);
    expect(run("laminaat", project({ rooms: [] })).status).toBe("niet_genoeg_gegevens");
  });

  it("verf: wanden × hoogte × lagen / dekking, ramen alleen afgetrokken als je ze invult", () => {
    const p = project({ rooms: [newRoom("Woonkamer", rect(5000, 4000))] });
    // Perimeter 18 m × 2,50 m = 45 m²; 2 coats at 9 m²/L = 10 L.
    const r = run("verf", p, { plafondhoogte: 2.5, lagen: 2, dekking: 9 });
    expect(r.lines[0]!.quantity).toBeCloseTo(45, 9);
    expect(r.lines[1]!.quantity).toBeCloseTo(10, 9);
    expect(r.status).toBe("berekend");
    expect(r.steps.join(" ")).toMatch(/niet afgetrokken/);
    const withOpenings = run("verf", p, { plafondhoogte: 2.5, lagen: 2, dekking: 9, openingen_m2: 4.5, blik_l: 2.5 });
    expect(withOpenings.lines[1]!.quantity).toBeCloseTo(9, 9);
    expect(withOpenings.lines[2]!.quantity).toBe(4);
    expect(withOpenings.status).toBe("klaar_voor_bestellen");
    const ceiling = run("verf", p, { plafondhoogte: 2.5, lagen: 2, dekking: 9, plafond: 1 });
    expect(ceiling.lines[0]!.quantity).toBeCloseTo(65, 9);
  });

  it("verf zonder eigen plafondhoogte is een schatting, en zegt welke aanname", () => {
    const r = run("verf", project({ rooms: [newRoom("Woonkamer", rect(5000, 4000))] }));
    expect(r.status).toBe("geschat");
    expect(r.assumptions.join(" ")).toMatch(/Plafondhoogte/);
    // An area-only room has no wall length: no paint quantity is invented.
    const areaOnly = project({ rooms: [newRoom("Hal", { kind: "area", m2: 6, status: "confirmed", source: "gebruiker" })] });
    const a = run("verf", areaOnly, { plafondhoogte: 2.5, lagen: 2, dekking: 9 });
    expect(a.status).toBe("niet_genoeg_gegevens");
    expect(a.missing.join(" ")).toMatch(/omtrek/i);
  });

  it("tegels en dozen, behang in rollen met patroonrapport", () => {
    const p = project({ rooms: [newRoom("Keuken", rect(3000, 2000))] });
    const t = run("tegels", p, { snijverlies: 10, tegel_lengte: 600, tegel_breedte: 300, doos_m2: 1.44 });
    expect(t.lines[1]!.quantity).toBe(Math.ceil((6 * 1.1) / 0.18));
    expect(t.lines[2]!.quantity).toBe(Math.ceil((6 * 1.1) / 1.44));
    expect(run("tegels", p).status).toBe("niet_genoeg_gegevens");

    // Perimeter 10 m: ⌈10000 / 530⌉ = 19 strips; ⌊10050 / (2600 + 640 + 100)⌋ = 3 per roll → 7 rolls.
    const b = run("behang", p, { plafondhoogte: 2.6, rol_breedte: 0.53, rol_lengte: 10.05, rapport: 64, snijmarge: 10 });
    expect(b.lines[0]!.quantity).toBe(19);
    expect(b.lines[1]!.quantity).toBe(7);
    expect(b.status).toBe("klaar_voor_bestellen");
  });

  it("raamproducten: zonder maten 'niet genoeg gegevens', zonder leveranciersregel nooit 'klaar voor bestellen'", () => {
    const base = project();
    const w = newWindow([], { product: "rolgordijn", mounting: "in-de-dag", ruleId: "protocol-in-de-dag" });
    const none = run("rolgordijnen", { ...base, windows: [w] });
    expect(none.status).toBe("niet_genoeg_gegevens");
    const measured = {
      ...w,
      measures: {
        breedte_boven: 1200,
        breedte_midden: 1201,
        breedte_onder: 1200,
        hoogte_links: 1500,
        hoogte_midden: 1500,
        hoogte_rechts: 1501,
        diepte: 60,
      },
      checks: { grepen: false, ventilatierooster: false, raam_openen: false, vensterbank: false },
      confirmed: true,
    };
    const r = run("rolgordijnen", { ...base, windows: [measured] });
    expect(r.status).toBe("wacht_op_controle");
    expect(r.lines[0]!.note).toMatch(/leverancier/);
    // Rolluiken always need an extra check once measured.
    const rolluik = {
      ...measured,
      product: "rolluik" as const,
      mounting: "voorzet" as const,
      ruleId: "protocol-rolluik-voorzet",
      measures: { ...measured.measures, ruimte_boven: 250 },
      checks: { kast_ruimte: true, geleiders: true, stroom: false, vensterbank: false, raam_openen: false },
    };
    // Without the space above the window (for the box) a rolluik is not measured yet.
    expect(run("rolluiken", { ...base, windows: [{ ...rolluik, measures: measured.measures }] }).status).toBe("niet_genoeg_gegevens");
    expect(run("rolluiken", { ...base, windows: [rolluik] }).status).toBe("extra_controle_nodig");
    expect(worstStatus(["klaar_voor_bestellen", "wacht_op_controle"])).toBe("wacht_op_controle");
  });
});
