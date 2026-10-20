// Generates small synthetic floor plans for tests and demos. All homes are fictional.
// Run with `npm run fixtures`. PDFs are drawn to a true scale so the analysis can be checked exactly.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "fixtures");
mkdirSync(out, { recursive: true });

const MM_PER_PT = 25.4 / 72;
const A4_LANDSCAPE = [841.89, 595.28];
const A4_PORTRAIT = [595.28, 841.89];
const ink = rgb(0.12, 0.14, 0.15);
const grey = rgb(0.45, 0.47, 0.48);

/** Plan helper: real millimetres → PDF points for a page at scale 1:denominator. */
function planPage(doc, size, denominator, origin) {
  const page = doc.addPage(size);
  const k = MM_PER_PT * denominator; // real mm per pt
  const [, H] = size;
  const P = (x, y) => ({ x: origin.x + x / k, y: H - origin.y - y / k });
  return { page, k, P };
}

function wall(page, P, x1, y1, x2, y2, thickness = 2.2) {
  page.drawLine({ start: P(x1, y1), end: P(x2, y2), thickness, color: ink });
}

function windowIn(page, P, x1, y1, x2, y2) {
  // A window: interrupt the wall and draw three thin parallel lines.
  page.drawLine({ start: P(x1, y1), end: P(x2, y2), thickness: 3.2, color: rgb(1, 1, 1) });
  const horizontal = y1 === y2;
  for (const off of [-60, 0, 60]) {
    const a = horizontal ? P(x1, y1 + off) : P(x1 + off, y1);
    const b = horizontal ? P(x2, y2 + off) : P(x2 + off, y2);
    page.drawLine({ start: a, end: b, thickness: 0.5, color: ink });
  }
}

