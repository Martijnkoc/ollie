import { describe, expect, it } from "vitest";
import { computeFloor } from "@/lib/materials/floor";
import { computePlinths, computeRoomPlinth, piecesPerWall } from "@/lib/materials/plinths";

const room = (id: string, m2: number | null, included = true) => ({
  id,
  name: id,
  included,
  areaMm2: m2 === null ? null : m2 * 1_000_000,
  status: "derived" as const,
});

describe("vloer", () => {
  it("telt alleen geselecteerde ruimten en reageert op (de)selecteren", () => {
    const rows = [room("Woonkamer", 30), room("Keuken", 10), room("Badkamer", 5)];
    const all = computeFloor(rows, { wastePercent: 0, packM2: null });
    expect(all.selectedNetM2).toBeCloseTo(45, 9);
    const withoutBath = computeFloor(
      rows.map((r) => (r.id === "Badkamer" ? { ...r, included: false } : r)),
      { wastePercent: 0, packM2: null },
    );
    expect(withoutBath.selectedNetM2).toBeCloseTo(40, 9);
    expect(withoutBath.steps.join("\n")).toMatch(/Niet meegeteld: Badkamer/);
  });

  it("snijverlies: benodigd = netto × (1 + p/100)", () => {
    const r = computeFloor([room("Woonkamer", 40)], { wastePercent: 7, packM2: null });
    expect(r.requiredM2).toBeCloseTo(42.8, 9);
    expect(r.packs).toBeNull();
    expect(r.steps.join("\n")).toMatch(/geen standaardpakgrootte/);
  });

  it("pakken: ceil(benodigd / pak), exacte veelvouden niet naar boven", () => {
    expect(computeFloor([room("A", 20)], { wastePercent: 0, packM2: 2 }).packs).toBe(10);
    expect(computeFloor([room("A", 20.01)], { wastePercent: 0, packM2: 2 }).packs).toBe(11);
    // 40 × 1.07 = 42.8; 42.8 / 2.131 = 20.08 → 21
    expect(computeFloor([room("A", 40)], { wastePercent: 7, packM2: 2.131 }).packs).toBe(21);
  });

  it("geen bestelhoeveelheid zolang een geselecteerde ruimte geen oppervlakte heeft", () => {
    const r = computeFloor([room("Woonkamer", 30), room("Hal", null)], { wastePercent: 7, packM2: 2 });
    expect(r.selectedNetM2).toBeCloseTo(30, 9);
    expect(r.incompleteRooms).toEqual(["Hal"]);
    expect(r.requiredM2).toBeNull();
    expect(r.packs).toBeNull();
    expect(r.status).toBe("missing");
  });

  it("een uitgevinkte ruimte zonder oppervlakte blokkeert niets", () => {
    const r = computeFloor([room("Woonkamer", 30), room("Vide", null, false)], { wastePercent: 0, packM2: null });
    expect(r.requiredM2).toBeCloseTo(30, 9);
  });
});

describe("plinten", () => {
  const rect = [5400, 4100, 5400, 4100];

  it("omtrek min bevestigde deuropeningen; onbevestigde deur wordt niet afgetrokken", () => {
    const r = computeRoomPlinth({
      id: "w",
      name: "Woonkamer",
      edgesMm: rect,
      geometryStatus: "derived",
      wallsWithoutPlinth: [],
      doors: [
        { wall: 0, widthMm: 830, confirmed: true },
        { wall: 2, widthMm: 930, confirmed: false },
      ],
      obstaclePerimetersMm: [],
    });
    expect(r.perimeterMm).toBe(19_000);
    expect(r.doorDeductionMm).toBe(830);
    expect(r.netMm).toBe(19_000 - 830);
    expect(r.unconfirmedDoors).toBe(1);
    expect(r.status).toBe("check");
  });

  it("wanden zonder plint (kast) vallen af; een deur in die wand telt niet dubbel", () => {
    const r = computeRoomPlinth({
      id: "s",
      name: "Slaapkamer",
      edgesMm: rect,
      geometryStatus: "derived",
      wallsWithoutPlinth: [1],
      doors: [{ wall: 1, widthMm: 830, confirmed: true }],
      obstaclePerimetersMm: [],
    });
    expect(r.excludedWallsMm).toBe(4100);
    expect(r.doorDeductionMm).toBe(0);
    expect(r.netMm).toBe(19_000 - 4100);
    expect(r.status).toBe("derived");
  });

  it("onbekende vorm → nog meten, en geen totaal", () => {
    const t = computePlinths(
      [{ id: "h", name: "Hal", edgesMm: null, geometryStatus: "missing", wallsWithoutPlinth: [], doors: [], obstaclePerimetersMm: [] }],
      { marginPercent: 10, pieceLengthMm: 2400 },
    );
    expect(t.requiredMm).toBeNull();
    expect(t.status).toBe("missing");
  });

  it("marge en handelslengtes alleen als opgegeven", () => {
    const input = {
      id: "w",
      name: "Woonkamer",
      edgesMm: rect,
      geometryStatus: "derived" as const,
      wallsWithoutPlinth: [],
      doors: [],
      obstaclePerimetersMm: [],
    };
    const noLength = computePlinths([input], { marginPercent: 10, pieceLengthMm: null });
    expect(noLength.requiredMm).toBeCloseTo(20_900, 6);
    expect(noLength.piecesByTotal).toBeNull();
    const withLength = computePlinths([input], { marginPercent: 10, pieceLengthMm: 2400 });
    expect(withLength.piecesByTotal).toBe(9); // 20.9 / 2.4 = 8.7 → 9
    expect(withLength.piecesByWall).toBeGreaterThanOrEqual(8);
  });

  it("stukken per wand: volle stukken plus restanten first-fit", () => {
    // Walls 5400, 4100, 5400, 4100 with 2400 pieces: 2+1+2+1 full, remainders 600,1700,600,1700 → 2 extra bins (1700+600, 1700+600).
    expect(piecesPerWall(rect, 2400)).toBe(8);
    expect(piecesPerWall([2400, 2400], 2400)).toBe(2);
  });
});
