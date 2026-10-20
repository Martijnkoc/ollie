// Writes src/app/favicon.ico from src/app/icon.svg (16, 32 and 48 px PNGs in one ICO), for browsers and tools
// that only ask for /favicon.ico. Run after changing the mark: node scripts/make-favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = path.resolve(import.meta.dirname, "..");
const svg = readFileSync(path.join(root, "src/app/icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg.replace("<svg ", `<svg width="${s}" height="${s}" `)}`,
  );
  pngs.push(await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }));
}
await browser.close();

// ICO: 6-byte header, a 16-byte entry per image, then the PNG data.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0);
  e.writeUInt8(s === 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
writeFileSync(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, ...entries, ...pngs]));
console.log("favicon.ico geschreven");
