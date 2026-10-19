import type { Length, RoomShape, Scale } from "@/lib/projects/schema";
import { combine, type Status } from "@/lib/projects/status";
import { area, edgeLengths, validatePolygon, type Point } from "./polygon";
import { m2ToMm2 } from "./units";

export type ShapeGeometry = {
  /** Outline in millimetres, when the shape is known. */
  polygonMm: Point[] | null;
  areaMm2: number | null;
  edgesMm: number[] | null;
  perimeterMm: number | null;
  status: Status;
  issues: string[];
};

const none = (status: Status, issues: string[]): ShapeGeometry => ({
  polygonMm: null,
  areaMm2: null,
  edgesMm: null,
  perimeterMm: null,
  status,
  issues,
});

function fromPolygon(points: Point[], status: Status, issues: string[] = []): ShapeGeometry {
  const problems = validatePolygon(points);
  if (problems.length) {
    const text: Record<string, string> = {
      "te-weinig-punten": "Een ruimte heeft minstens drie hoekpunten nodig.",
      "dubbele-punten": "Twee hoekpunten liggen op dezelfde plek.",
      zelfdoorsnijding: "De omtrek kruist zichzelf. Zet de hoekpunten in volgorde langs de wand.",
      "geen-oppervlakte": "De vorm heeft geen oppervlakte.",
      "ongeldige-waarde": "Een hoekpunt heeft een ongeldige waarde.",
    };
    return none("missing", [...issues, ...problems.map((p) => text[p]!)]);
  }
  const edgesMm = edgeLengths(points);
  return { polygonMm: points, areaMm2: area(points), edgesMm, perimeterMm: edgesMm.reduce((s, l) => s + l, 0), status, issues };
}

const missingLabel = (l: Length, name: string) => (l.mm === null ? [`${name} ontbreekt.`] : []);

/**
 * Turns a room shape into a millimetre outline. Rectangles and L-shapes start at the origin; drawn rooms
 * are converted from page units with the page scale. Nothing is guessed: a missing length or a missing
 * scale leaves the geometry empty with a plain-language reason.
 */
export function shapeGeometry(shape: RoomShape, scales: readonly Scale[]): ShapeGeometry {
  switch (shape.kind) {
    case "rect": {
      const issues = [...missingLabel(shape.length, "Lengte"), ...missingLabel(shape.width, "Breedte")];
      if (issues.length) return none("missing", issues);
      const L = shape.length.mm!;
      const W = shape.width.mm!;
      return fromPolygon(
        [
          { x: 0, y: 0 },
          { x: L, y: 0 },
          { x: L, y: W },
          { x: 0, y: W },
        ],
        combine([shape.length.status, shape.width.status]),
      );
    }
    case "l": {
      const issues = [
        ...missingLabel(shape.length, "Totale lengte"),
        ...missingLabel(shape.width, "Totale breedte"),
        ...missingLabel(shape.notchLength, "Lengte van de uitsparing"),
        ...missingLabel(shape.notchWidth, "Breedte van de uitsparing"),
      ];
      if (issues.length) return none("missing", issues);
      const L = shape.length.mm!;
      const W = shape.width.mm!;
      const a = shape.notchLength.mm!;
      const b = shape.notchWidth.mm!;
      if (a >= L || b >= W) return none("missing", ["De uitsparing moet kleiner zijn dan de totale lengte en breedte."]);
      // Corner cut from the bounding rectangle, listed clockwise in a y-down system (top-left origin).
      const polygons: Record<typeof shape.corner, Point[]> = {
        nw: [
          { x: a, y: 0 },
          { x: L, y: 0 },
          { x: L, y: W },
          { x: 0, y: W },
          { x: 0, y: b },
          { x: a, y: b },
        ],
        ne: [
          { x: 0, y: 0 },
          { x: L - a, y: 0 },
          { x: L - a, y: b },
          { x: L, y: b },
          { x: L, y: W },
          { x: 0, y: W },
        ],
        se: [
          { x: 0, y: 0 },
          { x: L, y: 0 },
          { x: L, y: W - b },
          { x: L - a, y: W - b },
          { x: L - a, y: W },
          { x: 0, y: W },
        ],
        sw: [
          { x: 0, y: 0 },
          { x: L, y: 0 },
          { x: L, y: W },
          { x: a, y: W },
          { x: a, y: W - b },
          { x: 0, y: W - b },
        ],
      };
      return fromPolygon(
        polygons[shape.corner],
        combine([shape.length.status, shape.width.status, shape.notchLength.status, shape.notchWidth.status]),
      );
    }
    case "drawn": {
      if (shape.points.length < 3) return none("missing", ["Teken minstens drie hoekpunten op de plattegrond."]);
      const scale = scales.find((s) => s.page === shape.page);
      if (!scale) return none("missing", ["De schaal van deze pagina is nog niet bepaald. Kalibreer met een bekende maat."]);
      const pts = shape.points.map((p) => ({ x: p.x * scale.mmPerUnit, y: p.y * scale.mmPerUnit }));
      const issues = scale.status === "auto" ? ["De schaal is automatisch bepaald en nog niet door jou bevestigd."] : [];
      return fromPolygon(pts, combine([shape.status, scale.status]), issues);
    }
    case "area": {
      if (shape.m2 === null) return none("missing", ["Oppervlakte ontbreekt."]);
      return {
        polygonMm: null,
        areaMm2: m2ToMm2(shape.m2),
        edgesMm: null,
        perimeterMm: null,
        status: combine([shape.status]),
        issues: ["Alleen de oppervlakte is bekend, niet de vorm. Voor plinten zijn lengte en breedte of een getekende vorm nodig."],
      };
    }
  }
}
