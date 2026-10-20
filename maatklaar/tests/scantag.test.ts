import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { scanCriteria, type ScanCriteria } from "@/config/scantag";
import { combine, lengthValue } from "@/lib/measurements/ar-geometry";
import { browserOf, platformOf, unsupportedReason } from "@/lib/measurements/capabilities";
import {
  applyScanToWindow,
  assessShot,
  measureShot,
  pointFromSamples,
  SCAN_TASKS,
  scanShotSchema,
  verdictFor,
  verdicts,
  type ScanInput,
  type ScanShot,
} from "@/lib/measurements/scan";
import { defaultRuleFor } from "@/lib/measurements/protocols";
import { newWindow } from "@/lib/projects/factory";
import { withAudit } from "@/lib/projects/audit";
import { observedOpening } from "@/lib/projects/compute";
import { windowSchema, type ProjectWindow } from "@/lib/projects/schema";
import { processWindow, processWindows } from "@/lib/scantag/process";
import { scanStatus, windowsPreview } from "@/lib/scantag/status";
import { mergeWindowResult, processLocally } from "@/components/project/scantag-client";
import { DEVICE, on, openingScan, point, wall } from "./support/ar-scene";

const BASE = scanCriteria("rolgordijn", "in-de-dag");
const CTX = { product: "rolgordijn", mounting: "in-de-dag", shape: "rechthoek" } as const;

describe("AR-meetkern: millimeters uit 3D-punten van de tracking", () => {
  it("meet een opening van 1200 × 1500 mm op een gedraaide muur, op drie hoogtes en drie plekken", () => {
    const r = measureShot(SCAN_TASKS.opening, openingScan(wall()).points);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const k of ["breedte_boven", "breedte_midden", "breedte_onder"] as const) expect(r.values[k]!.mm).toBeCloseTo(1200, 6);
    for (const k of ["hoogte_links", "hoogte_midden", "hoogte_rechts"] as const) expect(r.values[k]!.mm).toBeCloseTo(1500, 6);
    expect(r.geometry.planeResidualMm).toBeLessThan(1e-6);
    expect(r.geometry.maxCornerDeviationDeg).toBeLessThan(1e-6);
    expect(r.geometry.convex).toBe(true);
  });

  it("bewaart de ruwe waarde onafgerond en geeft een foutmarge die met de afstand groeit", () => {
    const near = measureShot(SCAN_TASKS.opening, openingScan(wall(0.8), 1203.37, 1499.61).points);
    const far = measureShot(SCAN_TASKS.opening, openingScan(wall(3.2), 1203.37, 1499.61).points);
    if (!near.ok || !far.ok) throw new Error("meting");
    expect(near.values.breedte_boven!.mm).toBeCloseTo(1203.37, 6);
    expect(Number.isInteger(near.values.breedte_boven!.mm)).toBe(false);
    expect(far.values.breedte_boven!.uncertaintyMm).toBeGreaterThan(near.values.breedte_boven!.uncertaintyMm);
    // The scale share (1 % assumed) is always part of the margin.
    expect(near.values.breedte_boven!.systematicMm).toBeCloseTo(12.0337, 3);
  });

  it("diepte langs de normaal van de muur: een punt iets opzij telt niet mee", () => {
    const w = wall(1.2);
    const front = point(on(w, 0, 600), { n: w.normal });
    const frame = point(on(w, 30, 600, -92));
    const r = measureShot(SCAN_TASKS.diepte, [front, frame]);
    if (!r.ok) throw new Error("diepte");
    expect(r.values.diepte!.mm).toBeCloseTo(92, 6);
    expect(r.reasons).toEqual([]);
    // The second point on the wall itself: the frame was not found.
    const flat = measureShot(SCAN_TASKS.diepte, [front, point(on(w, 40, 600, -2))]);
    expect(flat.ok && flat.reasons).toEqual(["depth_not_found"]);
    // Far to the side instead of straight back.
    const side = measureShot(SCAN_TASKS.diepte, [front, point(on(w, 400, 600, -60))]);
    expect(side.ok && side.reasons).toEqual(["not_straight_back"]);
  });

  it("lengtes in paren: rail en ophanghoogte links, midden, rechts", () => {
    const w = wall(2.4, 0, 0);
    const rail = measureShot(SCAN_TASKS.rail, [point(on(w, -100, -50)), point(on(w, 2300, -50))]);
    expect(rail.ok && rail.values.rail_breedte!.mm).toBeCloseTo(2400, 6);
    const pts = [0, 1100, 2200].flatMap((x, i) => [point(on(w, x, 0)), point(on(w, x, 2600 + i * 4))]);
    const hang = measureShot(SCAN_TASKS.ophang, pts);
    if (!hang.ok) throw new Error("ophang");
    expect(hang.values.ophanghoogte_rechts!.mm).toBeCloseTo(2608, 6);
  });

  it("een punt uit de opgenomen beelden: gemiddelde, spreiding, mediane dieptekaartverschil", () => {
    const pt = pointFromSamples([
      { p: { x: 0, y: 0, z: -1 }, n: { x: 0, y: 0, z: 1 }, rangeM: 1, depthDiffMm: 4 },
      { p: { x: 0.002, y: 0, z: -1 }, n: { x: 0, y: 0, z: 1 }, rangeM: 1, depthDiffMm: 9 },
      { p: { x: 0.001, y: 0, z: -1 }, n: null, rangeM: 1, depthDiffMm: 5 },
    ])!;
    expect(pt.p.x).toBeCloseTo(0.001, 9);
    expect(pt.spreadMm).toBeCloseTo(Math.sqrt(2 / 3), 6);
    expect(pt.frames).toBe(3);
    expect(pt.depthDiffMm).toBe(5);
    expect(pt.n).toEqual({ x: 0, y: 0, z: 1 });
    expect(pointFromSamples([])).toBeNull();
  });

  it("combineert scans alleen als ze binnen hun marge overeenkomen", () => {
    const a = lengthValue(1200, [4, 4]);
    const b = lengthValue(1203, [4, 4]);
    const c = lengthValue(1260, [4, 4]);
    expect(combine([a, b])!.agree).toBe(true);
    expect(combine([a, b])!.mm).toBeCloseTo(1201.5, 6);
    expect(combine([a, c])!.agree).toBe(false);
  });
});