function door(page, P, k, hingeX, hingeY, widthMm, dir) {
  // Quarter-circle swing drawn as an SVG path in points, relative to the hinge.
  const r = widthMm / k;
  const h = P(hingeX, hingeY);
  const paths = {
    "right-down": `M 0 0 L ${r} 0 A ${r} ${r} 0 0 1 0 ${r} Z`,
    "left-down": `M 0 0 L ${-r} 0 A ${r} ${r} 0 0 0 0 ${r} Z`,
    "down-right": `M 0 0 L 0 ${r} A ${r} ${r} 0 0 0 ${r} 0 Z`,
    "up-right": `M 0 0 L 0 ${-r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
  };
  page.drawSvgPath(paths[dir], { x: h.x, y: h.y, borderColor: grey, borderWidth: 0.4 });
}

function label(page, P, font, bold, xMm, yMm, name, sub) {
  const c = P(xMm, yMm);
  const nw = bold.widthOfTextAtSize(name, 9);
  page.drawText(name, { x: c.x - nw / 2, y: c.y + 2, size: 9, font: bold, color: ink });
  if (sub) {
    const sw = font.widthOfTextAtSize(sub, 8);
    page.drawText(sub, { x: c.x - sw / 2, y: c.y - 9, size: 8, font, color: grey });
  }
}

function dimension(page, P, font, x1, y1, x2, y2, text, offsetMm) {
  // A dimension line parallel to the measured wall with ticks and a label.
  const horizontal = y1 === y2;
  const a = horizontal ? P(x1, y1 - offsetMm) : P(x1 - offsetMm, y1);
  const b = horizontal ? P(x2, y2 - offsetMm) : P(x2 - offsetMm, y2);
  page.drawLine({ start: a, end: b, thickness: 0.4, color: grey });
  for (const p of [a, b]) {
    page.drawLine({ start: { x: p.x - 2, y: p.y - 2 }, end: { x: p.x + 2, y: p.y + 2 }, thickness: 0.6, color: grey });
  }
  const w = font.widthOfTextAtSize(text, 7);
  if (horizontal) page.drawText(text, { x: (a.x + b.x) / 2 - w / 2, y: a.y + 2.5, size: 7, font, color: grey });
  else page.drawText(text, { x: a.x - 2.5, y: (a.y + b.y) / 2 - w / 2, size: 7, font, color: grey, rotate: degrees(90) });
}

async function fonts(doc) {
  return { font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

function title(page, font, bold, size, lines) {
  page.drawText(lines[0], { x: 40, y: size[1] - 36, size: 12, font: bold, color: ink });
  lines.slice(1).forEach((l, i) => page.drawText(l, { x: 40, y: size[1] - 52 - i * 12, size: 8.5, font, color: grey }));
}

/** Appartement: L-vormige woonkamer, werkkamer, keuken, hal, twee slaapkamers, badkamer, toilet, berging. 1:50. */
async function appartement() {
  const doc = await PDFDocument.create();
  doc.setTitle("Fictief testappartement");
  doc.setProducer("MaatKlaar fixtures");
  const { font, bold } = await fonts(doc);
  const { page, k, P } = planPage(doc, A4_LANDSCAPE, 50, { x: 80, y: 120 });
  title(page, font, bold, A4_LANDSCAPE, ["Plattegrond appartement — fictief testvoorbeeld", "Schaal 1:50 (A4)  ·  maten in meters"]);

  // Outer walls (the woonkamer is an L: its south-west corner is the werkkamer).
  wall(page, P, 0, 0, 12000, 0, 3);
  wall(page, P, 12000, 0, 12000, 8000, 3);
  wall(page, P, 12000, 8000, 0, 8000, 3);
  wall(page, P, 0, 8000, 0, 0, 3);
  // Inner walls.
  wall(page, P, 6000, 0, 6000, 8000);
  wall(page, P, 0, 5000, 2500, 5000);
  wall(page, P, 2500, 5000, 2500, 8000);
  wall(page, P, 6000, 3000, 9000, 3000);
  wall(page, P, 9000, 0, 9000, 8000);
  wall(page, P, 6000, 5000, 9000, 5000);
  wall(page, P, 8000, 5000, 8000, 8000);
  wall(page, P, 8000, 6500, 9000, 6500);
  wall(page, P, 9000, 4200, 12000, 4200);

  // Windows on the outer walls.
  windowIn(page, P, 1000, 0, 4800, 0);
  windowIn(page, P, 6800, 0, 8400, 0);
  windowIn(page, P, 9600, 0, 11400, 0);
  windowIn(page, P, 12000, 5200, 12000, 7200);
  windowIn(page, P, 3200, 8000, 5400, 8000);
  windowIn(page, P, 6500, 8000, 7500, 8000);

  // Doors.
  door(page, P, k, 6000, 3300, 830, "right-down");
  door(page, P, k, 9000, 3300, 830, "left-down");
  door(page, P, k, 9000, 4500, 830, "right-down");
  door(page, P, k, 6300, 5000, 830, "down-right");
  door(page, P, k, 8000, 5200, 730, "right-down");
  door(page, P, k, 2500, 5300, 830, "right-down");

  label(page, P, font, bold, 3800, 2400, "Woonkamer", "40,5 m²");
  label(page, P, font, bold, 1250, 6500, "Werkkamer", "2.50 x 3.00");
  label(page, P, font, bold, 7500, 1500, "Keuken", "3.00 x 3.00");
  label(page, P, font, bold, 7500, 4000, "Hal", "3.00 x 2.00");
  label(page, P, font, bold, 10500, 2100, "Slaapkamer 1", "3.00 x 4.20");
  label(page, P, font, bold, 10500, 6100, "Slaapkamer 2", "3.00 x 3.80");
  label(page, P, font, bold, 7000, 6500, "Badkamer", "2.00 x 3.00");
  label(page, P, font, bold, 8500, 5750, "Toilet", "1.00 x 1.50");
  label(page, P, font, bold, 8500, 7250, "Berging", "1.00 x 1.50");

  dimension(page, P, font, 0, 0, 12000, 0, "12.00", 700);
  dimension(page, P, font, 0, 0, 0, 8000, "8.00", 700);

  // Page 2: zolder (shows multi-page handling).
  const second = planPage(doc, A4_LANDSCAPE, 50, { x: 70, y: 95 });
  title(second.page, font, bold, A4_LANDSCAPE, ["Zolder — fictief testvoorbeeld", "Schaal 1:50 (A4)"]);
  wall(second.page, second.P, 0, 0, 6000, 0, 3);
  wall(second.page, second.P, 6000, 0, 6000, 4000, 3);
  wall(second.page, second.P, 6000, 4000, 0, 4000, 3);
  wall(second.page, second.P, 0, 4000, 0, 0, 3);
  label(second.page, second.P, font, bold, 3000, 2000, "Zolder", "6.00 x 4.00");
  writeFileSync(path.join(out, "appartement.pdf"), await doc.save());
}

/** Eén rechthoekige woonkamer met maatlijnen in millimeters (ook verticale tekst). 1:50 op A4 staand. */
async function woonkamer() {
  const doc = await PDFDocument.create();
  const { font, bold } = await fonts(doc);
  const { page, P } = planPage(doc, A4_PORTRAIT, 50, { x: 120, y: 200 });
  title(page, font, bold, A4_PORTRAIT, ["Woonkamer — fictief testvoorbeeld", "Schaal 1:50 (A4)"]);
  wall(page, P, 0, 0, 5400, 0, 3);
  wall(page, P, 5400, 0, 5400, 4100, 3);
  wall(page, P, 5400, 4100, 0, 4100, 3);
  wall(page, P, 0, 4100, 0, 0, 3);
  windowIn(page, P, 1200, 0, 4200, 0);
  label(page, P, font, bold, 2700, 2050, "Woonkamer", "5.40 x 4.10");
  dimension(page, P, font, 0, 0, 5400, 0, "5400", 800);
  dimension(page, P, font, 0, 0, 0, 4100, "4100", 800);
  writeFileSync(path.join(out, "woonkamer-rechthoek.pdf"), await doc.save());
}

/** L-vormige kamer: 7,50 × 6,00 met een uitsparing van 3,00 × 3,50 → 34,5 m². */
async function lvorm() {
  const doc = await PDFDocument.create();
  const { font, bold } = await fonts(doc);
  const { page, P } = planPage(doc, A4_PORTRAIT, 50, { x: 90, y: 200 });
  title(page, font, bold, A4_PORTRAIT, ["L-vormige woonkamer — fictief testvoorbeeld", "Schaal 1:50 (A4)"]);
  const pts = [
    [0, 0],
    [7500, 0],
    [7500, 2500],
    [4500, 2500],
    [4500, 6000],
    [0, 6000],
  ];
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    wall(page, P, x, y, nx, ny, 3);
  });
  label(page, P, font, bold, 2250, 2000, "Woonkamer", "34,5 m²");
  dimension(page, P, font, 0, 0, 7500, 0, "7.50", 800);
  dimension(page, P, font, 0, 0, 0, 6000, "6.00", 800);
  writeFileSync(path.join(out, "l-vorm.pdf"), await doc.save());
}

/** Tekening zonder schaal en zonder maten: de app moet om kalibratie vragen. */
async function zonderSchaal() {
  const doc = await PDFDocument.create();
  const { font, bold } = await fonts(doc);
  const size = [600, 450];
  const page = doc.addPage(size);
  const P = (x, y) => ({ x: 60 + x / 20, y: size[1] - 80 - y / 20 });
  title(page, font, bold, size, ["Indeling — NIET OP SCHAAL", "Afmetingen indicatief"]);
  wall(page, P, 0, 0, 8000, 0, 3);
  wall(page, P, 8000, 0, 8000, 6000, 3);
  wall(page, P, 8000, 6000, 0, 6000, 3);
  wall(page, P, 0, 6000, 0, 0, 3);
  wall(page, P, 5000, 0, 5000, 6000);
  label(page, P, font, bold, 2500, 3000, "Woonkamer");
  label(page, P, font, bold, 6500, 3000, "Keuken");
  writeFileSync(path.join(out, "zonder-schaal.pdf"), await doc.save());
}

async function brokenFiles() {
  writeFileSync(path.join(out, "kapot.pdf"), Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog"), Buffer.alloc(200, 0x41)]));
  writeFileSync(path.join(out, "nep-afbeelding.png"), Buffer.from("<html><body>dit is geen afbeelding</body></html>"));
}

/** Rasterised plans via headless Chromium: a clean "scan" and one with blurred, incomplete labels. */
async function scans() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.warn("Playwright niet beschikbaar; scans overgeslagen.");
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const svg = (blurred) => `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100" font-family="Arial, Helvetica, sans-serif">
      <rect width="1600" height="1100" fill="#fdfcf8"/>
      <g transform="translate(100 120) rotate(${blurred ? 0.8 : 0})" stroke="#222" fill="none">
        <rect x="0" y="0" width="1200" height="800" stroke-width="8"/>
        <line x1="600" y1="0" x2="600" y2="800" stroke-width="5"/>
        <line x1="600" y1="400" x2="1200" y2="400" stroke-width="5"/>
        <line x1="900" y1="400" x2="900" y2="800" stroke-width="5"/>
      </g>
      <g transform="translate(100 120)" fill="#111" text-anchor="middle" ${blurred ? 'filter="url(#b)"' : ""}>
        <text x="300" y="390" font-size="34" font-weight="bold">Woonkamer</text>
        <text x="300" y="432" font-size="28">${blurred ? "6.0? x 8.0?" : "6.00 x 8.00"}</text>
        <text x="900" y="190" font-size="34" font-weight="bold">Slaapkamer</text>
        <text x="900" y="232" font-size="28">6.00 x 4.00</text>
        <text x="750" y="590" font-size="34" font-weight="bold">Badkamer</text>
        <text x="750" y="632" font-size="28">${blurred ? "" : "3.00 x 4.00"}</text>
        <text x="1050" y="590" font-size="34" font-weight="bold">Keuken</text>
        <text x="1050" y="632" font-size="28">3.00 x 4.00</text>
      </g>
      <defs><filter id="b"><feGaussianBlur stdDeviation="${blurred ? 1.3 : 0}"/></filter></defs>
    </svg>`;
  for (const [name, blurred] of [
    ["scan-helder.png", false],
    ["scan-onduidelijk.png", true],
  ]) {
    await page.setContent(`<html><body style="margin:0">${svg(blurred)}</body></html>`);
    writeFileSync(path.join(out, name), await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1600, height: 1100 } }));
  }
  // A small JPEG and WEBP of the clean scan for format tests.
  await page.setContent(`<html><body style="margin:0">${svg(false)}</body></html>`);
  writeFileSync(
    path.join(out, "scan-helder.jpg"),
    await page.screenshot({ type: "jpeg", quality: 80, clip: { x: 0, y: 0, width: 1600, height: 1100 } }),
  );
  const webp = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fdfcf8";
    ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, 360, 260);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  writeFileSync(path.join(out, "klein.webp"), Buffer.from(webp));
  await browser.close();
}

/**
 * A fictional ground floor drawn like a makelaarsplattegrond (Zibber/Floorplanner style): filled black walls,
 * pastel room colours, grey furniture, a black cooktop and TV against the wall, windows as gaps with thin
 * frame lines, doors with threshold lines and swings, and dimension chains with ticks outside the building.
 * Only room names, no room dimensions: the app has to measure from the walls. 130 px per metre.
 * Truth (interior, mm): Woonkamer L 6000×4000 + 3400×1600 = 29,44 m²; Keuken 2500×1500; Hal 2000×2700;
 * Badkamer 2000×2700; Slaapkamer 1800×2700.
 */
async function wandenPlan() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.warn("Playwright niet beschikbaar; plattegrond-wanden overgeslagen.");
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const S = 0.13;
    const OX = 270;
    const OY = 250;
    const W = 1360;
    const H = 1640;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const X = (x) => OX + x * S;
    const Y = (y) => OY + y * S;
    const rect = (x0, y0, x1, y1, fill) => {
      g.fillStyle = fill;
      g.fillRect(X(x0), Y(y0), (x1 - x0) * S, (y1 - y0) * S);
    };
    const line = (x0, y0, x1, y1, color = "#8c8c8c", width = 1.5) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(X(x0), Y(y0));
      g.lineTo(X(x1), Y(y1));
      g.stroke();
    };
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);

    // Room colours.
    rect(0, 0, 6000, 4000, "#e4dcc6");
    rect(0, 4000, 3400, 5600, "#e4dcc6");
    rect(3500, 4100, 6000, 5600, "#e4dcc6");
    rect(0, 5700, 2000, 8400, "#c7b9a9");
    rect(2100, 5700, 4100, 8400, "#96abc6");
    rect(4200, 5700, 6000, 8400, "#c9e0b4");

    // Furniture.
    rect(300, 300, 2500, 1200, "#bfc3c7");
    g.fillStyle = "#cfcfcf";
    g.beginPath();
    g.ellipse(X(4200), Y(2300), 900 * S, 500 * S, 0, 0, Math.PI * 2);
    g.fill();
    rect(5960, 800, 6000, 2200, "#161616"); // TV against the wall
    rect(3500, 5000, 6000, 5600, "#d7d7d7"); // worktop
    rect(5400, 5050, 6000, 5550, "#191919"); // cooktop against the wall
    g.fillStyle = "#c62020";
    for (const [cx, cy] of [
      [5550, 5180],
      [5850, 5180],
      [5550, 5420],
      [5850, 5420],
    ]) {
      g.beginPath();
      g.arc(X(cx), Y(cy), 80 * S, 0, Math.PI * 2);
      g.fill();
    }
    rect(2150, 6000, 2950, 7700, "#f4f4f4"); // bath
    g.strokeStyle = "#9a9a9a";
    g.lineWidth = 1;
    g.strokeRect(X(2150), Y(6000), 800 * S, 1700 * S);
    rect(4400, 6300, 5800, 8200, "#9a9a9a"); // bed
    rect(4400, 6300, 5800, 6800, "#ececec");
    rect(4400, 7000, 5800, 8200, "#787878");

    // Walls: 300 mm outside, 100 mm inside.
    const black = "#000000";
    rect(-300, -300, 6300, 0, black);
    rect(-300, 8400, 6300, 8700, black);
    rect(-300, -300, 0, 8700, black);
    rect(6000, -300, 6300, 8700, black);
    rect(3400, 4000, 6000, 4100, black);
    rect(3400, 4000, 3500, 5600, black);
    rect(0, 5600, 6000, 5700, black);
    rect(2000, 5700, 2100, 8400, black);
    rect(4100, 5700, 4200, 8400, black);

    // Windows: a gap in the outer wall with frame lines along the wall.
    const windowH = (x0, x1, y0, y1) => {
      rect(x0, y0, x1, y1, "#ffffff");
      for (const t of [0.05, 0.5, 0.95]) line(x0, y0 + (y1 - y0) * t, x1, y0 + (y1 - y0) * t);
    };
    const windowV = (y0, y1, x0, x1) => {
      rect(x0, y0, x1, y1, "#ffffff");
      for (const t of [0.05, 0.5, 0.95]) line(x0 + (x1 - x0) * t, y0, x0 + (x1 - x0) * t, y1);
    };
    windowH(600, 2000, -300, 0);
    windowH(3200, 5400, -300, 0);
    windowV(1000, 2600, -300, 0);
    windowV(4300, 5300, 6000, 6300);
    windowV(6400, 7600, 6000, 6300);
    windowH(2500, 3600, 8400, 8700);
    windowH(4600, 5600, 8400, 8700);

    // Doors: a gap with threshold lines at both wall faces; some with a leaf and swing.
    const doorH = (x0, x1, y0, y1) => {
      rect(x0, y0, x1, y1, "#ffffff");
      line(x0, y0, x1, y0, "#6e6e6e");
      line(x0, y1, x1, y1, "#6e6e6e");
    };
    const doorV = (y0, y1, x0, x1) => {
      rect(x0, y0, x1, y1, "#ffffff");
      line(x0, y0, x0, y1, "#6e6e6e");
      line(x1, y0, x1, y1, "#6e6e6e");
    };
    const swing = (hx, hy, r, a0, a1) => {
      g.strokeStyle = "#4a4a4a";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(X(hx), Y(hy), r * S, Math.min(a0, a1), Math.max(a0, a1));
      g.stroke();
      g.beginPath();
      g.moveTo(X(hx), Y(hy));
      g.lineTo(X(hx) + Math.cos(a0) * r * S, Y(hy) + Math.sin(a0) * r * S);
      g.stroke();
    };
    doorH(4200, 5050, 4000, 4100);
    swing(4200, 4100, 850, Math.PI / 2, 0);
    doorH(600, 1450, 5600, 5700);
    doorV(6000, 6800, 2000, 2100);
    doorH(4600, 5400, 5600, 5700);
    doorH(500, 1500, 8400, 8700);
    swing(500, 8400, 1000, -Math.PI / 2, 0);

    // Room names only, like most makelaarsplattegronden.
    g.fillStyle = "#333333";
    g.font = "22px Arial, Helvetica, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const [name, x, y] of [
      ["Woonkamer", 2400, 2700],
      ["Keuken", 5450, 4500],
      ["Hal", 1000, 7000],
      ["Badkamer", 3550, 7100],
      ["Slaapkamer", 5100, 5980],
    ])
      g.fillText(name, X(x), Y(y));

    // Dimension chains outside, measured between the inner faces like on Zibber plans.
    g.font = "24px Arial, Helvetica, sans-serif";
    const tick = (px, py, vertical) => {
      g.strokeStyle = "#222222";
      g.lineWidth = 1.5;
      g.beginPath();
      if (vertical) (g.moveTo(px - 7, py), g.lineTo(px + 7, py));
      else (g.moveTo(px, py - 7), g.lineTo(px, py + 7));
      g.stroke();
    };
    const dimH = (x0, x1, yPx, text) => {
      const a = X(x0);
      const b = X(x1);
      const tw = g.measureText(text).width + 16;
      const m = (a + b) / 2;
      g.strokeStyle = "#222222";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(a, yPx);
      g.lineTo(m - tw / 2, yPx);
      g.moveTo(m + tw / 2, yPx);
      g.lineTo(b, yPx);
      g.stroke();
      tick(a, yPx, false);
      tick(b, yPx, false);
      g.fillStyle = "#222222";
      g.fillText(text, m, yPx);
    };
    const dimV = (y0, y1, xPx, text) => {
      const a = Y(y0);
      const b = Y(y1);
      const tw = g.measureText(text).width + 16;
      const m = (a + b) / 2;
      g.strokeStyle = "#222222";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(xPx, a);
      g.lineTo(xPx, m - tw / 2);
      g.moveTo(xPx, m + tw / 2);
      g.lineTo(xPx, b);
      g.stroke();
      tick(xPx, a, true);
      tick(xPx, b, true);
      g.save();
      g.translate(xPx, m);
      g.rotate(-Math.PI / 2);
      g.fillStyle = "#222222";
      g.fillText(text, 0, 0);
      g.restore();
    };
    dimH(0, 3400, Y(-300) - 90, "3.40 m");
    dimH(3500, 6000, Y(-300) - 90, "2.50 m");
    dimH(0, 6000, Y(-300) - 170, "6.00 m");
    dimH(0, 2000, Y(8700) + 90, "2.00 m");
    dimH(2100, 4100, Y(8700) + 90, "2.00 m");
    dimH(4200, 6000, Y(8700) + 90, "1.80 m");
    dimH(0, 6000, Y(8700) + 170, "6.00 m");
    dimV(0, 5600, X(-300) - 90, "5.60 m");
    dimV(5700, 8400, X(-300) - 90, "2.70 m");
    dimV(0, 8400, X(-300) - 170, "8.40 m");
    dimV(0, 4000, X(6300) + 90, "4.00 m");
    dimV(4100, 5600, X(6300) + 90, "1.50 m");
    dimV(5700, 8400, X(6300) + 90, "2.70 m");

    g.font = "16px Arial, Helvetica, sans-serif";
    g.fillStyle = "#555555";
    g.fillText("Fictieve woning — testplattegrond MaatKlaar", W / 2, H - 24);

    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  writeFileSync(path.join(out, "plattegrond-wanden.png"), Buffer.from(bytes));
  await browser.close();
}

await appartement();
await woonkamer();
await lvorm();
await zonderSchaal();
await brokenFiles();
await scans();
await wandenPlan();
console.log("Fixtures geschreven naar fixtures/");
