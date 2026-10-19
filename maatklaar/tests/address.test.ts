import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PdokError,
  fetchBuilding,
  lookupAddress,
  normalizeQuery,
  parseWktPoint,
  suggestAddresses,
  type PdokConfig,
} from "@/lib/address/pdok";
import { GET as zoek } from "@/app/api/adres/zoek/route";
import { GET as woning } from "@/app/api/woning/route";
import { resetRateLimits } from "@/lib/server/ratelimit";

const config: PdokConfig = { locatieserverUrl: "https://pdok.test/ls", bagUrl: "https://pdok.test/bag", timeoutMs: 200 };
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fake fetch that answers by URL and records requests. */
function fakeFetch(handler: (url: URL) => Response | Promise<Response>) {
  const calls: URL[] = [];
  const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    calls.push(url);
    if (init?.signal?.aborted) throw init.signal.reason;
    return handler(url);
  });
  return { fetch: f as unknown as typeof fetch, calls };
}

const VBO = "0363010000758545";
const PAND = "0363100012169587";
const docs = (d: Record<string, unknown>[]) => ({ response: { numFound: d.length, start: 0, docs: d } });
const square = (lon: number, lat: number) => [
  [lon - 0.0002, lat - 0.0001],
  [lon + 0.0002, lat - 0.0001],
  [lon + 0.0002, lat + 0.0001],
  [lon - 0.0002, lat + 0.0001],
  [lon - 0.0002, lat - 0.0001],
];

afterEach(() => {
  vi.unstubAllGlobals();
  resetRateLimits();
});

