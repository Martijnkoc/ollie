import "server-only";
import { z } from "zod";
import type { Address, AddressSuggestion, Building } from "./types";

/**
 * Adapters for PDOK Locatieserver v3_1 (suggest + lookup) and the BAG OGC API Features v2.
 * Field names follow the PDOK documentation; every response is parsed defensively and only fields that
 * are actually present are passed on. Nothing here logs the address that was searched for.
 */

export type PdokConfig = { locatieserverUrl: string; bagUrl: string; timeoutMs: number };

export function pdokConfig(env: Record<string, string | undefined> = process.env): PdokConfig {
  return {
    locatieserverUrl: env.PDOK_LOCATIESERVER_URL || "https://api.pdok.nl/bzk/locatieserver/search/v3_1",
    bagUrl: env.PDOK_BAG_URL || "https://api.pdok.nl/kadaster/bag/ogc/v2",
    timeoutMs: Number(env.PDOK_TIMEOUT_MS) > 0 ? Number(env.PDOK_TIMEOUT_MS) : 6000,
  };
}

export type PdokErrorKind = "timeout" | "rate-limit" | "unavailable" | "invalid-response";

export class PdokError extends Error {
  constructor(
    readonly kind: PdokErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export const PDOK_ERROR_TEXT: Record<PdokErrorKind, { status: number; message: string }> = {
  timeout: { status: 504, message: "PDOK reageert nu niet op tijd. Probeer het zo nog eens; je kunt ook zonder adres verder." },
  "rate-limit": { status: 429, message: "Er worden nu te veel zoekopdrachten tegelijk gedaan. Wacht een paar seconden en probeer het opnieuw." },
  unavailable: { status: 502, message: "De adresgegevens van PDOK zijn tijdelijk niet beschikbaar. Je kunt zonder adres verder." },
  "invalid-response": { status: 502, message: "PDOK gaf een onverwacht antwoord. Je kunt zonder adres verder." },
};

type Deps = { fetch: typeof fetch; config: PdokConfig };

async function getJson(url: string, deps: Deps): Promise<unknown> {
  let res: Response;
  try {
    res = await deps.fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(deps.config.timeoutMs), cache: "no-store" });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new PdokError("timeout", "timeout");
    throw new PdokError("unavailable", "network");
  }
  if (res.status === 429) throw new PdokError("rate-limit", "429");
  if (res.status === 404) return null;
  if (!res.ok) throw new PdokError("unavailable", String(res.status));
  try {
    return await res.json();
  } catch {
    throw new PdokError("invalid-response", "json");
  }
}

/** Keeps a search query to plain address text; Solr syntax characters are removed, postcodes normalised. */
export function normalizeQuery(input: string) {
  const cleaned = input
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'\-/.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/\b(\d{4})\s?([a-z]{2})\b/i, (_, d: string, l: string) => `${d}${l.toUpperCase()}`).slice(0, 80);
}

const docsSchema = z.object({ response: z.object({ numFound: z.number(), docs: z.array(z.record(z.string(), z.unknown())) }) });

export async function suggestAddresses(query: string, deps: Deps): Promise<AddressSuggestion[]> {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];
  const url = `${deps.config.locatieserverUrl}/suggest?q=${encodeURIComponent(q)}&fq=${encodeURIComponent("type:adres")}&rows=8&fl=id,weergavenaam,type`;
  const parsed = docsSchema.safeParse(await getJson(url, deps));
  if (!parsed.success) throw new PdokError("invalid-response", "suggest");
  return parsed.data.response.docs
    .filter((d) => d.type === undefined || d.type === "adres")
    .flatMap((d) => (typeof d.id === "string" && typeof d.weergavenaam === "string" ? [{ id: d.id, weergavenaam: d.weergavenaam }] : []));
}

export const LOCATIESERVER_ID = /^adr-[0-9a-f]{32}$/i;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** "POINT(4.8952 52.3702)" → { lon, lat } */
export function parseWktPoint(v: unknown) {
  const m = typeof v === "string" ? /^POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i.exec(v.trim()) : null;
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return lon > 3 && lon < 8 && lat > 50 && lat < 54 ? { lon, lat } : null;
}

export async function lookupAddress(id: string, deps: Deps): Promise<Address | null> {
  if (!LOCATIESERVER_ID.test(id)) return null;
  const fl = "id,type,weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,gemeentenaam,centroide_ll,adresseerbaarobject_id";
  const parsed = docsSchema.safeParse(await getJson(`${deps.config.locatieserverUrl}/lookup?id=${encodeURIComponent(id)}&fl=${fl}`, deps));
  if (!parsed.success) throw new PdokError("invalid-response", "lookup");
  const d = parsed.data.response.docs.find((doc) => doc.id === id);
  if (!d || typeof d.weergavenaam !== "string") return null;
  const huisnummer = typeof d.huisnummer === "number" ? d.huisnummer : Number.isInteger(Number(d.huisnummer)) && d.huisnummer !== undefined ? Number(d.huisnummer) : null;
  const vbo = str(d.adresseerbaarobject_id);
  return {
    id,
    weergavenaam: d.weergavenaam,
    straat: str(d.straatnaam),
    huisnummer,
    huisletter: str(d.huisletter),
    toevoeging: str(d.huisnummertoevoeging),
    postcode: str(d.postcode),
    woonplaats: str(d.woonplaatsnaam),
    gemeente: str(d.gemeentenaam),
    point: parseWktPoint(d.centroide_ll),
    verblijfsobjectId: vbo && /^\d{16}$/.test(vbo) ? vbo : null,
  };
}