describe("kwaliteitscontrole per scan: opnieuw scannen bij een fout die je kunt herstellen", () => {
  const good = openingScan(wall());
  const check = (s: ScanInput) => assessShot(SCAN_TASKS.opening, s, BASE);

  it("een goede scan is bruikbaar en levert waarden", () => {
    const r = check(good);
    expect(r.status).toBe("ok");
    expect(Object.keys(r.values)).toHaveLength(6);
  });

  it("tracking kwijt, onrustig punt, te kort vastgehouden, ontbrekend punt", () => {
    expect(check({ ...good, tracking: { frames: 100, lost: 30 } }).reasons).toContain("tracking_lost");
    expect(check({ ...good, points: good.points.map((p, i) => (i === 1 ? { ...p, spreadMm: 15 } : p)) }).reasons).toContain(
      "unstable_point",
    );
    expect(check({ ...good, points: good.points.map((p) => ({ ...p, frames: 3 })) }).reasons).toContain("too_few_frames");
    const three = check({ ...good, points: good.points.slice(0, 3) });
    expect(three).toMatchObject({ status: "retake_required", reasons: ["surface_not_found"], values: {} });
  });

  it("een hoek op het glas (niet in het vlak) of naast de rand (geen rechthoek)", () => {
    const w = wall();
    const offPlane = { ...good, points: good.points.map((p, i) => (i === 2 ? point(on(w, 1200, 1500, -45), { n: w.normal }) : p)) };
    expect(check(offPlane).reasons).toContain("not_planar");
    const skew = { ...good, points: good.points.map((p, i) => (i === 1 ? point(on(w, 1290, 0), { n: w.normal }) : p)) };
    expect(check(skew).reasons).toContain("not_rectangular");
    const crossed = { ...good, points: [good.points[0]!, good.points[2]!, good.points[1]!, good.points[3]!] };
    expect(check(crossed).reasons).toContain("not_rectangular");
  });

  it("dieptekaart en tracking spreken elkaar tegen; een maat die niet bij de opname past", () => {
    expect(check({ ...good, points: good.points.map((p) => ({ ...p, depthDiffMm: 120 })) }).reasons).toContain("depth_disagrees");
    const tiny = openingScan(wall(), 40, 60);
    expect(check(tiny).reasons).toContain("out_of_range");
  });
});

