import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CAMERA_TASKS, type CameraShot } from "@/lib/measurements/camera";
import { project, type Marked } from "@/lib/measurements/photo";
import { newWindow } from "@/lib/projects/factory";
import { withAudit } from "@/lib/projects/audit";
import { processShots } from "@/lib/scantag/process";
import { checkShot } from "@/lib/scantag/quality";
import { scanStatus } from "@/lib/scantag/status";
import { mergeResults } from "@/components/project/scantag-client";
import { renderScene } from "./support/scene";

/** A wall at about 2 px per mm: two A4 sheets beside a 1200 × 1500 mm opening, corners known exactly. */
const H = [2.1, 0.3, 900, -0.15, 2.35, 420, 0.00006, 0.00003, 1];
const at = (x: number, y: number, sigma = 0.3): Marked => ({ ...project(H, { x, y }), sigma });
const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
const SHEETS = [...rect(-380, 500, -170, 797), ...rect(1360, 900, 1570, 1197)];
const OPENING = rect(0, 0, 1200, 1500);
const geometry = { id: "shotopening1", task: "opening" as const, orientation: "auto" as const, reference: SHEETS, points: OPENING };

describe("ScanTag op de server: status vóór betaling, maten pas na betaling", () => {
  it("zonder vrijgave: wel een oordeel over de scan, geen enkele maat", () => {
    const [r] = processShots([geometry], false);
    expect(r).toEqual({ id: "shotopening1", status: "verwerkt", issues: [] });
    expect(JSON.stringify(r)).not.toMatch(/1200|1500|mm/);
  });

  it("met vrijgave: de maten van de foto, met foutmarge", () => {
    const [r] = processShots([geometry], true);
    expect(r!.status).toBe("verwerkt");
    expect(r!.values!.breedte_boven!.mm).toBeCloseTo(1200, 0);
    expect(r!.values!.hoogte_rechts!.mm).toBeCloseTo(1500, 0);
    expect(r!.values!.breedte_boven!.uncertaintyMm).toBeGreaterThanOrEqual(6);
  });

  it("één vel waar er twee nodig zijn, of vellen die niet bij elkaar passen: extra opname nodig", () => {
    expect(processShots([{ ...geometry, reference: SHEETS.slice(0, 4) }], true)[0]).toMatchObject({ status: "extra_opname_nodig" });
    const wrong = [...rect(-380, 500, -170, 797), ...rect(1360, 900, 1576, 1179)];
    const r = processShots([{ ...geometry, reference: wrong }], true)[0]!;
    expect(r.status).toBe("extra_opname_nodig");
    expect(r.values).toBeUndefined();
  });

  it("een server-oordeel komt in de opname, maten alleen als ze vrijgegeven zijn", () => {
    const shot: CameraShot = {
      ...geometry,
      takenAt: "2026-10-19T12:00:00Z",
      width: 4000,
      height: 3000,
      snapped: [],
      values: {},
      capture: { method: "camera-app", device: "mobiel", browser: "Safari 18" },
      photoChecks: [],
      processed: false,
      quality: { status: "ok", issues: [] },
    };
    const before = mergeResults([shot], false, processShots([geometry], false))[0]!;
    expect(before).toMatchObject({ processed: true, values: {}, quality: { status: "ok" } });
    const after = mergeResults([shot], true, processShots([geometry], true))[0]!;
    expect(Object.keys(after.values)).toHaveLength(6);
    const blurred = mergeResults(
      [{ ...shot, photoChecks: [{ blocking: true, text: "Onscherp" }] }],
      true,
      processShots([geometry], true),
    )[0]!;
    expect(blurred.quality).toEqual({ status: "needs_more_data", issues: ["Onscherp"] });
  });
});

