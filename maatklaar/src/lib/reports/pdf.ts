import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { BRAND } from "@/config/site";
import { formatDate } from "@/lib/format";
import type { Cell, ReportModel, ReportStatus, ReportTable } from "./model";

const A4: [number, number] = [595.28, 841.89];
const M = { left: 48, right: 48, top: 54, bottom: 58 };
const CONTENT_W = A4[0] - M.left - M.right;

const C = {
  ink: rgb(0.11, 0.14, 0.13),
  muted: rgb(0.36, 0.4, 0.38),
  faint: rgb(0.55, 0.58, 0.56),
  brand: rgb(0.12, 0.3, 0.23),
  line: rgb(0.86, 0.83, 0.77),
  band: rgb(0.95, 0.93, 0.89),
  demo: rgb(0.85, 0.62, 0.12),
};

const STATUS_COLOR: Record<ReportStatus, RGB> = {
  auto: rgb(0.55, 0.42, 0.06),
  confirmed: rgb(0.11, 0.42, 0.26),
  derived: rgb(0.12, 0.33, 0.47),
  check: rgb(0.65, 0.33, 0.07),
  missing: rgb(0.62, 0.17, 0.14),
  neutral: rgb(0.36, 0.4, 0.38),
};

export type DrawnBox = { page: number; x: number; y: number; w: number; h: number; text: string };

/**
 * A small layout engine on top of pdf-lib: wrapped text, page breaks that never split a table row,
 * repeated table headers, footers with page numbers. Every text box is recorded so tests can prove that
 * nothing falls outside the page.
 */