describe("drie meetstatussen: accepted, retake_required, not_supported_for_ordering", () => {
  const c = (mm: number, sigma: number, n = 1) => ({ ...lengthValue(mm, [sigma, sigma]), shots: n, spreadMm: 0, agree: true });
  const validated: ScanCriteria = {
    ...BASE,
    maxUncertaintyMm: 40,
    validated: { on: "2027-01-01", report: "test", scans: 600, falseAcceptRate: 0.004, meanAbsErrorMm: 3, maxAbsErrorMm: 18 },
  };

  it("zonder gevalideerde criteria is niets geaccepteerd: gemeten, niet geschikt om op te bestellen", () => {
    const v = verdictFor("breedte_boven", c(1000, 1), { ...CTX, product: "gordijn", mounting: "wand" });
    expect(v).toEqual({ status: "not_supported_for_ordering", reasons: ["criteria_not_validated"], shots: 1 });
  });

  it("met gevalideerde criteria en binnen de grens: accepted", () => {
    expect(verdictFor("breedte_boven", c(1000, 2), CTX, validated).status).toBe("accepted");
  });

  it("te grote marge: dichterbij als dat helpt, anders kan deze sensor het niet", () => {
    expect(verdictFor("breedte_boven", c(1000, 12), CTX, validated)).toMatchObject({ status: "retake_required", reasons: ["come_closer"] });
    expect(verdictFor("breedte_boven", c(1000, 12), CTX)).toMatchObject({
      status: "not_supported_for_ordering",
      reasons: ["sensor_too_coarse"],
    });
  });

  it("scans die elkaar tegenspreken en een erker", () => {
    const disagree = { ...c(1000, 2, 2), agree: false };
    expect(verdictFor("breedte_boven", disagree, CTX, validated).reasons).toEqual(["shots_disagree"]);
    expect(verdictFor("breedte_boven", c(1000, 2), { ...CTX, shape: "erker" }, validated).reasons).toEqual(["shape_unsupported"]);
  });

  it("een maat waarvan alleen afgekeurde scans bestaan: opnieuw scannen met hun redenen", () => {
    const out = verdicts([{ task: "opening", quality: { status: "retake_required", reasons: ["tracking_lost"] }, values: {} }], CTX);
    expect(out.breedte_boven).toEqual({ status: "retake_required", reasons: ["tracking_lost"], shots: 0 });
  });
});

describe("zonder metrische schaal: geen millimeters", () => {
  it("een toestel zonder WebXR-AR kan niet scannen en krijgt een eerlijke reden", () => {
    const iphone = { secure: true, xrAr: "nee" as const, platform: "ios" as const, browser: "Safari 18" };
    expect(unsupportedReason(iphone)).toMatch(/Safari op iPhone/);
    expect(unsupportedReason({ ...iphone, platform: "desktop" })).toMatch(/computer heeft geen AR-tracking/);
    expect(unsupportedReason({ ...iphone, platform: "android", secure: false })).toMatch(/https/);
    expect(unsupportedReason({ ...iphone, platform: "android", xrAr: "ja" })).toBeNull();
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 8)", 5)).toBe("android");
    expect(browserOf("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/141.0.0.0 Mobile Safari/537.36")).toBe("Chrome 141");
    expect(browserOf("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari 18");
  });

  it("een scan zonder punten (geen hit-test) levert geen enkele waarde", () => {
    const empty: ScanInput = {
      id: "leegscan01",
      task: "opening",
      points: [],
      tracking: { frames: 0, lost: 0 },
      device: { ...DEVICE, webxr: false },
    };
    const r = processWindow({ id: "w1", ...CTX, shots: [empty] }, true);
    expect(r.shots[0]).toMatchObject({ status: "retake_required", reasons: ["surface_not_found"], values: {} });
    expect(r.targets.breedte_boven!.status).toBe("retake_required");
  });

  it("de opslag accepteert geen scan met pixelpunten in plaats van 3D-punten", () => {
    const pixel = { ...openingScan(wall()), takenAt: "x", points: [{ x: 120, y: 340, sigma: 0.3 }] };
    expect(scanShotSchema.safeParse(pixel).success).toBe(false);
  });
});

