import { describe, expect, it } from "vitest";
import { area, perimeter, polygonsOverlap, validatePolygon, pointInPolygon, type Point } from "@/lib/geometry/polygon";
import { shapeGeometry } from "@/lib/geometry/shapes";
import { MM_PER_PT, ceilSafe, mm2ToM2, mmPerPointForNotation, mmPerUnitFromCalibration, unitsToMm } from "@/lib/geometry/units";
import { formatM2FromMm2, formatMFromMm, formatMm, parseDecimal, parseMetresToMm, parseWholeMm } from "@/lib/format";
import type { Length, Scale } from "@/lib/projects/schema";

const confirmed = (mm: number): Length => ({ mm, status: "confirmed", source: "gebruiker" });
const auto = (mm: number): Length => ({ mm, status: "auto", source: "pdf-tekst" });
const missing: Length = { mm: null, status: "missing", source: "gebruiker" };

describe("eenheden en conversies", () => {
  it("rekent PDF-punten, schaalnotatie en kalibratie aantoonbaar om", () => {
    expect(MM_PER_PT).toBeCloseTo(0.352777, 5);
    // 1:100 on paper: 72 pt (one inch) is 25.4 mm on paper and 2540 mm in reality.
    expect(unitsToMm(72, mmPerPointForNotation(100))).toBeCloseTo(2540, 6);
    // A 300-unit line that is 4.5 m in reality.
    expect(mmPerUnitFromCalibration(300, 4500)).toBe(15);
    expect(mmPerUnitFromCalibration(0, 4500)).toBeNull();
    expect(mm2ToM2(12_345_678)).toBeCloseTo(12.345678, 9);
  });

  it("rondt pas bij weergave af, in Nederlandse notatie", () => {
    expect(formatM2FromMm2(12_345_678)).toBe("12,35 m²");
    expect(formatMFromMm(4200)).toBe("4,20 m");
    expect(formatMm(1234)).toBe("1234 mm");
  });

  it("leest Nederlandse invoer zonder te gokken", () => {
    expect(parseDecimal("4,20")).toBe(4.2);
    expect(parseDecimal("4.20")).toBe(4.2);
    expect(parseDecimal("4,2,0")).toBeNull();
    expect(parseDecimal("4m")).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect(parseMetresToMm("3,455")).toBe(3455);
    expect(parseWholeMm("1250")).toBe(1250);
    expect(parseWholeMm("12,5")).toBeNull();
  });

  it("ceilSafe telt een exact veelvoud niet als extra", () => {
    expect(ceilSafe(20.000000000001)).toBe(20);
    expect(ceilSafe(20.0001)).toBe(21);
    expect(ceilSafe((0.1 + 0.2) * 10)).toBe(3);
  });
});

describe("polygonen", () => {
  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: 5400, y: 0 },
    { x: 5400, y: 4100 },
    { x: 0, y: 4100 },
  ];

  it("berekent oppervlakte en omtrek van een rechthoek", () => {
    expect(area(rect)).toBe(5400 * 4100);
    expect(perimeter(rect)).toBe(2 * (5400 + 4100));
  });

  it("is onafhankelijk van de draairichting", () => {
    expect(area([...rect].reverse())).toBe(area(rect));
  });

  it("herkent zelfdoorsnijding, te weinig punten en nul-oppervlakte", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(validatePolygon(bowtie)).toContain("zelfdoorsnijding");
    expect(validatePolygon(rect.slice(0, 2))).toEqual(["te-weinig-punten"]);
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ]),
    ).toContain("geen-oppervlakte");
    expect(validatePolygon(rect)).toEqual([]);
  });

  it("aangrenzende kamers overlappen niet, overlappende wel", () => {
    const right = rect.map((p) => ({ x: p.x + 5400, y: p.y }));
    expect(polygonsOverlap(rect, right)).toBe(false);
    const shifted = rect.map((p) => ({ x: p.x + 1000, y: p.y + 1000 }));
    expect(polygonsOverlap(rect, shifted)).toBe(true);
    expect(polygonsOverlap(rect, rect)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 2000 }, rect)).toBe("edge");
  });
});

describe("vormen naar oppervlakte", () => {
  it("rechthoek: lengte × breedte", () => {
    const g = shapeGeometry({ kind: "rect", length: confirmed(5400), width: confirmed(4100) }, []);
    expect(g.areaMm2).toBe(22_140_000);
    expect(g.status).toBe("derived");
  });

  it("L-vorm zonder overschatting door de omsluitende rechthoek", () => {
    // 6 × 5 m with a 2 × 2 m corner cut away: 30 − 4 = 26 m², not 30.
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const g = shapeGeometry(
        { kind: "l", length: confirmed(6000), width: confirmed(5000), notchLength: confirmed(2000), notchWidth: confirmed(2000), corner },
        [],
      );
      expect(g.areaMm2).toBe(26_000_000);
      expect(g.perimeterMm).toBe(22_000);
      expect(g.edgesMm).toHaveLength(6);
    }
  });

  it("L-vorm met een te grote uitsparing wordt geweigerd", () => {
    const g = shapeGeometry(
      {
        kind: "l",
        length: confirmed(3000),
        width: confirmed(3000),
        notchLength: confirmed(3000),
        notchWidth: confirmed(1000),
        corner: "ne",
      },
      [],
    );
    expect(g.areaMm2).toBeNull();
    expect(g.status).toBe("missing");
  });

  it("getekende kamer zonder schaal krijgt geen oppervlakte", () => {
    const shape = {
      kind: "drawn" as const,
      page: 0,
      status: "confirmed" as const,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
    };
    const g = shapeGeometry(shape, []);
    expect(g.areaMm2).toBeNull();
    expect(g.status).toBe("missing");
    expect(g.issues.join(" ")).toMatch(/schaal/i);
  });

  it("getekende kamer met bevestigde schaal: px → mm → m²", () => {
    const scale: Scale = {
      page: 0,
      mmPerUnit: 40,
      method: "kalibratie",
      status: "confirmed",
      reference: null,
      notation: null,
      evidence: null,
    };
    const shape = {
      kind: "drawn" as const,
      page: 0,
      status: "confirmed" as const,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
    };
    const g = shapeGeometry(shape, [scale]);
    expect(g.areaMm2).toBe(4000 * 2000);
    expect(g.status).toBe("derived");
    const unconfirmed = shapeGeometry(shape, [{ ...scale, status: "auto" }]);
    expect(unconfirmed.status).toBe("check");
  });

  it("automatisch herkende maten leveren 'nog controleren', ontbrekende 'nog meten'", () => {
    expect(shapeGeometry({ kind: "rect", length: auto(5400), width: confirmed(4100) }, []).status).toBe("check");
    expect(shapeGeometry({ kind: "rect", length: missing, width: confirmed(4100) }, []).status).toBe("missing");
  });

  it("alleen-oppervlakte: wel m², geen omtrek", () => {
    const g = shapeGeometry({ kind: "area", m2: 22.5, status: "confirmed", source: "gebruiker" }, []);
    expect(g.areaMm2).toBe(22_500_000);
    expect(g.perimeterMm).toBeNull();
  });
});
