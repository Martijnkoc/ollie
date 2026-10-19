import { LIMITS } from "@/config/site";
import { imageDimensions, sniffKind, type FileKind } from "./sniff";

const MIME_FOR_KIND: Record<FileKind, string[]> = {
  pdf: ["application/pdf", "application/x-pdf"],
  png: ["image/png"],
  jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"],
  webp: ["image/webp"],
};

/** Pickers on some phones send no type or a generic one; then the content alone decides. */
const UNKNOWN_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);

const LABEL: Record<FileKind, string> = { pdf: "PDF", png: "PNG", jpeg: "JPG", webp: "WEBP" };

export type UploadCheck =
  { ok: true; kind: FileKind; width: number | null; height: number | null; notes: string[] } | { ok: false; error: string };

export type UploadLimits = Pick<typeof LIMITS, "maxUploadBytes" | "maxImagePixels" | "minImageWidthPx">;

/**
 * Validates an upload before any parser touches it: size, content signature, declared MIME type and,
 * for images, the pixel dimensions from the header. The file name/extension is never trusted.
 * `bytes` must be the whole file (needed for JPEG headers that sit after large metadata blocks).
 */
export function checkUpload(file: { type: string; size: number }, bytes: Uint8Array, limits: UploadLimits = LIMITS): UploadCheck {
  const mb = Math.round(limits.maxUploadBytes / (1024 * 1024));
  if (file.size === 0 || bytes.length === 0) return { ok: false, error: "Dit bestand is leeg. Kies een ander bestand." };
  if (file.size > limits.maxUploadBytes)
    return { ok: false, error: `Dit bestand is groter dan ${mb} MB. Verklein het of exporteer alleen de pagina met de plattegrond.` };

  const kind = sniffKind(bytes);
  if (!kind)
    return {
      ok: false,
      error:
        "Dit is geen PDF, JPG, PNG of WEBP, of het bestand is beschadigd. Een andere extensie geven helpt niet: we kijken naar de inhoud.",
    };

  const declared = file.type.trim().toLowerCase();
  const notes: string[] = [];
  if (!UNKNOWN_MIME.has(declared)) {
    const matchesSomeKind = Object.values(MIME_FOR_KIND).some((list) => list.includes(declared));
    if (!matchesSomeKind)
      return { ok: false, error: `Dit bestandstype (${declared}) ondersteunen we niet. Gebruik PDF, JPG, PNG of WEBP.` };
    if (!MIME_FOR_KIND[kind].includes(declared)) {
      return {
        ok: false,
        error: `Het bestand zegt ${declared} te zijn, maar de inhoud is ${LABEL[kind]}. Sla het opnieuw op als ${LABEL[kind]} en probeer het nog eens.`,
      };
    }
  }

  if (kind === "pdf") {
    const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
    if (!tail.includes("%%EOF")) notes.push("Het einde van de PDF ontbreekt; mogelijk is het bestand niet volledig gedownload.");
    return { ok: true, kind, width: null, height: null, notes };
  }

  const dims = imageDimensions(bytes, kind);
  if (!dims || dims.width === 0 || dims.height === 0)
    return { ok: false, error: "We kunnen de afmetingen van deze afbeelding niet lezen. Het bestand is mogelijk beschadigd." };
  if (dims.width * dims.height > limits.maxImagePixels) {
    return {
      ok: false,
      error: `Deze afbeelding is te groot (${dims.width} × ${dims.height} pixels). Verklein hem tot maximaal ${Math.round(limits.maxImagePixels / 1_000_000)} megapixel.`,
    };
  }
  if (dims.width < limits.minImageWidthPx) {
    notes.push(`De afbeelding is smal (${dims.width} pixels breed). Kleine teksten en maten zijn dan vaak niet goed leesbaar.`);
  }
  return { ok: true, kind, width: dims.width, height: dims.height, notes };
}
