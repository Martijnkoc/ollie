import { describe, expect, it } from "vitest";
import { computeProject } from "@/lib/projects/compute";
import { newProject, newRoom, newWindow, userLength } from "@/lib/projects/factory";
import type { Project, ProjectWindow } from "@/lib/projects/schema";
import { buildCsv } from "@/lib/reports/csv";
import { buildReportModel } from "@/lib/reports/model";
import { PAGE, renderReportPdf } from "@/lib/reports/pdf";
import { CATEGORY_KEYS } from "@/lib/materials/catalog";
import { fixture } from "./support/pdf";

const NOW = new Date("2026-10-19T12:00:00Z");

function project(windowCount: number, patch: Partial<Project> = {}): Project {
  const base = newProject(NOW);
  const rooms = [
    newRoom(
      "Woonkamer",
      { kind: "rect", length: userLength(5400), width: userLength(4100) },
      { doors: [{ id: "d1", wall: 0, width: userLength(830) }] },
    ),
    newRoom("Keuken", {
      kind: "rect",
      length: { mm: 3000, status: "auto", source: "pdf-tekst", sourceText: "3.00 x 3.00" },
      width: { mm: 3000, status: "auto", source: "pdf-tekst" },
    }),
    newRoom("Hal", { kind: "drawn", page: 0, points: [], status: "auto" }),
    newRoom("Badkamer 🛁 met inloopdouche − hoek", { kind: "area", m2: 6, status: "confirmed", source: "gebruiker" }),
  ];
  const windows: ProjectWindow[] = [];
  for (let i = 0; i < windowCount; i++) {
    const w = newWindow(windows, {
      product: i % 3 === 0 ? "gordijn" : "rolgordijn",
      mounting: i % 3 === 0 ? "wand" : "in-de-dag",
      roomId: rooms[i % 2]!.id,
      label: i % 4 === 0 ? "raam naast de voordeur met een heel lange omschrijving" : "",
    });
    if (i % 2 === 0) {
      w.measures =
        w.product === "gordijn"
          ? { rail_breedte: 2200, ophanghoogte_links: 2600, ophanghoogte_midden: 2604, ophanghoogte_rechts: 2598 }
          : {
              breedte_boven: 1203,
              breedte_midden: 1201,
              breedte_onder: 1188,
              hoogte_links: 1500,
              hoogte_midden: 1499,
              hoogte_rechts: 1501,
              diepte: 60,
            };
      w.confirmed = i % 4 === 0;
    }
    windows.push(w);
  }
  return {
    ...base,
    name: "Testwoning",
    rooms,
    windows,
    floor: { ...base.floor, packM2: 2.131 },
    plinth: { marginPercent: 10, pieceLengthMm: 2400 },
    payment: null,
    ...patch,
  };
}

async function render(p: Project) {
  const c = computeProject(p);
  const model = buildReportModel(p, c, { now: NOW, plan: null });
  return { model, ...(await renderReportPdf(model)) };
}