const featureCollection = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      properties: z.record(z.string(), z.unknown()).nullable(),
      geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable().optional(),
    }),
  ),
});
type Feature = z.infer<typeof featureCollection>["features"][number];

async function features(url: string, deps: Deps): Promise<Feature[]> {
  const json = await getJson(url, deps);
  if (json === null) return [];
  const parsed = featureCollection.safeParse(json);
  if (!parsed.success) throw new PdokError("invalid-response", "bag");
  return parsed.data.features;
}

const idOf = (f: Feature) => String(f.properties?.identificatie ?? "");

/** Around a WGS84 point: about 35 m in each direction. */
function bboxAround(p: { lon: number; lat: number }) {
  const d = 0.0005;
  return `${(p.lon - d).toFixed(6)},${(p.lat - d).toFixed(6)},${(p.lon + d).toFixed(6)},${(p.lat + d).toFixed(6)}`;
}

/**
 * Finds a BAG object by identificatie. A filter the server does not support may be ignored and return other
 * objects, so every result is checked against the requested id; a spatial query around the address point is
 * the fallback. Unverified objects are never shown.
 */
async function findById(collection: "verblijfsobject" | "pand", id: string, point: Address["point"], deps: Deps): Promise<Feature | null> {
  const base = `${deps.config.bagUrl}/collections/${collection}/items?f=json`;
  const direct = await features(`${base}&identificatie=${encodeURIComponent(id)}`, deps);
  const hit = direct.find((f) => idOf(f) === id);
  if (hit) return hit;
  if (!point) return null;
  const nearby = await features(`${base}&bbox=${bboxAround(point)}&limit=100`, deps);
  return nearby.find((f) => idOf(f) === id) ?? null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim()] : []));
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Pand ids referenced by a verblijfsobject, whatever shape the reference has (id, list, links). */
function pandIds(props: Record<string, unknown>) {
  const ids = new Set<string>();
  for (const [key, value] of Object.entries(props)) {
    if (!key.toLowerCase().includes("pand")) continue;
    for (const m of JSON.stringify(value ?? "").matchAll(/\d{16}/g)) ids.add(m[0]);
  }
  return [...ids];
}

type Ring = [number, number][];

function outlineOf(geometry: Feature["geometry"]): Ring[] | null {
  if (!geometry) return null;
  const polygons: unknown[] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const rings: Ring[] = [];
  for (const poly of polygons) {
    if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
    const ring = (poly[0] as unknown[]).flatMap((c) => (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? [[c[0], c[1]] as [number, number]] : []));
    // Only WGS84 lon/lat within the Netherlands; anything else (e.g. RD metres) is not drawn.
    if (ring.length >= 4 && ring.every(([lon, lat]) => lon > 3 && lon < 8 && lat > 50 && lat < 54)) rings.push(ring);
  }
  return rings.length ? rings : null;
}

function contains(ring: Ring, p: { lon: number; lat: number }) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function fetchBuilding(address: Pick<Address, "verblijfsobjectId" | "point">, deps: Deps, now = new Date()): Promise<Building> {
  const notes: string[] = [];
  let verblijfsobject: Building["verblijfsobject"] = null;
  let pand: Building["pand"] = null;
  let ids: string[] = [];

  if (address.verblijfsobjectId) {
    const vbo = await findById("verblijfsobject", address.verblijfsobjectId, address.point, deps);
    if (vbo?.properties) {
      const p = vbo.properties;
      verblijfsobject = { id: address.verblijfsobjectId, oppervlakteM2: num(p.oppervlakte), gebruiksdoelen: list(p.gebruiksdoel), status: str(p.status) };
      ids = pandIds(p);
      if (verblijfsobject.oppervlakteM2 === null) notes.push("De BAG gaf geen gebruiksoppervlakte voor dit adres.");
    } else notes.push("Het verblijfsobject van dit adres is niet gevonden in de BAG.");
  } else notes.push("Bij dit adres hoort geen verblijfsobject-ID; daarom zijn er geen woninggegevens opgehaald.");

  let pandFeature: Feature | null = null;
  for (const id of ids) {
    pandFeature = await findById("pand", id, address.point, deps);
    if (pandFeature) break;
  }
  if (!pandFeature && address.point) {
    // Spatial fallback: the pand whose outline contains the address point.
    const nearby = await features(`${deps.config.bagUrl}/collections/pand/items?f=json&bbox=${bboxAround(address.point)}&limit=100`, deps);
    pandFeature = nearby.find((f) => outlineOf(f.geometry)?.some((ring) => contains(ring, address.point!))) ?? null;
  }
  if (pandFeature?.properties) {
    const p = pandFeature.properties;
    const bouwjaar = num(p.oorspronkelijk_bouwjaar ?? p.bouwjaar);
    pand = { id: idOf(pandFeature), bouwjaar: bouwjaar !== null && Number.isInteger(bouwjaar) ? bouwjaar : null, status: str(p.status), outline: outlineOf(pandFeature.geometry) };
    if (pand.outline) notes.push("De contour is van het hele gebouw (pand). Bij een appartement horen daar meerdere woningen bij.");
  } else notes.push("Het gebouw (pand) is niet gevonden in de BAG.");

  return { fetchedAt: now.toISOString(), verblijfsobject, pand, notes };
}