describe("ScanTag op de server: oordeel vóór betaling, maten pas na betaling", () => {
  const win = { id: "w1", ...CTX, shots: [openingScan(wall())] };

  it("zonder vrijgave: wel een oordeel per scan en per maat, geen enkele maat", () => {
    const [r] = processWindows([win], false);
    expect(r!.shots[0]).toEqual({ id: "scanopening1", status: "ok", reasons: [] });
    // With the assumed tracking error a roller blind in the recess (±4 mm) is out of reach for this sensor.
    expect(r!.targets.breedte_boven).toEqual({ status: "not_supported_for_ordering", reasons: ["sensor_too_coarse"], shots: 1 });
    const curtain = processWindows([{ ...win, product: "gordijn", mounting: "wand" }], false)[0]!;
    // A curtain allows more margin: from closer by the same sensor could do, so: scan again from closer.
    expect(curtain.targets.breedte_boven).toMatchObject({ status: "retake_required", reasons: ["come_closer"] });
    expect(JSON.stringify(r)).not.toMatch(/"mm"|1200|1500|values/);
  });

  it("met vrijgave: de maten van de scan, met foutmarge", () => {
    const [r] = processWindows([win], true);
    expect(r!.shots[0]!.values!.breedte_boven!.mm).toBeCloseTo(1200, 6);
    expect(r!.shots[0]!.values!.breedte_boven!.uncertaintyMm).toBeGreaterThan(10);
  });

  it("het oordeel komt in het raam; maten alleen als ze vrijgegeven zijn", () => {
    const w = { ...newWindow([]), product: "rolgordijn" as const, mounting: "in-de-dag" as const };
    const shot: ScanShot = {
      ...openingScan(wall()),
      takenAt: "2026-10-19T12:00:00Z",
      values: {},
      processed: false,
      quality: { status: "ok", reasons: [] },
    };
    const withShot = { ...w, scans: [shot] };
    const before = mergeWindowResult(withShot, false, processWindow({ ...win, id: w.id }, false));
    expect(before.scans[0]).toMatchObject({ processed: true, values: {} });
    expect(before.scanVerdicts!.context).toEqual(CTX);
    const after = mergeWindowResult(withShot, true, processWindow({ ...win, id: w.id }, true));
    expect(Object.keys(after.scans[0]!.values)).toHaveLength(6);
  });

  it("de gratis plafondhoogte wordt op het apparaat gecontroleerd en gemeten", () => {
    const w = wall(2.6, 0, 0);
    const shot: ScanShot = {
      id: "plafond01",
      task: "plafond",
      takenAt: "2026-10-19T12:00:00Z",
      points: [point(on(w, 0, 2600)), point(on(w, 0, 0))],
      tracking: { frames: 120, lost: 0 },
      device: DEVICE,
      values: {},
      processed: false,
      quality: { status: "ok", reasons: [] },
    };
    expect(processLocally([shot])[0]!.values.plafondhoogte!.mm).toBeCloseTo(2600, 6);
  });
});