describe("de API geeft maten alleen vrij voor een betaalde bestelling van hetzelfde project", () => {
  let POST: (req: Request) => Promise<Response>;
  let paid: { id: string; secret: string };
  let open: { id: string; secret: string };
  const REF = "projectscantag01";

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
  const shots = [geometry];

  it("betaald en eigen project: vrijgegeven", async () => {
    const res = await call({ order: paid, projectRef: REF, shots });
    const body = (await res.json()) as { released: boolean; shots: { values?: unknown }[] };
    expect(res.status).toBe(200);
    expect(body.released).toBe(true);
    expect(body.shots[0]!.values).toBeDefined();
  });

  it("niet betaald, verkeerd geheim, ander project of geen bestelling: geen maat in het antwoord", async () => {
    for (const body of [
      { order: open, projectRef: REF, shots },
      { order: { ...paid, secret: "fout-geheim" }, projectRef: REF, shots },
      { order: paid, projectRef: "anderproject0001", shots },
      { order: null, projectRef: REF, shots },
    ]) {
      const res = await call(body);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(JSON.parse(text).released).toBe(false);
      expect(text).not.toContain("values");
      expect(text).not.toMatch(/"mm"/);
    }
  });

  it("weigert verzoeken van een andere site en ongeldige invoer", async () => {
    expect((await call({ order: paid, projectRef: REF, shots }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await call({ order: paid, projectRef: REF, shots: [{ ...geometry, points: "x" }] })).status).toBe(400);
    expect((await call({ order: paid, projectRef: "../etc", shots })).status).toBe(400);
  });
});

describe("auditlog, scanstatus en fotocontroles", () => {
  it("het auditlog noemt scans, wijzigingen en bevestiging, met tijd", () => {
    const w = newWindow([]);
    const shot = {
      id: "abcdef12",
      task: "opening",
      values: {},
      processed: false,
      quality: { status: "ok", issues: [] },
    } as unknown as CameraShot;
    const a = withAudit(w, { ...w, camera: [shot] }, "2026-10-19T10:00:00Z");
    expect(a.audit.at(-1)).toEqual({ at: "2026-10-19T10:00:00Z", event: "ScanTag-foto toegevoegd: Raamopening (dag tot dag)" });
    const b = withAudit(a, { ...a, measures: { breedte_boven: 1203 } }, "2026-10-19T10:01:00Z");
    expect(b.audit.at(-1)!.event).toBe("Breedte boven: — → 1203 mm (handmatig)");
    const c = withAudit(b, { ...b, confirmed: true }, "2026-10-19T10:02:00Z");
    expect(c.confirmedAt).toBe("2026-10-19T10:02:00Z");
    expect(c.audit.at(-1)!.event).toMatch(/^Maten bevestigd met regel/);
    expect(withAudit(c, c)).toBe(c);
  });

  it("scanstatus zonder maten: nog scannen, wacht, extra opname, verwerkt", () => {
    const tasks = [CAMERA_TASKS.opening, CAMERA_TASKS.diepte];
    const s = (task: "opening" | "diepte", processed: boolean, ok = true) =>
      ({ id: task, task, processed, quality: { status: ok ? "ok" : "needs_more_data", issues: [] } }) as unknown as CameraShot;
    expect(scanStatus([], tasks).label).toBe("Nog scannen");
    expect(scanStatus([s("opening", false)], tasks).label).toBe("Wacht op verwerking");
    expect(scanStatus([s("opening", true), s("diepte", true, false)], tasks).label).toBe("Extra opname nodig");
    expect(scanStatus([s("opening", true)], tasks).label).toBe("Nog 1 opname");
    expect(scanStatus([s("opening", true), s("diepte", true)], tasks)).toMatchObject({ label: "Scan verwerkt", done: 2, total: 2 });
  });

  it("ziet een onscherpe foto, een te klein vel en een te schuine opname", () => {
    const HH = [1, 0, 100, 0, 1, 100, 0, 0, 1];
    const sheet = [
      { x: 300, y: 200 },
      { x: 510, y: 200 },
      { x: 510, y: 497 },
      { x: 300, y: 497 },
    ];
    const sharp = renderScene({
      h: HH,
      w: 800,
      height: 700,
      background: 150,
      rects: [{ x0: 200, y0: 100, x1: 410, y1: 397, value: 250 }],
      noise: 2,
    });
    expect(checkShot(sharp, [sheet], null, false)).toEqual([]);
    // Motion blur: average 25 pixels along the row.
    const data = new Uint8Array(sharp.data.length);
    for (let y = 0; y < sharp.h; y++)
      for (let x = 0; x < sharp.w; x++) {
        let sum = 0;
        let n = 0;
        for (let d = -12; d <= 12; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= sharp.w) continue;
          sum += sharp.data[y * sharp.w + xx]!;
          n++;
        }
        data[y * sharp.w + x] = Math.round(sum / n);
      }
    const blurred = { ...sharp, data };
    expect(
      checkShot(blurred, [sheet], null, false)
        .map((i) => i.text)
        .join(" "),
    ).toMatch(/onscherp of bewogen/);
    const tiny = sheet.map((p) => ({ x: 300 + (p.x - 300) / 5, y: 200 + (p.y - 200) / 5 }));
    expect(checkShot(null, [tiny], null, false)[0]!.text).toMatch(/te klein in beeld/);
    const oblique = [sheet[0]!, sheet[1]!, { x: 510, y: 300 }, { x: 300, y: 497 }];
    expect(checkShot(null, [oblique], null, false).some((i) => /schuin/.test(i.text))).toBe(true);
  });
});