class Layout {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  boxes: DrawnBox[] = [];
  private charset: Set<number>;

  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.charset = new Set(regular.getCharacterSet());
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M.top;
  }

  get available() {
    return this.y - M.bottom;
  }

  ensure(h: number) {
    if (h > this.available) this.addPage();
  }

  /** Standard PDF fonts only cover WinAnsi; anything else is replaced instead of crashing the export. */
  clean(text: string) {
    const map: Record<string, string> = {
      "\u2212": "-",
      "\u2713": "v",
      "\u2265": ">=",
      "\u2264": "<=",
      "\u2192": "->",
      "\u2190": "<-",
      "\u202f": " ",
      "\u2009": " ",
      "\u2308": "afgerond omhoog(",
      "\u2309": ")",
      "\u230a": "afgerond omlaag(",
      "\u230b": ")",
      "\u2248": "~",
      "\u2026": "...",
    };
    let out = "";
    for (const ch of text.normalize("NFC")) {
      const cp = ch.codePointAt(0)!;
      if (this.charset.has(cp)) out += ch;
      else if (map[ch]) out += map[ch];
      else if (cp === 10 || cp === 9) out += " ";
      // Emoji and other symbols outside the font are left out rather than shown as "?".
      else if (cp > 0xffff || /\p{Extended_Pictographic}/u.test(ch)) continue;
      else out += "?";
    }
    return out;
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of this.clean(text).split(/\n/)) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // A single word wider than the column is broken by characters.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length - 1;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          lines.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  drawText(text: string, x: number, baseline: number, size: number, font: PDFFont, color: RGB) {
    const t = this.clean(text);
    if (!t) return;
    const w = font.widthOfTextAtSize(t, size);
    this.page.drawText(t, { x, y: baseline, size, font, color });
    this.boxes.push({ page: this.pages.length - 1, x, y: baseline - size * 0.22, w, h: size * 1.2, text: t });
  }

  paragraph(text: string, opts: { size?: number; font?: PDFFont; color?: RGB; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? this.regular;
    const indent = opts.indent ?? 0;
    const lh = size * 1.38;
    for (const line of this.wrap(text, font, size, CONTENT_W - indent)) {
      this.ensure(lh);
      this.drawText(line, M.left + indent, this.y - size, size, font, opts.color ?? C.ink);
      this.y -= lh;
    }
    this.y -= opts.gap ?? 4;
  }

  heading(text: string, level: 1 | 2 = 2) {
    const size = level === 1 ? 22 : 13;
    this.ensure(size * 2.6 + 40); // keep a heading together with the start of its content
    this.y -= level === 1 ? 0 : 10;
    this.drawText(text, M.left, this.y - size, size, this.bold, level === 1 ? C.brand : C.ink);
    this.y -= size * 1.5;
    if (level === 2) {
      this.page.drawLine({
        start: { x: M.left, y: this.y + 4 },
        end: { x: A4[0] - M.right, y: this.y + 4 },
        thickness: 0.6,
        color: C.line,
      });
      this.y -= 6;
    }
  }

  bullets(items: string[], size = 9.5) {
    for (const item of items) {
      const lines = this.wrap(item, this.regular, size, CONTENT_W - 14);
      const lh = size * 1.38;
      this.ensure(lh * Math.min(lines.length, 3));
      lines.forEach((line, i) => {
        this.ensure(lh);
        if (i === 0) this.drawText("•", M.left + 2, this.y - size, size, this.bold, C.brand);
        this.drawText(line, M.left + 14, this.y - size, size, this.regular, C.ink);
        this.y -= lh;
      });
      this.y -= 2;
    }
    this.y -= 4;
  }

  keyValues(rows: { label: string; value: string }[], size = 9.5) {
    const labelW = CONTENT_W * 0.55;
    for (const r of rows) {
      const left = this.wrap(r.label, this.regular, size, labelW - 8);
      const right = this.wrap(r.value, this.bold, size, CONTENT_W - labelW);
      const n = Math.max(left.length, right.length);
      const lh = size * 1.4;
      this.ensure(n * lh + 4);
      left.forEach((l, i) => this.drawText(l, M.left, this.y - size - i * lh, size, this.regular, C.muted));
      right.forEach((l, i) => this.drawText(l, M.left + labelW, this.y - size - i * lh, size, this.bold, C.ink));
      this.y -= n * lh + 4;
    }
    this.y -= 4;
  }

  /** A card that is never split over two pages: optional photo on the left, label/value rows on the right. */
  async card(title: string, photo: { jpg: Uint8Array; width: number; height: number } | null, rows: { label: string; value: string }[]) {
    const size = 8.5;
    const lh = size * 1.35;
    const photoW = photo ? 130 : 0;
    const photoH = photo ? Math.min(150, (photo.height / photo.width) * photoW) : 0;
    const textX = M.left + (photo ? photoW + 14 : 0);
    const textW = CONTENT_W - (textX - M.left);
    const labelW = 105;
    const wrapped = rows.map((r) => ({
      label: this.wrap(r.label, this.regular, size, labelW - 6),
      value: this.wrap(r.value, this.regular, size, textW - labelW),
    }));
    const textH = wrapped.reduce((h, r) => h + Math.max(r.label.length, r.value.length) * lh + 2, 0);
    const h = 18 + Math.max(photoH, textH) + 10;
    this.ensure(h);
    const top = this.y;
    this.page.drawRectangle({ x: M.left, y: top - h, width: CONTENT_W, height: h, borderColor: C.line, borderWidth: 0.6 });
    this.drawText(title, M.left + 8, top - 13, 10, this.bold, C.brand);
    if (photo) {
      const img = await this.doc.embedJpg(photo.jpg);
      this.page.drawImage(img, { x: M.left + 8, y: top - 18 - photoH, width: photoW - 8, height: photoH });
    }
    let y = top - 20;
    for (const r of wrapped) {
      const n = Math.max(r.label.length, r.value.length);
      r.label.forEach((l, i) => this.drawText(l, textX + 4, y - size - i * lh, size, this.regular, C.muted));
      r.value.forEach((l, i) => this.drawText(l, textX + labelW, y - size - i * lh, size, this.regular, C.ink));
      y -= n * lh + 2;
    }
    this.y = top - h - 8;
  }

  table(t: ReportTable, size = 8) {
    const widths = t.columns.map((c) => c.width * CONTENT_W);
    const pad = 4;
    const lh = size * 1.3;
    const header = () => {
      const lines = t.columns.map((c, i) => this.wrap(c.header, this.bold, size, widths[i]! - 2 * pad));
      const h = Math.max(...lines.map((l) => l.length)) * lh + 2 * pad;
      this.page.drawRectangle({ x: M.left, y: this.y - h, width: CONTENT_W, height: h, color: C.band });
      let x = M.left;
      lines.forEach((ls, i) => {
        ls.forEach((l, j) => {
          const w = this.bold.widthOfTextAtSize(l, size);
          const tx = t.columns[i]!.align === "right" ? x + widths[i]! - pad - w : x + pad;
          this.drawText(l, tx, this.y - pad - size - j * lh + 1.5, size, this.bold, C.muted);
        });
        x += widths[i]!;
      });
      this.y -= h;
      return h;
    };
    this.ensure(lh * 4 + 20);
    header();
    const maxRowH = A4[1] - M.top - M.bottom - 40;
    for (const row of t.rows) {
      let lines = row.map((cell, i) => this.wrap(cell.text, this.regular, size, widths[i]! - 2 * pad - (cell.status ? 9 : 0)));
      let h = Math.max(...lines.map((l) => l.length)) * lh + 2 * pad;
      if (h > maxRowH) {
        // Never seen in practice; guards against unreadable overflow by truncating an absurdly long cell.
        const maxLines = Math.floor((maxRowH - 2 * pad) / lh);
        lines = lines.map((l) => (l.length > maxLines ? [...l.slice(0, maxLines - 1), "…"] : l));
        h = maxRowH;
      }
      if (h > this.available) {
        this.addPage();
        header();
      }
      let x = M.left;
      row.forEach((cell: Cell, i) => {
        const cellLines = lines[i]!;
        const color = cell.status ? STATUS_COLOR[cell.status] : C.ink;
        if (cell.status && cell.text) this.page.drawCircle({ x: x + pad + 3, y: this.y - pad - size * 0.62, size: 2.6, color });
        cellLines.forEach((l, j) => {
          const w = this.regular.widthOfTextAtSize(l, size);
          const tx = t.columns[i]!.align === "right" ? x + widths[i]! - pad - w : x + pad + (cell.status ? 9 : 0);
          this.drawText(l, tx, this.y - pad - size - j * lh + 1.5, size, this.regular, cell.status ? color : C.ink);
        });
        x += widths[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M.left, y: this.y }, end: { x: A4[0] - M.right, y: this.y }, thickness: 0.4, color: C.line });
    }
    this.y -= 10;
  }
}

