import { describe, expect, it } from "vitest";
import { computeProject } from "@/lib/projects/compute";
import { emptyRect, newProject, newRoom, newWindow, nextWindowCode, userLength } from "@/lib/projects/factory";
import { projectSchema, type Project, type Scale } from "@/lib/projects/schema";

function project(patch: Partial<Project> = {}): Project {
  return { ...newProject(new Date("2026-10-19T10:00:00Z")), ...patch };
}

const rect = (l: number, w: number, status: "confirmed" | "auto" = "confirmed") => ({
  kind: "rect" as const,
  length: { mm: l, status, source: status === "auto" ? ("pdf-tekst" as const) : ("gebruiker" as const) },
  width: { mm: w, status, source: status === "auto" ? ("pdf-tekst" as const) : ("gebruiker" as const) },
});

const scale: Scale = {
  page: 0,
  mmPerUnit: 35.27777,
  method: "schaalnotatie",
  status: "auto",
  reference: null,
  notation: 100,
  evidence: null,
};
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("gecontroleerd-label", () => {
  it("wordt alleen gegeven als alle meegetelde ruimten op bevestigde invoer rusten", () => {
    const p = project({ rooms: [newRoom("Woonkamer", rect(5400, 4100)), newRoom("Keuken", rect(3000, 2500))] });
    expect(computeProject(p).verified).toBe(true);
  });

  it("niet bij een ontbrekende schaal", () => {
    const p = project({ rooms: [newRoom("Woonkamer", { kind: "drawn", page: 0, status: "confirmed", points: square })] });
    const c = computeProject(p);
    expect(c.rooms[0]!.netAreaMm2).toBeNull();
    expect(c.verified).toBe(false);
  });

  it("niet bij een automatisch bepaalde, onbevestigde schaal", () => {
    const p = project({ scales: [scale], rooms: [newRoom("Woonkamer", { kind: "drawn", page: 0, status: "confirmed", points: square })] });
    const c = computeProject(p);
    expect(c.rooms[0]!.netAreaMm2).not.toBeNull();
    expect(c.rooms[0]!.status).toBe("check");
    expect(c.verified).toBe(false);
    const confirmed = computeProject({ ...p, scales: [{ ...scale, status: "confirmed" }] });
    expect(confirmed.verified).toBe(true);
  });

  it("niet bij een ontbrekende kritieke maat of automatisch herkende maten", () => {
    const missingWidth = project({ rooms: [newRoom("Woonkamer", { kind: "rect", length: userLength(5400), width: userLength(null) })] });
    expect(computeProject(missingWidth).verified).toBe(false);
    const auto = project({ rooms: [newRoom("Woonkamer", rect(5400, 4100, "auto"))] });
    expect(computeProject(auto).verified).toBe(false);
  });

  it("niet bij een automatisch herkende, onbevestigde kamernaam", () => {
    const p = project({ rooms: [newRoom("Woonkamer", rect(5400, 4100), { nameStatus: "auto", origin: "auto" })] });
    expect(computeProject(p).verified).toBe(false);
  });

  it("niet bij overlappende kamers (dubbele telling)", () => {
    const s: Scale = { ...scale, status: "confirmed" };
    const p = project({
      scales: [s],
      rooms: [
        newRoom("Woonkamer", { kind: "drawn", page: 0, status: "confirmed", points: square }),
        newRoom("Keuken", { kind: "drawn", page: 0, status: "confirmed", points: square.map((pt) => ({ x: pt.x + 50, y: pt.y })) }),
      ],
    });
    const c = computeProject(p);
    expect(c.overlaps).toHaveLength(1);
    expect(c.verified).toBe(false);
  });

  it("niet zonder geselecteerde ruimten", () => {
    expect(computeProject(project()).verified).toBe(false);
  });
});

describe("project", () => {
  it("obstakels worden afgetrokken van de vloer", () => {
    const room = newRoom("Woonkamer", rect(5000, 4000), {
      obstacles: [{ id: "k", name: "Schoorsteen", length: userLength(500), width: userLength(400), plinthAround: true }],
    });
    const c = computeProject(project({ rooms: [room] }));
    expect(c.rooms[0]!.netAreaMm2).toBe(20_000_000 - 200_000);
    // Plinten: omtrek 18 m + rond schoorsteen 1,8 m.
    expect(c.plinths.rooms[0]!.netMm).toBe(18_000 + 1800);
  });

  it("signaleert dubbele namen", () => {
    const c = computeProject(project({ rooms: [newRoom("Slaapkamer", emptyRect()), newRoom("slaapkamer", emptyRect())] }));
    expect(c.duplicateNames).toEqual(["Slaapkamer"]);
  });

  it("buitenruimten en vides staan standaard uit voor de vloer, maar zijn aan te vinken", () => {
    expect(newRoom("Balkon", emptyRect()).includeFloor).toBe(false);
    expect(newRoom("Vide", emptyRect()).includeFloor).toBe(false);
    expect(newRoom("Woonkamer", emptyRect()).includeFloor).toBe(true);
    expect(newRoom("Badkamer", emptyRect()).includePlinth).toBe(false);
  });

  it("raamcodes lopen door en worden niet hergebruikt", () => {
    const a = newWindow([]);
    const b = newWindow([a]);
    expect([a.code, b.code]).toEqual(["R01", "R02"]);
    expect(nextWindowCode([b])).toBe("R03");
  });

  it("een nieuw project voldoet aan het schema", () => {
    const p = project({ rooms: [newRoom("Woonkamer", rect(5400, 4100))], windows: [newWindow([])] });
    expect(projectSchema.safeParse(p).success).toBe(true);
  });
});