describe("de API geeft maten alleen vrij voor een betaalde bestelling van hetzelfde project", () => {
  let POST: (req: Request) => Promise<Response>;
  let paid: { id: string; secret: string };
  let open: { id: string; secret: string };
  const REF = "projectscantag01";
  const windows = [{ id: "w1", ...CTX, shots: [openingScan(wall())] }];

  beforeAll(async () => {
    process.env.ORDERS_FILE = path.join(mkdtempSync(path.join(tmpdir(), "scantag-")), "orders.json");
    ({ POST } = await import("@/app/api/scantag/route"));
    const { paymentDeps } = await import("@/lib/payments/runtime");
    const { createOrder, simulateDemoPayment } = await import("@/lib/payments/service");
    const deps = await paymentDeps();
    const urls = { redirectBase: "http://localhost:3000", webhookUrl: null };
    const a = await createOrder(REF, urls, deps);
    await simulateDemoPayment(a.orderId, a.orderSecret, "paid", deps);
    paid = { id: a.orderId, secret: a.orderSecret };
    const b = await createOrder(REF, urls, deps);
    open = { id: b.orderId, secret: b.orderSecret };
  });

  const call = (body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
    POST(
      new Request("http://localhost/api/scantag", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );

  it("betaald en eigen project: vrijgegeven", async () => {
    const res = await call({ order: paid, projectRef: REF, windows });
    const body = (await res.json()) as { released: boolean; windows: { shots: { values?: unknown }[] }[] };
    expect(res.status).toBe(200);
    expect(body.released).toBe(true);
    expect(body.windows[0]!.shots[0]!.values).toBeDefined();
  });

  it("niet betaald, verkeerd geheim, ander project of geen bestelling: geen maat in het antwoord", async () => {
    for (const body of [
      { order: open, projectRef: REF, windows },
      { order: { ...paid, secret: "fout-geheim" }, projectRef: REF, windows },
      { order: paid, projectRef: "anderproject0001", windows },
      { order: null, projectRef: REF, windows },
    ]) {
      const res = await call(body);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(JSON.parse(text).released).toBe(false);
      expect(text).not.toContain("values");
      expect(text).not.toMatch(/"mm"/);
    }
  });

  it("een client-vlag 'betaald' zonder geverifieerde bestelling geeft niets vrij", async () => {
    const res = await call({ order: null, projectRef: REF, windows, released: true, paid: true });
    expect(JSON.parse(await res.text()).released).toBe(false);
  });

  it("weigert verzoeken van een andere site en ongeldige invoer", async () => {
    expect((await call({ order: paid, projectRef: REF, windows }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call({ order: paid, projectRef: REF, windows: [{ ...windows[0], shots: "x" }] })).status).toBe(400);
    expect((await call({ order: paid, projectRef: "../etc", windows })).status).toBe(400);
  });
});

describe("raam: scans in de maten, auditlog, scanstatus en wat het rapport zal bevatten", () => {
  const rule = defaultRuleFor("rolgordijn", "in-de-dag");
  const released = (): ScanShot => {
    const input = openingScan(wall(), 1203.4, 1498.8);
    const r = processWindow({ id: "w", ...CTX, shots: [input] }, true);
    return {
      ...input,
      takenAt: "2026-10-19T12:00:00Z",
      processed: true,
      quality: { status: "ok", reasons: [] },
      values: r.shots[0]!.values!,
    };
  };

  it("vrijgegeven scanwaarden komen onafgerond in de maten, met marge, status en apparaat; getypte maten blijven", () => {
    const w = {
      ...newWindow([]),
      product: "rolgordijn" as const,
      mounting: "in-de-dag" as const,
      measures: { diepte: 80 } as ProjectWindow["measures"],
    };
    const next = applyScanToWindow({ ...w, scans: [released()] }, rule);
    expect(next.measures.breedte_boven).toBeCloseTo(1203.4, 6);
    expect(next.sources.breedte_boven).toMatchObject({
      method: "scantag_ar",
      scaleSource: "webxr_hit_test",
      status: "not_supported_for_ordering",
      reasons: ["sensor_too_coarse"],
      device: DEVICE,
    });
    expect(next.measures.diepte).toBe(80);
    expect(next.sources.diepte).toBeUndefined();
    // Explicit fields of the measured opening, in mm.
    const op = observedOpening(next);
    expect(op.openingWidthMm).toBeCloseTo(1203.4, 6);
    expect(op.openingHeightMm).toBeCloseTo(1498.8, 6);
    expect(op.depthMm).toBe(80);
    expect(op.measurementUncertaintyMm.width).toBeGreaterThan(0);
    expect(op.measurementUncertaintyMm.depth).toBeNull();
    expect(op.scaleSource).toEqual({ width: "webxr_hit_test", height: "webxr_hit_test", depth: "handmatig" });
    // Removing the scan removes its values.
    const gone = applyScanToWindow({ ...next, scans: [] }, rule);
    expect(gone.measures.breedte_boven).toBeUndefined();
    expect(gone.measures.diepte).toBe(80);
  });

  it("oude projecten met A4-fotoscans laden zonder die scans en hun maten", () => {
    const legacy = {
      ...newWindow([]),
      camera: [{ id: "oud", task: "opening", reference: [] }],
      photo: { takenAt: "x" },
      measures: { breedte_boven: 1200, diepte: 80 },
      sources: { breedte_boven: { method: "camera", uncertaintyMm: 9, shots: 1, scaleReference: "a4" } },
    };
    const w = windowSchema.parse(legacy);
    expect(w.measures).toEqual({ diepte: 80 });
    expect(w.sources).toEqual({});
    expect("camera" in w).toBe(false);
    expect(w.audit.at(-1)!.event).toMatch(/A4-vel of bankpas als schaal zijn vervallen/);
  });

  it("het auditlog noemt scans, wijzigingen en bevestiging, met tijd", () => {
    const w = newWindow([]);
    const shot = { ...released(), processed: false, values: {} };
    const a = withAudit(w, { ...w, scans: [shot] }, "2026-10-19T10:00:00Z");
    expect(a.audit.at(-1)).toEqual({
      at: "2026-10-19T10:00:00Z",
      event: "ScanTag-scan toegevoegd: Raamopening (dag tot dag) (android, Chrome 141)",
    });
    const b = withAudit(a, { ...a, measures: { breedte_boven: 1203 } }, "2026-10-19T10:01:00Z");
    expect(b.audit.at(-1)!.event).toBe("Breedte boven: — → 1203 mm (handmatig)");
    const c = withAudit(b, { ...b, confirmed: true }, "2026-10-19T10:02:00Z");
    expect(c.confirmedAt).toBe("2026-10-19T10:02:00Z");
    expect(c.audit.at(-1)!.event).toMatch(/^Maten bevestigd met regel/);
    expect(withAudit(c, c)).toBe(c);
  });

  it("scanstatus zonder maten: nog scannen, wacht, opnieuw, gescand", () => {
    const tasks = [SCAN_TASKS.opening, SCAN_TASKS.diepte];
    const shot = (task: "opening" | "diepte", processed = true) => ({ ...released(), id: `${task}abcdef`, task, processed }) as ScanShot;
    const v = (status: "retake_required" | "not_supported_for_ordering") => ({ status, reasons: [], shots: 1 });
    const all = (status: "retake_required" | "not_supported_for_ordering") => ({
      context: CTX,
      targets: Object.fromEntries(
        ["breedte_boven", "breedte_midden", "breedte_onder", "hoogte_links", "hoogte_midden", "hoogte_rechts", "diepte"].map((k) => [
          k,
          v(status),
        ]),
      ),
    });
    expect(scanStatus([], tasks, null, CTX).label).toBe("Nog scannen");
    expect(scanStatus([shot("opening", false)], tasks, null, CTX).label).toBe("Wacht op verwerking");
    expect(scanStatus([shot("opening")], tasks, all("not_supported_for_ordering"), { ...CTX, product: "plisse" }).label).toBe(
      "Wacht op verwerking",
    );
    const retake = {
      ...all("not_supported_for_ordering"),
      targets: { ...all("not_supported_for_ordering").targets, diepte: v("retake_required") },
    };
    expect(scanStatus([shot("opening"), shot("diepte")], tasks, retake, CTX)).toMatchObject({
      status: "check",
      retake: ["Diepte van de dag"],
    });
    const one = { context: CTX, targets: { ...all("not_supported_for_ordering").targets, diepte: undefined } };
    expect(scanStatus([shot("opening")], tasks, one, CTX).label).toBe("Nog 1 opname");
    expect(scanStatus([shot("opening"), shot("diepte")], tasks, all("not_supported_for_ordering"), CTX)).toMatchObject({
      label: "Gescand · nog niet geschikt om op te bestellen",
      done: 2,
      total: 2,
      notForOrdering: 7,
    });
  });

  it("vóór betaling: eerlijk hoeveel ramen een bestelmaat krijgen, zonder maten", () => {
    const state = { label: "", status: "measured" as const, done: 1, total: 1, retake: [], notForOrdering: 6, accepted: 0 };
    const p = windowsPreview([
      { state, supplierRule: true, ruleProblem: "De meetregel van Tuiss is nog niet gecontroleerd." },
      { state: { ...state, notForOrdering: 0, accepted: 6 }, supplierRule: true, ruleProblem: null },
    ]);
    expect(p).toMatchObject({ total: 2, scanned: 2, orderPossible: 1 });
    expect(p.reasons.join(" ")).toMatch(/nog niet gecontroleerd/);
    expect(p.reasons.join(" ")).toMatch(/nog niet gevalideerd/);
  });
});