describe("Locatieserver", () => {
  it("normaliseert de zoekvraag en verwijdert Solr-syntax", () => {
    expect(normalizeQuery(" 1012 js  1 ")).toBe("1012JS 1");
    expect(normalizeQuery("Damrak 1 OR type:*")).toBe("Damrak 1 OR type");
  });

  it("geeft alleen adressen terug, gefilterd op type:adres", async () => {
    const { fetch, calls } = fakeFetch(() => ok(docs([{ id: "adr-1", weergavenaam: "Damrak 1, 1012LG Amsterdam", type: "adres" }])));
    const r = await suggestAddresses("damrak 1", { fetch, config });
    expect(r).toEqual([{ id: "adr-1", weergavenaam: "Damrak 1, 1012LG Amsterdam" }]);
    expect(calls[0]!.pathname).toBe("/ls/suggest");
    expect(calls[0]!.searchParams.get("fq")).toBe("type:adres");
  });

  it("leeg resultaat is geen fout", async () => {
    const { fetch } = fakeFetch(() => ok(docs([])));
    expect(await suggestAddresses("bestaatniet 999", { fetch, config })).toEqual([]);
  });

  it("time-out wordt een nette PdokError", async () => {
    const slow = (async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;
    await expect(suggestAddresses("damrak", { fetch: slow, config })).rejects.toMatchObject({ kind: "timeout" });
  });

  it("429 en 5xx worden herkend", async () => {
    await expect(suggestAddresses("damrak", { fetch: fakeFetch(() => ok({}, 429)).fetch, config })).rejects.toMatchObject({
      kind: "rate-limit",
    });
    await expect(suggestAddresses("damrak", { fetch: fakeFetch(() => ok({}, 503)).fetch, config })).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(
      suggestAddresses("damrak", { fetch: fakeFetch(() => new Response("<html>", { status: 200 })).fetch, config }),
    ).rejects.toBeInstanceOf(PdokError);
  });

  it("lookup leest velden en het punt; een ongeldige id wordt niet opgevraagd", async () => {
    const id = "adr-" + "a".repeat(32);
    const { fetch, calls } = fakeFetch(() =>
      ok(
        docs([
          {
            id,
            weergavenaam: "Voorbeeldstraat 12A, 1234AB Voorbeeldstad",
            straatnaam: "Voorbeeldstraat",
            huisnummer: 12,
            huisletter: "A",
            postcode: "1234AB",
            woonplaatsnaam: "Voorbeeldstad",
            centroide_ll: "POINT(4.8952 52.3702)",
            adresseerbaarobject_id: VBO,
          },
        ]),
      ),
    );
    const a = await lookupAddress(id, { fetch, config });
    expect(a).toMatchObject({
      huisnummer: 12,
      huisletter: "A",
      toevoeging: null,
      point: { lon: 4.8952, lat: 52.3702 },
      verblijfsobjectId: VBO,
    });
    expect(await lookupAddress("adr-x", { fetch, config })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(parseWktPoint("POINT(155000 463000)")).toBeNull(); // RD coordinates are not WGS84
  });
});

describe("BAG OGC API", () => {
  const point = { lon: 4.8952, lat: 52.3702 };

  it("haalt oppervlakte, bouwjaar en contour op en controleert de identificatie", async () => {
    const { fetch } = fakeFetch((url) => {
      if (url.pathname.endsWith("/verblijfsobject/items"))
        return ok({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                identificatie: VBO,
                oppervlakte: 85,
                gebruiksdoel: "woonfunctie",
                status: "Verblijfsobject in gebruik",
                pand: [{ href: `https://pdok.test/bag/collections/pand/items/x`, title: PAND }],
              },
              geometry: null,
            },
          ],
        });
      if (url.pathname.endsWith("/pand/items"))
        return ok({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { identificatie: PAND, bouwjaar: 1932, status: "Pand in gebruik" },
              geometry: { type: "Polygon", coordinates: [square(point.lon, point.lat)] },
            },
          ],
        });
      return ok({}, 404);
    });
    const b = await fetchBuilding({ verblijfsobjectId: VBO, point }, { fetch, config });
    expect(b.verblijfsobject).toEqual({
      id: VBO,
      oppervlakteM2: 85,
      gebruiksdoelen: ["woonfunctie"],
      status: "Verblijfsobject in gebruik",
    });
    expect(b.pand).toMatchObject({ id: PAND, bouwjaar: 1932 });
    expect(b.pand!.outline![0]).toHaveLength(5);
    expect(b.notes.join(" ")).toMatch(/hele gebouw/);
  });

  it("toont niets als de server het filter negeert en andere objecten teruggeeft", async () => {
    const other = { type: "Feature", properties: { identificatie: "0363010000000001", oppervlakte: 999 }, geometry: null };
    const { fetch } = fakeFetch(() => ok({ type: "FeatureCollection", features: [other] }));
    const b = await fetchBuilding({ verblijfsobjectId: VBO, point }, { fetch, config });
    expect(b.verblijfsobject).toBeNull();
    expect(b.pand).toBeNull();
    expect(b.notes.join(" ")).toMatch(/niet gevonden/);
  });

  it("valt terug op een ruimtelijke zoekvraag rond het adrespunt", async () => {
    const { fetch, calls } = fakeFetch((url) => {
      if (url.pathname.endsWith("/verblijfsobject/items")) {
        if (url.searchParams.has("bbox"))
          return ok({ type: "FeatureCollection", features: [{ type: "Feature", properties: { identificatie: VBO, oppervlakte: 61 } }] });
        return ok({ type: "FeatureCollection", features: [] });
      }
      return ok({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { identificatie: PAND, bouwjaar: "2004" },
            geometry: { type: "Polygon", coordinates: [square(point.lon, point.lat)] },
          },
        ],
      });
    });
    const b = await fetchBuilding({ verblijfsobjectId: VBO, point }, { fetch, config });
    expect(b.verblijfsobject?.oppervlakteM2).toBe(61);
    expect(b.pand).toMatchObject({ id: PAND, bouwjaar: 2004 });
    expect(calls.some((c) => c.searchParams.has("bbox"))).toBe(true);
  });

  it("tekent geen contour in een ander coördinatenstelsel", async () => {
    const { fetch } = fakeFetch((url) => {
      if (url.pathname.endsWith("/verblijfsobject/items"))
        return ok({
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: { identificatie: VBO, pand_identificatie: PAND } }],
        });
      return ok({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { identificatie: PAND },
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [121000, 487000],
                  [121010, 487000],
                  [121010, 487010],
                  [121000, 487000],
                ],
              ],
            },
          },
        ],
      });
    });
    const b = await fetchBuilding({ verblijfsobjectId: VBO, point }, { fetch, config });
    expect(b.pand?.id).toBe(PAND);
    expect(b.pand?.outline).toBeNull();
    expect(b.verblijfsobject?.oppervlakteM2).toBeNull();
  });
});

describe("API-routes", () => {
  it("adres zoeken: time-out wordt 504 met Nederlandse uitleg", async () => {
    vi.stubGlobal(
      "fetch",
      (async (_: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch,
    );
    vi.stubEnv("PDOK_TIMEOUT_MS", "50");
    const res = await zoek(new Request("http://localhost/api/adres/zoek?q=damrak"));
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/PDOK reageert/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    vi.unstubAllEnvs();
  });

  it("adres zoeken: begrenst het aantal verzoeken", async () => {
    vi.stubGlobal("fetch", (async () => ok(docs([]))) as unknown as typeof fetch);
    let last = 200;
    for (let i = 0; i < 61; i++)
      last = (await zoek(new Request("http://localhost/api/adres/zoek?q=damrak", { headers: { "x-forwarded-for": "203.0.113.9" } })))
        .status;
    expect(last).toBe(429);
  });

  it("woning: weigert ongeldige invoer", async () => {
    expect((await woning(new Request("http://localhost/api/woning?vbo=abc"))).status).toBe(400);
    vi.stubGlobal("fetch", (async () => ok({ type: "FeatureCollection", features: [] })) as unknown as typeof fetch);
    const res = await woning(new Request(`http://localhost/api/woning?vbo=${VBO}`));
    expect(res.status).toBe(200);
    expect((await res.json()).building.verblijfsobject).toBeNull();
  });
});
