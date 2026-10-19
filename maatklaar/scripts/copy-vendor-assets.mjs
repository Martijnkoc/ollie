// Copies the browser-side PDF and OCR engines from node_modules into public/vendor, so that
// plattegronden are processed on the user's device without loading code or language data from a CDN.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nm = path.join(root, "node_modules");
const out = path.join(root, "public", "vendor");

function copy(from, to) {
  const src = path.join(nm, from);
  if (!existsSync(src)) throw new Error(`Ontbrekend bestand: ${from}. Draai eerst npm install.`);
  mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  cpSync(src, path.join(out, to), { recursive: true });
}

rmSync(out, { recursive: true, force: true });

// PDF.js: worker, standard fonts, CMaps and the wasm image decoders.
// Legacy build: the modern one relies on very recent JS APIs that many browsers do not ship yet.
copy("pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs");
copy("pdfjs-dist/standard_fonts", "pdfjs/standard_fonts");
copy("pdfjs-dist/cmaps", "pdfjs/cmaps");
copy("pdfjs-dist/wasm", "pdfjs/wasm");
copy("pdfjs-dist/iccs", "pdfjs/iccs");
copy("pdfjs-dist/LICENSE", "pdfjs/LICENSE");

// Tesseract.js: worker, every core build (it picks SIMD/LSTM at runtime) and Dutch LSTM language data.
copy("tesseract.js/dist/worker.min.js", "tesseract/worker.min.js");
copy("tesseract.js/LICENSE.md", "tesseract/LICENSE.md");
for (const file of readdirSync(path.join(nm, "tesseract.js-core"))) {
  if (file.endsWith(".wasm.js") || file === "LICENSE") copy(`tesseract.js-core/${file}`, `tesseract/core/${file}`);
}
copy("@tesseract.js-data/nld/4.0.0_best_int/nld.traineddata.gz", "tesseract/lang/nld.traineddata.gz");

console.log("Vendor-bestanden gekopieerd naar public/vendor");
