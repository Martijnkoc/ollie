/** Pure polygon helpers. Coordinates are in one consistent unit (mm unless stated otherwise). */

export type Point = { x: number; y: number };

/** Signed area by the shoelace formula; positive for counter-clockwise in a y-up system. */
export function signedArea(points: readonly Point[]) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function area(points: readonly Point[]) {
  return Math.abs(signedArea(points));
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Length of each edge i → i+1 (the last edge closes the polygon). */
export function edgeLengths(points: readonly Point[]) {
  return points.map((p, i) => distance(p, points[(i + 1) % points.length]!));
}

export function perimeter(points: readonly Point[]) {
  return edgeLengths(points).reduce((s, l) => s + l, 0);
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point, eps: number) {
  return (
    Math.abs(orientation(a, b, p)) <= eps * Math.max(1, distance(a, b)) &&
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.y >= Math.min(a.y, b.y) - eps &&
    p.y <= Math.max(a.y, b.y) + eps
  );
}

/** True when the open segments cross each other (touching at an endpoint or lying on the same line does not count). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0));
}

export type PolygonIssue = "te-weinig-punten" | "dubbele-punten" | "zelfdoorsnijding" | "geen-oppervlakte" | "ongeldige-waarde";

/** Checks whether a polygon describes one real floor: at least 3 distinct points, finite, not self-intersecting, area > 0. */
export function validatePolygon(points: readonly Point[], minArea = 1): PolygonIssue[] {
  const issues: PolygonIssue[] = [];
  if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return ["ongeldige-waarde"];
  if (points.length < 3) return ["te-weinig-punten"];
  for (let i = 0; i < points.length; i++) {
    if (distance(points[i]!, points[(i + 1) % points.length]!) < 1e-9) {
      issues.push("dubbele-punten");
      break;
    }
  }
  const n = points.length;
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Adjacent edges share a vertex; skip them (and the closing pair).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        issues.push("zelfdoorsnijding");
        break outer;
      }
    }
  }
  if (area(points) < minArea) issues.push("geen-oppervlakte");
  return issues;
}

/** Ray casting. Points on the boundary count as "on edge", not inside. */
export function pointInPolygon(p: Point, poly: readonly Point[], eps = 1e-6): "inside" | "outside" | "edge" {
  for (let i = 0; i < poly.length; i++) {
    if (onSegment(poly[i]!, poly[(i + 1) % poly.length]!, p, eps)) return "edge";
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

export function centroid(points: readonly Point[]): Point {
  const a = signedArea(points);
  if (Math.abs(a) < 1e-12) {
    const n = points.length || 1;
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/**
 * True when two rooms overlap in area. Rooms that only share a wall (touching edges or corners) do not overlap.
 * Detects crossing edges, a vertex strictly inside the other polygon, and identical/contained polygons.
 */
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return true;
    }
  }
  if (a.some((p) => pointInPolygon(p, b) === "inside")) return true;
  if (b.some((p) => pointInPolygon(p, a) === "inside")) return true;
  // Edges that start and end on the other's boundary but run through its interior (e.g. collinear walls).
  const midpoints = (poly: readonly Point[]) => poly.map((p, i) => ({ x: (p.x + poly[(i + 1) % poly.length]!.x) / 2, y: (p.y + poly[(i + 1) % poly.length]!.y) / 2 }));
  if (midpoints(a).some((p) => pointInPolygon(p, b) === "inside")) return true;
  if (midpoints(b).some((p) => pointInPolygon(p, a) === "inside")) return true;
  // Same outline, or one fully on the other's boundary: compare centroids.
  if (pointInPolygon(centroid(a), b) === "inside" || pointInPolygon(centroid(b), a) === "inside") return true;
  return false;
}

export function boundingBox(points: readonly Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