async function pdfText(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    standardFontDataUrl: `${import.meta.dirname}/../node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages;
}

function inside(boxes: { x: number; y: number; w: number; h: number }[]) {
  const { width, height, margins: m } = PAGE;
  return boxes.filter(
    (b) => b.x < m.left - 0.5 || b.x + b.w > width - m.right + 0.5 || b.y < m.bottom - 2 || b.y + b.h > height - m.top + 2,
  );
}

describe("PDF-rapport", () => {
  for (const n of [1, 10, 50]) {
    it(`blijft binnen de pagina met ${n} ${n === 1 ? "raam" : "ramen"}`, async () => {
      const { bytes, pages, boxes } = await render(project(n));
      expect(inside(boxes)).toEqual([]);
      const text = (await pdfText(bytes)).join("\n");
      expect(text).toContain(`R${String(n).padStart(2, "0")}`);
      expect(text).toContain(`Pagina ${pages} van ${pages}`);
      // Units never disappear.
      expect(text).toMatch(/m²/);
      expect(text).toMatch(/\d+ mm/);
      expect(text).toContain("volgens leverancier");
      expect(pages).toBeGreaterThanOrEqual(2);
    });
  }

  it("meer ramen geven meer pagina's, met herhaalde tabelkop", async () => {
    const one = await render(project(1));
    const fifty = await render(project(50));
    expect(fifty.pages).toBeGreaterThan(one.pages);
    const pages = await pdfText(fifty.bytes);
    // Pages with register rows: only table cells say "volgens leverancier".
    const withRegister = pages.filter((p) => p.includes("volgens leverancier"));
    expect(withRegister.length).toBeGreaterThan(1);
    for (const p of withRegister) expect(p).toContain("Opening b × h (mm)");
  });

  it("met alle materiaalcategorieën, ScanTag-maten en lange namen blijft alles binnen de pagina", async () => {
    const p = project(12);
    p.materials = {
      selected: [...CATEGORY_KEYS],
      rooms: { laminaat: p.rooms.filter((r) => r.name !== "Hal").map((r) => r.id) },
      inputs: { laminaat: { snijverlies: 7, pak_m2: 2.131 }, verf: { plafondhoogte: 2.6, lagen: 2, dekking: 9, blik_l: 2.5 } },
    };
    const scan = {
      method: "scantag_ar" as const,
      scaleSource: "webxr_hit_test" as const,
      rawMm: 1201.37,
      uncertaintyMm: 27.4,
      shots: 2,
      status: "not_supported_for_ordering" as const,
      reasons: ["sensor_too_coarse" as const],
      device: { webxr: true, hitTest: true, depthSensing: false, domOverlay: true, platform: "android" as const, browser: "Chrome 141" },
      capturedAt: NOW.toISOString(),
    };
    p.windows[1] = {
      ...p.windows[1]!,
      planWidthMm: 1400,
      measures: { ...p.windows[1]!.measures, breedte_boven: 1201.37 },
      sources: { breedte_boven: scan },
    };
    const c = computeProject(p);
    const model = buildReportModel(p, c, { now: NOW, plan: null });
    const { bytes, boxes } = await renderReportPdf(model);
    expect(inside(boxes)).toEqual([]);
    const text = (await pdfText(bytes)).join("\n");
    expect(text).toContain("Materialen");
    // The keuken size is still unconfirmed, so the laminate count is an estimate (and says so).
    expect(text).toContain("Laminaat — Geschat");
    expect(text).toContain("Pakken: afgerond omhoog(39,74 m² / 2,131 m²) = 19");
    expect(text).toContain("Rolluiken — Niet genoeg gegevens");
    expect(text).toContain("ScanTag (AR-tracking)");
    expect(text).toContain("1201 mm ± 28 mm");
    expect(text).not.toMatch(/1201[,.]37/);
    expect(text).toContain("indicatief, geen raammaat");
    expect(text).toContain("PDF_explicit_dimension");
    expect(text).toMatch(/versie 1\.0/);
    expect(text).toContain("afgerond omhoog(");
    expect(text).not.toContain("Badkamer ?");
    expect(model.materials).toHaveLength(CATEGORY_KEYS.length);
    const csv = buildCsv(c, { demo: false, materials: model.materials });
    expect(csv).toContain("Materiaal: Laminaat;Laminaat in pakken;19;pakken;Geschat");
    expect(csv).toContain("Materiaal: Laminaat;Laminaat inclusief snijverlies;39,74;m2;Geschat");
  });

  it("toont herkomst, aannames en de disclaimer, en verzint geen maten", async () => {
    const { model, bytes } = await render(project(2));
    const text = (await pdfText(bytes)).join("\n");
    expect(text).toContain("Automatisch herkend");
    expect(text).toContain("Nog meten");
    expect(text).toContain("Rekenmethode, bronnen en aannames");
    expect(text).toContain("geen garantie");
    expect(model.checklist.todo.join(" ")).toMatch(/Hal/);
    // The hal has no shape: the floor total is incomplete, so no order quantity is printed.
    expect(model.floor.totals[1]!.value).toBe("nog niet te berekenen");
  });

  it("zet het adres er alleen in als de gebruiker dat wil", async () => {
    const address = {
      id: "adr-x",
      weergavenaam: "Voorbeeldstraat 1, 1234AB Voorbeeldstad",
      straat: null,
      huisnummer: 1,
      huisletter: null,
      toevoeging: null,
      postcode: null,
      woonplaats: null,
      gemeente: null,
      point: null,
      verblijfsobjectId: null,
    };
    const without = await render(project(1, { address }));
    expect((await pdfText(without.bytes)).join(" ")).not.toContain("Voorbeeldstraat");
    const withAddr = await render(project(1, { address, report: { includeAddress: true } }));
    expect((await pdfText(withAddr.bytes)).join(" ")).toContain("Voorbeeldstraat 1");
  });

  it("markeert een DEMO-rapport op elke pagina", async () => {
    const { bytes, pages } = await render(
      project(1, { payment: { orderId: "ord_x", orderSecret: "s", status: "paid", mode: "demo", checkedAt: NOW.toISOString() } }),
    );
    const texts = await pdfText(bytes);
    expect(texts[0]).toContain("DEMO-RAPPORT");
    expect(texts.filter((t) => t.includes("DEMO - NIET BETAALD"))).toHaveLength(pages);
  });
});

describe("CSV-bestellijst", () => {
  it("gebruikt puntkomma's, decimale komma's en een BOM, en neutraliseert formules", () => {
    const p = project(1);
    p.rooms[0]!.name = '=HYPERLINK("http://evil")';
    const csv = buildCsv(computeProject(p), { demo: false });
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("﻿Categorie;Omschrijving;Hoeveelheid;Eenheid;Status;Toelichting");
    expect(csv).toContain(";22,14;m2;");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain("volgens meetinstructie leverancier");
  });

  it("raamdecoratie: expliciete velden in hele millimeters, nooit cm of inches", () => {
    const csv = buildCsv(computeProject(project(3)), { demo: false });
    const windowRows = csv.split("\r\n").filter((l) => l.startsWith("Raam "));
    expect(windowRows.length).toBeGreaterThan(0);
    expect(csv).toMatch(/openingWidthMm \(gemeten opening, kleinste breedte\)/);
    expect(csv).toMatch(/openingHeightMm/);
    expect(csv).toMatch(/orderWidthMm \(bestelmaat\)/);
    for (const line of windowRows) {
      const [, , qty, unit] = line.split(";");
      expect(["mm", "typecode"]).toContain(unit);
      if (qty && unit === "mm") expect(qty).toMatch(/^\d+$/);
    }
    expect(windowRows.join("\n")).not.toMatch(/\bcm\b|inch/);
  });
});