export async function renderReportPdf(model: ReportModel): Promise<{ bytes: Uint8Array; pages: number; boxes: DrawnBox[] }> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} — ${model.projectName}`);
  doc.setCreator(BRAND.name);
  doc.setProducer(BRAND.name);
  doc.setLanguage("nl-NL");
  const L = new Layout(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

  // 1. Cover and project
  L.drawText(`${BRAND.name.toUpperCase()} · ${model.title.toUpperCase()}`, M.left, L.y - 9, 8.5, L.bold, C.brand);
  L.y -= 30;
  L.heading(model.projectName, 1);
  L.paragraph(`${model.address ? `${model.address} · ` : ""}Gemaakt op ${formatDate(model.createdAt)}`, { color: C.muted });
  if (model.demo) {
    L.ensure(40);
    L.page.drawRectangle({
      x: M.left,
      y: L.y - 30,
      width: CONTENT_W,
      height: 30,
      color: rgb(1, 0.95, 0.82),
      borderColor: C.demo,
      borderWidth: 1,
    });
    L.drawText(
      "DEMO-RAPPORT — niet betaald. Gemaakt met een nagebootste betaling om de app te testen.",
      M.left + 10,
      L.y - 19,
      9.5,
      L.bold,
      rgb(0.4, 0.28, 0.02),
    );
    L.y -= 40;
  }
  L.bullets(model.summary);

  // 2. Woningoverzicht
  if (model.building) {
    L.heading("Woningoverzicht");
    L.keyValues(model.building);
    L.paragraph(
      `Bron: ${model.buildingSource}. De gebruiksoppervlakte geldt voor de hele woning en is een andere meting dan de vloer per kamer.`,
      { size: 8.5, color: C.muted },
    );
  }

  // 3. Plattegrond
  if (model.plan) {
    L.heading("Plattegrond");
    const img = await doc.embedPng(model.plan.png);
    const maxH = 360;
    const s = Math.min(CONTENT_W / model.plan.width, maxH / model.plan.height);
    const w = model.plan.width * s;
    const h = model.plan.height * s;
    L.ensure(h + 30);
    L.page.drawImage(img, { x: M.left, y: L.y - h, width: w, height: h });
    L.page.drawRectangle({ x: M.left, y: L.y - h, width: w, height: h, borderColor: C.line, borderWidth: 0.6 });
    L.y -= h + 6;
    L.paragraph(model.plan.caption, { size: 8, color: C.muted });
  }

  // 4. Vloer
  L.heading("Vloer");
  L.table(model.floor.table);
  L.keyValues(model.floor.totals);
  L.paragraph("Zo is gerekend:", { size: 8.5, font: L.bold, color: C.muted, gap: 2 });
  L.bullets(model.floor.steps, 8.5);

  // 5. Plinten
  L.heading("Plinten");
  if (model.plinths.table.rows.length) L.table(model.plinths.table);
  else L.paragraph("Er zijn geen ruimtes gekozen voor plinten.", { color: C.muted });
  L.keyValues(model.plinths.totals);
  L.paragraph("Zo is gerekend:", { size: 8.5, font: L.bold, color: C.muted, gap: 2 });
  L.bullets(model.plinths.steps, 8.5);

  // 6. Raamregister
  L.heading("Raamregister");
  if (model.windows.table.rows.length) {
    L.table(model.windows.table, 7.5);
    L.paragraph(
      "Ruwe maten staan apart van bestelmaten. Een bestelmaat staat er alleen als een gecontroleerde meetregel van een leverancier is gekozen.",
      { size: 8, color: C.muted },
    );
    if (model.windows.notes.length) L.bullets(model.windows.notes, 8);
  } else L.paragraph("Er staan nog geen ramen in het register.", { color: C.muted });

  if (model.windows.cards.length) {
    L.paragraph("Per raam", { font: L.bold, gap: 4 });
    for (const card of model.windows.cards) await L.card(card.title, card.photo, card.rows);
  }

  // 6b. Materialen
  if (model.materials.length) {
    L.heading("Materialen");
    for (const m of model.materials) {
      L.ensure(80);
      L.paragraph(`${m.label} — ${m.statusLabel}`, { font: L.bold, size: 10.5, color: STATUS_COLOR[m.status], gap: 2 });
      L.table(m.table);
      if (m.missing.length)
        L.bullets(
          m.missing.map((x) => `Ontbreekt: ${x}`),
          8.5,
        );
      if (m.assumptions.length) L.bullets(m.assumptions, 8.5);
      if (m.steps.length) L.bullets(m.steps, 8);
      L.paragraph(m.rule, { size: 7.5, color: C.muted });
    }
  }

  // 7. Winkelchecklist
  L.heading("Winkelchecklist");
  L.paragraph("Dit kun je bestellen", { font: L.bold, gap: 2 });
  L.bullets(model.checklist.order.length ? model.checklist.order : ["Nog niets: rond eerst de punten hieronder af."]);
  L.paragraph("Dit moet nog gemeten of bevestigd worden", { font: L.bold, gap: 2 });
  L.bullets(model.checklist.todo.length ? model.checklist.todo : ["Niets openstaand."]);

  // 8. Rekenmethode en waarschuwingen
  L.heading("Rekenmethode, bronnen en aannames");
  L.bullets(model.assumptions, 8.5);

  // 9. Geen valse garantie
  L.heading("Belangrijk");
  L.paragraph(model.disclaimer, { size: 9 });

  // Footers and demo watermark on every page.
  const total = L.pages.length;
  L.pages.forEach((page, i) => {
    const footer = L.clean(`${BRAND.name} · ${model.projectName} · ${formatDate(model.createdAt)}`);
    page.drawLine({ start: { x: M.left, y: M.bottom - 16 }, end: { x: A4[0] - M.right, y: M.bottom - 16 }, thickness: 0.4, color: C.line });
    page.drawText(footer.slice(0, 90), { x: M.left, y: M.bottom - 30, size: 7.5, font: L.regular, color: C.faint });
    const num = `Pagina ${i + 1} van ${total}`;
    page.drawText(num, {
      x: A4[0] - M.right - L.regular.widthOfTextAtSize(num, 7.5),
      y: M.bottom - 30,
      size: 7.5,
      font: L.regular,
      color: C.faint,
    });
    if (model.demo)
      page.drawText("DEMO - NIET BETAALD", { x: 120, y: 300, size: 54, font: L.bold, color: C.demo, opacity: 0.12, rotate: degrees(35) });
  });

  return { bytes: await doc.save(), pages: total, boxes: L.boxes };
}

export const PAGE = { width: A4[0], height: A4[1], margins: M };
